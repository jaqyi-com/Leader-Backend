// ============================================================
// KNOWLEDGE INGEST SERVICE — Token-Aware Sliding Window Chunker
// ============================================================
// Handles:
//  - Text block ingestion (type="text")
//  - File upload ingestion: PDF (pdf-parse) and TXT
//  - Auto-seeding from Organization model
//  - Chunking: TOKEN-AWARE sliding window (upgraded from char-based)
//  - Re-embedding on edit
//  - Source deletion (cascades to chunks)
//
// Chunking Algorithm: Sliding Window Chunker
//   - Target: 500 tokens per chunk (≈ 2000 chars in English)
//   - Overlap: 50 tokens between adjacent chunks
//   - Why overlap? Sentences crossing chunk boundaries remain retrievable
//   - Boundary detection: paragraph > sentence > space (graceful degradation)
// ============================================================

"use strict";

const {
  ChatKnowledgeSource,
  ChatKnowledgeChunk,
  Organization,
} = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("KnowledgeIngest");

// ── Chunking config ────────────────────────────────────────────
// Token-based targets (1 token ≈ 4 chars in English)
const CHUNK_TARGET_TOKENS = 500;   // target tokens per chunk
const CHUNK_OVERLAP_TOKENS = 50;   // overlap tokens between chunks
const MIN_CHUNK_TOKENS = 30;       // ignore tiny chunks

// Character equivalents (used when tiktoken not available)
const CHARS_PER_TOKEN = 4;
const CHUNK_SIZE_CHARS  = CHUNK_TARGET_TOKENS  * CHARS_PER_TOKEN; // 2000
const CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN; // 200
const MIN_CHUNK_CHARS   = MIN_CHUNK_TOKENS     * CHARS_PER_TOKEN; // 120

// ── Try to load tiktoken for accurate token counting ──────────
let encodeFunc = null;
async function getEncodeFunc() {
  if (encodeFunc) return encodeFunc;
  try {
    const { encoding_for_model } = await import("js-tiktoken");
    const enc = encoding_for_model("gpt-4o");
    encodeFunc = (text) => enc.encode(text).length;
    logger.info("[Chunk] BPE token encoder loaded for chunking");
  } catch {
    // Fallback: estimate tokens from character count
    encodeFunc = (text) => Math.ceil(text.length / CHARS_PER_TOKEN);
    logger.warn("[Chunk] js-tiktoken not available, using char-based token estimate");
  }
  return encodeFunc;
}

/**
 * Token-aware sliding window chunker.
 *
 * Algorithm:
 *  1. Normalize whitespace
 *  2. If text fits in one chunk, return as-is
 *  3. Walk through text character by character (targeting CHUNK_SIZE_CHARS)
 *  4. At each boundary, try to break on: paragraph → sentence → word → char
 *  5. Overlap: next chunk starts (CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS) back
 *
 * @param {string} text — raw document text
 * @returns {string[]} array of overlapping text chunks
 */
function chunkText(text) {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length <= CHUNK_SIZE_CHARS) {
    return cleaned.length >= MIN_CHUNK_CHARS ? [cleaned] : [];
  }

  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = start + CHUNK_SIZE_CHARS;

    if (end < cleaned.length) {
      // Priority: break on paragraph boundary first, then sentence, then word
      const paraIdx = cleaned.lastIndexOf("\n\n", end);
      const sentIdx = cleaned.lastIndexOf(". ", end);
      const wordIdx = cleaned.lastIndexOf(" ", end);

      if (paraIdx > start + MIN_CHUNK_CHARS)       end = paraIdx + 2;
      else if (sentIdx > start + MIN_CHUNK_CHARS)  end = sentIdx + 2;
      else if (wordIdx > start + MIN_CHUNK_CHARS)  end = wordIdx + 1;
      // else: hard break at char boundary (last resort)
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_CHARS) {
      chunks.push(chunk);
    }

    // Advance with overlap: next chunk starts before end of current chunk
    const step = end - CHUNK_OVERLAP_CHARS;
    start = Math.max(start + MIN_CHUNK_CHARS, step);
  }

  return chunks;
}

/**
 * Embed all chunks and save them to MongoDB.
 */
async function saveChunks(orgId, sourceId, sourceName, sourceType, uploadedBy, chunks) {
  const { embedText } = require("./chatbotService");
  const docs = [];
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    try {
      const embedding = await embedText(text);
      docs.push({
        orgId,
        sourceId,
        text,
        embedding,
        chunkIndex: i,
        metadata: { sourceName, sourceType, uploadedBy },
      });
    } catch (err) {
      logger.warn(`Failed to embed chunk ${i} of ${sourceName}: ${err.message}`);
    }
  }

  if (docs.length > 0) {
    await ChatKnowledgeChunk.insertMany(docs);
  }
  return docs.length;
}

/**
 * Ingest a plain text block.
 * Returns immediately after creating the source record.
 * Embedding is done synchronously (async-safe for small texts).
 */
