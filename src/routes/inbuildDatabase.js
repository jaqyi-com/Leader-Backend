"use strict";
// ============================================================
// IN BUILD - DATABASE ROUTE  (Google Sheets backed)
// ============================================================
const express = require("express");
const router  = express.Router();
const OpenAI  = require("openai");
const { sheetsClient, SHEET_IDS } = require("../config/googleSheets");
const { cacheGet, cacheSet }      = require("../db/redis");
const logger = require("../utils/logger").forAgent("InBuildDatabase");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

const CACHE_KEY = "cache:inbuild-database";
const CACHE_TTL = 300; // 5 minutes

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COLUMN NORMALISATION MAP
// Maps common header variations → canonical field names
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const NORMALIZE = {
  "business name":  "name",
  "company name":   "name",
  "business":       "name",
  "phone number":   "phone",
  "phone no":       "phone",
  "mobile":         "phone",
  "website url":    "website",
  "web":            "website",
  "url":            "website",
  "city":           "city_file",
  "region":         "city_file",
  "location":       "city_file",
  "area":           "city_file",
  "star rating":    "rating",
  "google rating":  "rating",
  "stars":          "rating",
  "review count":   "reviews",
  "no. of reviews": "reviews",
  "num reviews":    "reviews",
  "reviews count":  "reviews",
  "business category": "category",
  "type":           "category",
  "street address": "address",
  "full address":   "address",
  "google maps url":"url",
  "maps link":      "url",
  "place url":      "url",
};

