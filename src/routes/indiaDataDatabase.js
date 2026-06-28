"use strict";
// ============================================================
// INDIA DATA — Route Handler
// ============================================================
// Data source : Cloud SQL PostgreSQL (public.india_data)
// Instance    : sigma-current-497209-i6:us-central1:leader (34.71.167.187)
// Database    : doott
//
// Architecture:
//   • All READ queries  → Cloud SQL (public.india_data)
//   • POST /refresh     → Clears Redis stats cache + schema cache
//   • GET  /health      → Cloud SQL connectivity + row count
//
// Uses the same Cloud SQL connection pool as inbuildDatabase.
// ============================================================

const express = require("express");
const router  = express.Router();

const { query: pgQuery } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");
const logger = require("../utils/logger").forAgent("IndiaDataDB");

// ── Table config ───────────────────────────────────────────
const IN_SCHEMA  = "public";
const IN_TABLE   = "india_data";
const FULL_TABLE = `"${IN_SCHEMA}"."${IN_TABLE}"`;

// ── Cache ──────────────────────────────────────────────────
const STATS_KEY = "cache:india-data-stats";
const STATS_TTL = 300; // 5 min

// Columns to exclude from SELECT output
const SKIP_IN_SELECT = new Set(["_row_hash", "embedding", "uuid", "company_uuid", "id", "_id"]);

// ── In-memory schema cache ─────────────────────────────────
let _schemaCache = null;

async function getSchema() {
  if (_schemaCache) return _schemaCache;

  const res = await pgQuery(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [IN_SCHEMA, IN_TABLE]
  );

  const actualCols = res.rows.map(r => r.column_name);
  const selectCols = actualCols.filter(c => !SKIP_IN_SELECT.has(c));
  const selectSQL  = selectCols.map(c => `"${c}"`).join(", ");

  // Build field mappings — use column names directly as API fields
  const colToField = {};
  const fieldToCol = {};

  for (const col of selectCols) {
    const field = col;
    colToField[col] = field;
    if (!fieldToCol[field]) fieldToCol[field] = col;
  }

  logger.info(`[CloudSQL] IndiaData Schema — ${actualCols.length} cols, ${selectCols.length} selected`);
  _schemaCache = { actualCols, selectCols, selectSQL, fieldToCol, colToField };
  return _schemaCache;
}

/** Normalise a raw DB row → standard API shape */
function normalizeRow({ selectCols, colToField }, row) {
  const out = {};
  for (const col of selectCols) {
    const field = colToField[col] || col;
    const val   = row[col];
    out[field] = val !== null && val !== undefined ? String(val) : "";
  }
  return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHERE CLAUSE BUILDER (fully parameterised)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildWhere({ search = "" }, { selectCols }) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (search) {
    // Search across all text-like columns (up to first 6 for performance)
    const searchTargets = selectCols.slice(0, 8);
    const searchCols = searchTargets.map(c => `"${c}"::text ILIKE $${idx}`);
    if (searchCols.length > 0) {
      conditions.push(`(${searchCols.join(" OR ")})`);
      values.push(`%${search}%`);
      idx++;
    }
  }

  return {
    whereStr: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
    nextIdx:  idx,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /health
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/health", async (req, res) => {
  try {
    const pingRes = await pgQuery("SELECT NOW() AS now");
    let totalRecords = 0;
    try {
      const cnt = await pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}`);
      totalRecords = parseInt(cnt.rows[0].cnt, 10);
    } catch (_) {}
    res.json({ ok: true, source: "cloud_sql", table: FULL_TABLE,
      serverTime: pingRes.rows[0].now, totalRecords });
  } catch (err) {
    logger.error(`[health] ${err.message}`);
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /columns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/columns", async (req, res) => {
  try {
    const { selectCols } = await getSchema();
    res.json({ columns: selectCols, source: "cloud_sql", table: IN_TABLE });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/stats", async (req, res) => {
  try {
    const cached = await cacheGet(STATS_KEY);
    if (cached) return res.json({ ...cached, _cache: "hit" });

    const [totalRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}`),
    ]);

    const payload = {
      total:  parseInt(totalRes.rows[0].cnt, 10),
      source: "cloud_sql",
      table:  IN_TABLE,
    };

    await cacheSet(STATS_KEY, payload, STATS_TTL);
    res.json(payload);
  } catch (err) {
    logger.error(`[stats] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /refresh
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/refresh", async (req, res) => {
  try {
    _schemaCache = null;
    await cacheDel(STATS_KEY);
    res.json({ success: true, message: "India Data cache cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Count cache (avoids re-counting 18.5M rows every request) ──
const COUNT_CACHE_KEY = "cache:india-data-count";
const COUNT_CACHE_TTL = 120; // 2 min

router.get("/", async (req, res) => {
  const {
    page      = 1,
    limit     = 50,
    search    = "",
    sort_by   = "",
    sort_dir  = "asc",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    const schema = await getSchema();
    const { selectSQL, selectCols } = schema;

    const { whereStr, values, nextIdx } = buildWhere({ search }, schema);

    // For 18M+ rows: skip ORDER BY unless user explicitly sorts → use natural row order (fast seq scan)
    let orderClause = "";
    if (sort_by && selectCols.includes(sort_by)) {
      const sortDirection = sort_dir === "desc" ? "DESC" : "ASC";
      orderClause = `ORDER BY "${sort_by}" ${sortDirection} NULLS LAST`;
    }

    const dataSQL = `
      SELECT ${selectSQL} FROM ${FULL_TABLE}
      ${whereStr}
      ${orderClause}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;

    // Use cached count when no search filter (avoids counting 18M rows every page)
    let total;
    if (!search) {
      const cachedCount = await cacheGet(COUNT_CACHE_KEY);
      if (cachedCount !== null && cachedCount !== undefined) {
        total = cachedCount;
      } else {
        const countSQL = `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}`;
        const countRes = await pgQuery(countSQL, [], 60000);
        total = parseInt(countRes.rows[0].cnt, 10);
        await cacheSet(COUNT_CACHE_KEY, total, COUNT_CACHE_TTL);
      }
    } else {
      const countSQL = `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${whereStr}`;
      const countRes = await pgQuery(countSQL, values, 60000);
      total = parseInt(countRes.rows[0].cnt, 10);
    }

    // Data query with extended timeout for large table
    const dataRes = await pgQuery(dataSQL, [...values, limitNum, offset], 60000);
    const records = dataRes.rows.map(row => normalizeRow(schema, row));

    res.json({
      records,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
      source: "cloud_sql",
      table:  IN_TABLE,
    });
  } catch (err) {
    logger.error(`[GET /] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
