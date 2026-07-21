"use strict";

// ============================================================
// EMBED SERVICE — all-MiniLM-L6-v2 (384-dim)
// ============================================================
// Uses Hugging Face Inference API so this works on Vercel serverless.
// The Python subprocess approach (execFile python3) doesn't work on Vercel.
//
// Model: sentence-transformers/all-MiniLM-L6-v2
// Dims : 384  ← matches all HNSW indexes in Neon
// ============================================================

const logger = require("../utils/logger").forAgent("LocalEmbedService");

const HF_API_URL = "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2";
const HF_TOKEN   = process.env.HUGGINGFACE_TOKEN || "";   // optional — rate limited without it

/**
 * Generate a 384-dimensional embedding using HuggingFace Inference API.
 * Falls back to null (→ structured search) if HF is unavailable.
 *
 * @param {string} query  The text to embed
 * @returns {Promise<number[]|null>}  384-dim float array, or null on failure
 */
async function getLocalQueryEmbedding(query) {
  if (!query || typeof query !== "string") return null;

  try {
    const headers = { "Content-Type": "application/json" };
    if (HF_TOKEN) headers["Authorization"] = `Bearer ${HF_TOKEN}`;

    const resp = await fetch(HF_API_URL, {
      method:  "POST",
      headers,
      body:    JSON.stringify({ inputs: query.trim() }),
      signal:  AbortSignal.timeout(8000),  // 8s timeout — don't block the whole request
    });

    if (!resp.ok) {
      // HF model may be loading (503) — treat as soft failure
      logger.warn(`[Embed] HF API ${resp.status} — falling back to structured search`);
      return null;
    }

    const data = await resp.json();

    // HF returns: number[]  (single query → single embedding)
    if (Array.isArray(data) && data.length === 384 && typeof data[0] === "number") {
      logger.info(`[Embed] ✅ 384-dim embedding ready for: "${query.slice(0, 40)}"`);
      return data;
    }

    // Some versions nest it: [[...384 dims...]]
    if (Array.isArray(data) && Array.isArray(data[0]) && data[0].length === 384) {
      logger.info(`[Embed] ✅ 384-dim embedding (nested) ready for: "${query.slice(0, 40)}"`);
      return data[0];
    }

    logger.warn(`[Embed] Unexpected HF response shape — falling back to structured search`);
    return null;

  } catch (err) {
    logger.warn(`[Embed] HF call failed (${err.message}) — falling back to structured search`);
    return null;
  }
}

module.exports = { getLocalQueryEmbedding };