function normalizeKey(raw) {
  const lower = raw.trim().toLowerCase();
  return NORMALIZE[lower] || lower.replace(/\s+/g, "_");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER — call Sheets API with a timeout guard (avoids Vercel timeout)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Sheets API timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FETCH ALL ROWS FROM ALL SHEETS  (with Redis cache)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function fetchAllRows() {
  // Try Redis cache first
  try {
    const cached = await cacheGet(CACHE_KEY);
    if (cached && Array.isArray(cached)) {
      logger.info("[InBuildDatabase] Returning cached data.");
      return cached;
    }
  } catch (cacheErr) {
    logger.warn("[InBuildDatabase] Cache read failed (non-fatal):", cacheErr.message);
  }

  if (!sheetsClient || SHEET_IDS.length === 0) {
    logger.warn("[InBuildDatabase] No sheets client or no sheet IDs configured.");
    return [];
  }

  const allRows = [];
  let globalIdx = 0;

  for (const sheetId of SHEET_IDS) {
    try {
      logger.info(`[InBuildDatabase] Fetching sheet: ${sheetId}`);

      const meta = await withTimeout(
        sheetsClient.spreadsheets.get({ spreadsheetId: sheetId })
      );
      const tabs = meta.data.sheets || [];

      for (const tab of tabs) {
        const tabTitle = tab.properties.title;
        try {
          const resp = await withTimeout(
            sheetsClient.spreadsheets.values.get({
              spreadsheetId: sheetId,
              range: tabTitle,
            })
          );

          const rows = resp.data.values || [];
          if (rows.length < 2) continue;

          const rawHeaders = rows[0];
          const headers    = rawHeaders.map(normalizeKey);

          for (let r = 1; r < rows.length; r++) {
            const rowArr = rows[r];
            const obj    = { _id: `gs_${globalIdx++}`, _sheet: sheetId, _tab: tabTitle };
            headers.forEach((h, i) => {
              obj[h] = rowArr[i] !== undefined ? String(rowArr[i]).trim() : "";
            });
            ["name","category","city_file","rating","reviews","phone","address","website","url"]
              .forEach(f => { if (!(f in obj)) obj[f] = ""; });
            allRows.push(obj);
          }
          logger.info(`[InBuildDatabase] Sheet "${sheetId}" / tab "${tabTitle}": ${rows.length - 1} rows.`);
        } catch (tabErr) {
          logger.warn(`[InBuildDatabase] Tab "${tabTitle}" in "${sheetId}" failed: ${tabErr.message}`);
        }
      }
    } catch (err) {
      logger.error(`[InBuildDatabase] Sheet "${sheetId}" failed: ${err.message}`);
    }
  }

  logger.info(`[InBuildDatabase] Total rows: ${allRows.length}`);
  try {
    await cacheSet(CACHE_KEY, allRows, CACHE_TTL);
  } catch (cacheErr) {
    logger.warn("[InBuildDatabase] Cache write failed (non-fatal):", cacheErr.message);
  }
  return allRows;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /health  — diagnostic (no Sheets API call)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    sheetsClientReady: !!sheetsClient,
    sheetCount: SHEET_IDS.length,
    sheetIds: SHEET_IDS.map(id => `${id.slice(0, 8)}…`), // partial for security
    cacheKey: CACHE_KEY,
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IN-MEMORY FILTERING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function applyFilters(rows, { search, category, city, has_phone, has_website }) {
  let data = rows;

  if (search) {
    const q = search.toLowerCase();
    data = data.filter(r =>
      (r.name      || "").toLowerCase().includes(q) ||
      (r.address   || "").toLowerCase().includes(q) ||
      (r.phone     || "").toLowerCase().includes(q) ||
      (r.category  || "").toLowerCase().includes(q) ||
      (r.city_file || "").toLowerCase().includes(q)
    );
  }
  if (category) {
    const q = category.toLowerCase();
    data = data.filter(r => (r.category || "").toLowerCase().includes(q));
  }
  if (city) {
    const q = city.toLowerCase();
    data = data.filter(r => (r.city_file || "").toLowerCase().includes(q));
  }
  if (has_phone === "true")  data = data.filter(r => r.phone && r.phone.trim() !== "");
  if (has_phone === "false") data = data.filter(r => !r.phone || r.phone.trim() === "");
  if (has_website === "true")  data = data.filter(r => r.website && r.website.trim() !== "");
  if (has_website === "false") data = data.filter(r => !r.website || r.website.trim() === "");

  return data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /columns  — return detected column names
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/columns", async (req, res) => {
  try {
    const rows = await fetchAllRows();
    if (!rows.length) return res.json({ columns: [], source: "google_sheets" });

    // Collect all unique column keys across all rows (excluding internal _ fields)
    const colSet = new Set();
    rows.forEach(r => Object.keys(r).forEach(k => { if (!k.startsWith("_")) colSet.add(k); }));
    res.json({ columns: Array.from(colSet), source: "google_sheets" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /  — paginated + filtered list
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", async (req, res) => {
  const {
    page      = 1,
    limit     = 50,
    search    = "",
    category  = "",
    city      = "",
    has_phone = "",
    has_website = "",
    sort_by   = "name",
    sort_dir  = "asc",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    let rows = await fetchAllRows();

    // Apply filters
    rows = applyFilters(rows, { search, category, city, has_phone, has_website });

    // Sort
    const dir = sort_dir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const av = a[sort_by] ?? "";
      const bv = b[sort_by] ?? "";
      // Numeric sort for rating/reviews
      if (sort_by === "rating" || sort_by === "reviews") {
        return (parseFloat(av) - parseFloat(bv)) * dir;
      }
      return av.localeCompare(bv) * dir;
    });

    const total = rows.length;
    const paged = rows.slice(offset, offset + limitNum);

    return res.json({
      leads:  paged,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
      source: "google_sheets",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/stats", async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const total        = rows.length;
    const with_phone   = rows.filter(r => r.phone   && r.phone.trim()   !== "").length;
    const with_website = rows.filter(r => r.website && r.website.trim() !== "").length;
    res.json({ total, with_phone, with_website, source: "google_sheets" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /ai-filter  — natural language → structured filters
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/ai-filter", async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(422).json({ error: "query is required" });

  try {
    const systemPrompt = `You are a database filter assistant. Convert the user's natural language query into structured filter parameters for a business dataset.

Return ONLY valid JSON with any of these optional keys (omit keys that aren't mentioned):
{
  "search": "string",          // general text search across name/address/phone
  "category": "string",        // e.g. "Legal services", "Nail salons"
  "city": "string",            // e.g. "San Antonio", "Dallas"
  "has_phone": "true|false",
  "has_website": "true|false",
  "sort_by": "name|rating|reviews",
  "sort_dir": "asc|desc",
  "summary": "string"          // one sentence explaining what you understood
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: query },
      ],
    });

    const filters = JSON.parse(response.choices[0].message.content);
    res.json({ filters, query });
  } catch (err) {
    res.status(500).json({ error: "AI filter failed: " + err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /refresh  — force-clear Redis cache for this dataset
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/refresh", async (req, res) => {
  try {
    const { cacheDel } = require("../db/redis");
    await cacheDel(CACHE_KEY);
    logger.info("[InBuildDatabase] Cache manually cleared.");
    res.json({ success: true, message: "Cache cleared. Next request will re-fetch from Google Sheets." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