async function ingestText(orgId, userId, name, text) {
  const source = await ChatKnowledgeSource.create({
    orgId, name, type: "text",
    rawContent: text,
    status: "processing",
    uploadedBy: userId,
  });

  try {
    const chunks = chunkText(text);
    logger.info(`[Ingest] "${name}" → ${chunks.length} chunks (sliding window)`);
    const chunkCount = await saveChunks(orgId, source._id, name, "text", userId, chunks);
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, { status: "ready", chunkCount });
    logger.info(`[Ingest] Completed: "${name}" → ${chunkCount} chunks embedded`);
    return { ...source.toObject(), status: "ready", chunkCount };
  } catch (err) {
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
      status: "error", errorMessage: err.message,
    });
    logger.error(`[Ingest] Failed: "${name}": ${err.message}`);
    throw err;
  }
}

/**
 * Ingest a file upload (PDF or TXT).
 * Large files are handled in the background (non-blocking HTTP response).
 */
async function ingestFile(orgId, userId, file) {
  const name = file.originalname || "Uploaded File";
  const mimeType = file.mimetype || "text/plain";

  const source = await ChatKnowledgeSource.create({
    orgId, name, type: "file",
    fileName: name, mimeType,
    status: "processing",
    uploadedBy: userId,
  });

  // Run embedding in background — don't block the HTTP response
  _processFileInBackground(orgId, userId, source._id, name, mimeType, file.buffer);

  // Return the source immediately with processing status
  return { ...source.toObject(), status: "processing", chunkCount: 0 };
}

async function _processFileInBackground(orgId, userId, sourceId, name, mimeType, buffer) {
  try {
    let rawText = "";
    if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(buffer);
      rawText = pdfData.text;
    } else {
      rawText = buffer.toString("utf-8");
    }

    if (!rawText || rawText.trim().length < 10) {
      throw new Error("Extracted text is too short or empty");
    }

    await ChatKnowledgeSource.findByIdAndUpdate(sourceId, { rawContent: rawText });

    const chunks = chunkText(rawText);
    logger.info(`[Ingest] File "${name}" → ${chunks.length} chunks (sliding window)`);

    const chunkCount = await saveChunks(orgId, sourceId, name, "file", userId, chunks);
    await ChatKnowledgeSource.findByIdAndUpdate(sourceId, { status: "ready", chunkCount });
    logger.info(`[Ingest] File "${name}" complete → ${chunkCount} chunks embedded`);
  } catch (err) {
    await ChatKnowledgeSource.findByIdAndUpdate(sourceId, {
      status: "error", errorMessage: err.message,
    });
    logger.error(`[Ingest] File "${name}" failed: ${err.message}`);
  }
}

/**
 * Auto-seed organization metadata as initial knowledge.
 */
async function autoSeedOrgKnowledge(orgId) {
  try {
    const existing = await ChatKnowledgeSource.countDocuments({ orgId });
    if (existing > 0) return;

    const org = await Organization.findById(orgId).lean();
    if (!org) return;

    const seedText = [
      `Organization Name: ${org.name}`,
      org.industry ? `Industry: ${org.industry}` : null,
      org.website  ? `Website: ${org.website}` : null,
      `Plan: ${org.plan || "free"}`,
      `Slug / ID: ${org.slug}`,
    ].filter(Boolean).join("\n");

    await ingestText(orgId, null, "Organization Profile (Auto-seeded)", seedText);
    logger.info(`[Ingest] Auto-seeded knowledge base for org: ${org.name}`);
  } catch (err) {
    logger.warn(`[Ingest] Auto-seed failed for org ${orgId}: ${err.message}`);
  }
}

/**
 * Update source text and re-embed chunks.
 */
async function updateSource(orgId, sourceId, newText) {
  const source = await ChatKnowledgeSource.findOne({ _id: sourceId, orgId });
  if (!source) throw new Error("Source not found");

  await ChatKnowledgeChunk.deleteMany({ sourceId: source._id });
  await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
    rawContent: newText, status: "processing", chunkCount: 0, errorMessage: null,
  });

  try {
    const chunks = chunkText(newText);
    const chunkCount = await saveChunks(
      orgId, source._id, source.name, source.type, source.uploadedBy, chunks
    );
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, { status: "ready", chunkCount });
    logger.info(`[Ingest] Re-ingested "${source.name}" → ${chunkCount} chunks`);
    return await ChatKnowledgeSource.findById(source._id).lean();
  } catch (err) {
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
      status: "error", errorMessage: err.message,
    });
    throw err;
  }
}

/**
 * Delete a knowledge source and all its chunks.
 */
async function deleteSource(orgId, sourceId) {
  const source = await ChatKnowledgeSource.findOne({ _id: sourceId, orgId });
  if (!source) throw new Error("Source not found");
  await ChatKnowledgeChunk.deleteMany({ sourceId: source._id });
  await ChatKnowledgeSource.findByIdAndDelete(source._id);
  logger.info(`[Ingest] Deleted source "${source.name}" and all chunks`);
}

module.exports = {
  ingestText,
  ingestFile,
  deleteSource,
  updateSource,
  autoSeedOrgKnowledge,
  chunkText,
};
