// ============================================================
// KNOWLEDGE INGEST SERVICE
// ============================================================
// Handles:
//  - Text block ingestion (type="text")
//  - File upload ingestion: PDF (pdf-parse) and TXT
//  - Auto-seeding from Organization model
//  - Chunking strategy: fixed-size with overlap
//  - Re-embedding on edit
//  - Source deletion (cascades to chunks)
// ============================================================

"use strict";

const {
  ChatKnowledgeSource,
  ChatKnowledgeChunk,
  Organization,
} = require("../db/mongoose");
const { embedText } = require("./chatbotService");
const logger = require("../utils/logger").forAgent("KnowledgeIngest");

// ── Chunking config ───────────────────────────────────────────
const CHUNK_SIZE = 600;    // target chars per chunk
const CHUNK_OVERLAP = 80;  // overlap chars between adjacent chunks
const MIN_CHUNK_SIZE = 50; // ignore tiny chunks

/**
 * Split text into overlapping chunks.
 * Tries to break on sentence/paragraph boundaries.
 */
function chunkText(text) {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= CHUNK_SIZE) return [cleaned];

  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = start + CHUNK_SIZE;
    if (end < cleaned.length) {
      // Try to break on paragraph, then sentence, then space
      const para = cleaned.lastIndexOf("\n\n", end);
      const sentence = cleaned.lastIndexOf(". ", end);
      const space = cleaned.lastIndexOf(" ", end);
      if (para > start + MIN_CHUNK_SIZE) end = para + 2;
      else if (sentence > start + MIN_CHUNK_SIZE) end = sentence + 2;
      else if (space > start + MIN_CHUNK_SIZE) end = space + 1;
    }
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_SIZE) chunks.push(chunk);
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

/**
 * Embed all chunks and save them to MongoDB.
 */
async function saveChunks(orgId, sourceId, sourceName, sourceType, uploadedBy, chunks) {
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
 * @param {string} orgId
 * @param {string} userId
 * @param {string} name     — human-readable source name
 * @param {string} text     — raw text content
 * @returns {Promise<Object>} — the created ChatKnowledgeSource
 */
async function ingestText(orgId, userId, name, text) {
  // Create source record (status=processing)
  const source = await ChatKnowledgeSource.create({
    orgId,
    name,
    type: "text",
    rawContent: text,
    status: "processing",
    uploadedBy: userId,
  });

  try {
    const chunks = chunkText(text);
    const chunkCount = await saveChunks(orgId, source._id, name, "text", userId, chunks);
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
      status: "ready",
      chunkCount,
    });
    logger.info(`Ingested text source "${name}" → ${chunkCount} chunks`);
    return { ...source.toObject(), status: "ready", chunkCount };
  } catch (err) {
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
      status: "error",
      errorMessage: err.message,
    });
    logger.error(`Failed to ingest text source "${name}": ${err.message}`);
    throw err;
  }
}

/**
 * Ingest a file upload (PDF or TXT).
 * @param {string} orgId
 * @param {string} userId
 * @param {Object} file  — multer file object { originalname, mimetype, buffer }
 * @returns {Promise<Object>} — the created ChatKnowledgeSource
 */
async function ingestFile(orgId, userId, file) {
  const name = file.originalname || "Uploaded File";
  const mimeType = file.mimetype || "text/plain";

  // Create source record
  const source = await ChatKnowledgeSource.create({
    orgId,
    name,
    type: "file",
    fileName: name,
    mimeType,
    status: "processing",
    uploadedBy: userId,
  });

  try {
    let rawText = "";

    if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      // Use pdf-parse
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(file.buffer);
      rawText = pdfData.text;
    } else {
      // Treat as plain text / TXT / DOCX-as-text
      rawText = file.buffer.toString("utf-8");
    }

    if (!rawText || rawText.trim().length < 10) {
      throw new Error("Extracted text is too short or empty");
    }

    // Save raw content to source
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, { rawContent: rawText });

    const chunks = chunkText(rawText);
    const chunkCount = await saveChunks(orgId, source._id, name, "file", userId, chunks);

    await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
      status: "ready",
      chunkCount,
    });

    logger.info(`Ingested file "${name}" (${mimeType}) → ${chunkCount} chunks`);
    return { ...source.toObject(), rawContent: rawText, status: "ready", chunkCount };
  } catch (err) {
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
      status: "error",
      errorMessage: err.message,
    });
    logger.error(`Failed to ingest file "${name}": ${err.message}`);
    throw err;
  }
}

/**
 * Auto-seed organization metadata as initial knowledge.
 * Called when the org's chatbot knowledge base is empty.
 * @param {string} orgId
 */
async function autoSeedOrgKnowledge(orgId) {
  try {
    const existing = await ChatKnowledgeSource.countDocuments({ orgId });
    if (existing > 0) return; // already has knowledge

    const org = await Organization.findById(orgId).lean();
    if (!org) return;

    const seedText = [
      `Organization Name: ${org.name}`,
      org.industry ? `Industry: ${org.industry}` : null,
      org.website ? `Website: ${org.website}` : null,
      `Plan: ${org.plan || "free"}`,
      `Slug / ID: ${org.slug}`,
    ]
      .filter(Boolean)
      .join("\n");

    await ingestText(orgId, null, "Organization Profile (Auto-seeded)", seedText);
    logger.info(`Auto-seeded knowledge base for org: ${org.name}`);
  } catch (err) {
    logger.warn(`Auto-seed failed for org ${orgId}: ${err.message}`);
  }
}

/**
 * Update the text of an existing source and re-embed it.
 * @param {string} orgId
 * @param {string} sourceId
 * @param {string} newText
 */
async function updateSource(orgId, sourceId, newText) {
  const source = await ChatKnowledgeSource.findOne({ _id: sourceId, orgId });
  if (!source) throw new Error("Source not found");

  // Delete old chunks
  await ChatKnowledgeChunk.deleteMany({ sourceId: source._id });

  // Update source with new content + set back to processing
  await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
    rawContent: newText,
    status: "processing",
    chunkCount: 0,
    errorMessage: null,
  });

  try {
    const chunks = chunkText(newText);
    const chunkCount = await saveChunks(
      orgId, source._id, source.name, source.type, source.uploadedBy, chunks
    );
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
      status: "ready",
      chunkCount,
    });
    logger.info(`Re-ingested source "${source.name}" → ${chunkCount} chunks`);
    return await ChatKnowledgeSource.findById(source._id).lean();
  } catch (err) {
    await ChatKnowledgeSource.findByIdAndUpdate(source._id, {
      status: "error",
      errorMessage: err.message,
    });
    throw err;
  }
}

/**
 * Delete a knowledge source and all its chunks.
 * @param {string} orgId
 * @param {string} sourceId
 */
async function deleteSource(orgId, sourceId) {
  const source = await ChatKnowledgeSource.findOne({ _id: sourceId, orgId });
  if (!source) throw new Error("Source not found");

  await ChatKnowledgeChunk.deleteMany({ sourceId: source._id });
  await ChatKnowledgeSource.findByIdAndDelete(source._id);
  logger.info(`Deleted source "${source.name}" and all its chunks`);
}

module.exports = {
  ingestText,
  ingestFile,
  deleteSource,
  updateSource,
  autoSeedOrgKnowledge,
  chunkText,
};
