"use strict";
// ============================================================
// FINAL PEOPLE (EMAIL) — Route Handler
// ============================================================
// Data source : Cloud SQL PostgreSQL (final.people)
// Filter      : Only rows where an email column is non-empty
//
// Architecture:
//   • All READ queries  → Cloud SQL (final.people) with email filter
//   • POST /refresh     → Clears Redis stats cache + schema cache
//   • GET  /health      → Cloud SQL connectivity + row count
// ============================================================

const express = require("express");
const router  = express.Router();

const { query: pgQuery } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");
const logger = require("../utils/logger").forAgent("FinalPeopleEmailDB");

// ── Table config ───────────────────────────────────────────
const FP_SCHEMA  = "final";
const FP_TABLE   = "people";
const FULL_TABLE = `"${FP_SCHEMA}"."${FP_TABLE}"`;

// ── Cache ──────────────────────────────────────────────────
const STATS_KEY       = "cache:final-people-email-stats";
const COUNT_CACHE_KEY = "cache:final-people-email-count";
const STATS_TTL       = 300; // 5 min
const COUNT_TTL       = 120; // 2 min

// Columns to exclude from SELECT output
const SKIP_IN_SELECT = new Set(["_row_hash", "embedding"]);

// ── In-memory schema cache ─────────────────────────────────
let _schemaCache    = null;
let _emailColCache  = null; // resolved email column name

async function getSchema() {
  if (_schemaCache) return _schemaCache;

  const res = await pgQuery(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [FP_SCHEMA, FP_TABLE]
  );

  const actualCols = res.rows.map(r => r.column_name);
  const selectCols = actualCols.filter(c => !SKIP_IN_SELECT.has(c));
  const selectSQL  = selectCols.map(c => `"${c}"`).join(", ");

  const colToField = {};
  const fieldToCol = {};
  for (const col of selectCols) {
    colToField[col] = col;
    if (!fieldToCol[col]) fieldToCol[col] = col;
  }

  logger.info(`[CloudSQL] FinalPeopleEmail Schema — ${actualCols.length} cols, ${selectCols.length} selected`);
  _schemaCache = { actualCols, selectCols, selectSQL, fieldToCol, colToField };
  return _schemaCache;
}

/** Find the actual email column name in the table schema */
async function getEmailCol(schema) {
  if (_emailColCache) return _emailColCache;
  const emailCandidates = ["email", "email_address", "work_email", "personal_email", "contact_email"];
  for (const col of emailCandidates) {
    if (schema.actualCols.includes(col)) {
      _emailColCache = col;
      return col;
    }
  }
  // Fallback: find any column whose name contains "email"
  const found = schema.actualCols.find(c => c.toLowerCase().includes("email"));
  _emailColCache = found || null;
  return _emailColCache;
}

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
// WHERE CLAUSE BUILDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function buildWhere({ search = "" }, schema) {
  const { selectCols } = schema;
  const emailCol = await getEmailCol(schema);

  const conditions = [];
  const values     = [];
  let   idx        = 1;

  // Base filter: must have email
  if (emailCol) {
    conditions.push(`("${emailCol}" IS NOT NULL AND "${emailCol}" <> '')`);
  }

  if (search) {
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
    nextIdx: idx,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /health
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/health", async (req, res) => {
  try {
    const pingRes = await pgQuery("SELECT NOW() AS now");
    const schema  = await getSchema();
    const emailCol = await getEmailCol(schema);
    let totalRecords = 0;
    try {
      const filter = emailCol
        ? `WHERE "${emailCol}" IS NOT NULL AND "${emailCol}" <> ''`
        : "";
      const cnt = await pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${filter}`);
      totalRecords = parseInt(cnt.rows[0].cnt, 10);
    } catch (_) {}
    res.json({ ok: true, source: "cloud_sql", table: FULL_TABLE,
      serverTime: pingRes.rows[0].now, totalRecords, filter: "email" });
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
    res.json({ columns: selectCols, source: "cloud_sql", table: FP_TABLE, filter: "email" });
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

    const schema   = await getSchema();
    const emailCol = await getEmailCol(schema);
    const filter   = emailCol
      ? `WHERE "${emailCol}" IS NOT NULL AND "${emailCol}" <> ''`
      : "";

    const totalRes = await pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${filter}`);
    const payload = {
      total:  parseInt(totalRes.rows[0].cnt, 10),
      source: "cloud_sql",
      table:  FP_TABLE,
      filter: "email",
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
    _schemaCache   = null;
    _emailColCache = null;
    await cacheDel(STATS_KEY);
    await cacheDel(COUNT_CACHE_KEY);
    res.json({ success: true, message: "Final People (Email) cache cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /  (paginated list — email-filtered)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    const { whereStr, values, nextIdx } = await buildWhere({ search }, schema);

    let orderClause = "";
    if (sort_by && selectCols.includes(sort_by)) {
      const dir = sort_dir === "desc" ? "DESC" : "ASC";
      orderClause = `ORDER BY "${sort_by}" ${dir} NULLS LAST`;
    }

    const dataSQL = `
      SELECT ${selectSQL} FROM ${FULL_TABLE}
      ${whereStr}
      ${orderClause}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;

    let total;
    if (!search) {
      const cachedCount = await cacheGet(COUNT_CACHE_KEY);
      if (cachedCount !== null && cachedCount !== undefined) {
        total = cachedCount;
      } else {
        const countRes = await pgQuery(
          `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${whereStr}`,
          values,
          60000
        );
        total = parseInt(countRes.rows[0].cnt, 10);
        await cacheSet(COUNT_CACHE_KEY, total, COUNT_TTL);
      }
    } else {
      const countRes = await pgQuery(
        `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${whereStr}`,
        values,
        60000
      );
      total = parseInt(countRes.rows[0].cnt, 10);
    }

    const dataRes = await pgQuery(dataSQL, [...values, limitNum, offset], 60000);
    const records = dataRes.rows.map(row => normalizeRow(schema, row));

    res.json({
      records,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
      source: "cloud_sql",
      table:  FP_TABLE,
      filter: "email",
    });
  } catch (err) {
    logger.error(`[GET /] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
