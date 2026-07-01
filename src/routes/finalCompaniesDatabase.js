"use strict";
// ============================================================
// FINAL COMPANIES — Route Handler
// ============================================================
// Data source : Cloud SQL PostgreSQL (public.final_companies)
// Instance    : sigma-current-497209-i6:us-central1:leader (34.71.167.187)
// Database    : doott
//
// Architecture:
//   • All READ queries  → Cloud SQL (public.final_companies)
//   • POST /refresh     → Clears Redis stats cache + schema cache
//   • GET  /health      → Cloud SQL connectivity + row count
// ============================================================

const express = require("express");
const router  = express.Router();

const { query: pgQuery } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");
const logger = require("../utils/logger").forAgent("FinalCompaniesDB");

// ── Table config ───────────────────────────────────────────
const FC_SCHEMA  = "final";
const FC_TABLE   = "companies";
const FULL_TABLE = `"${FC_SCHEMA}"."${FC_TABLE}"`;

// ── Cache ──────────────────────────────────────────────────
const STATS_KEY       = "cache:final-companies-stats";
const COUNT_CACHE_KEY = "cache:final-companies-count";
const STATS_TTL       = 300; // 5 min
const COUNT_TTL       = 120; // 2 min

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
    [FC_SCHEMA, FC_TABLE]
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

  logger.info(`[CloudSQL] FinalCompanies Schema — ${actualCols.length} cols, ${selectCols.length} selected`);
  _schemaCache = { actualCols, selectCols, selectSQL, fieldToCol, colToField };
  return _schemaCache;
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
// Supported params:
//   search         — ILIKE on business_name (GIN trgm if available, else BTree prefix)
//   f_business_name— business_name ILIKE '%value%'
//   f_city         — city ILIKE 'value%'     (BTree indexed)
//   f_state        — state ILIKE 'value%'    (BTree indexed)
//   f_pincode      — pincode = 'value'       (BTree indexed)
//   f_domain       — domain = 'value'        (BTree indexed)
//   f_industry     — industry ILIKE '%value%'(BTree indexed)
//   f_website      — website ILIKE '%value%'
//   f_address      — address ILIKE '%value%' (GIN trgm indexed)
//   f_geo_source   — geo_source = 'value'
//   f_has_email    — 'true'/'false'          (GIN array indexed)
//   f_has_phone    — 'true'/'false'          (phone text column)
//   f_min_rating   — numeric threshold (e.g. '4.0')
//   f_min_reviews  — int threshold
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildWhere({
  search = "",
  f_business_name, f_city, f_state, f_pincode,
  f_domain, f_industry, f_website, f_address, f_geo_source,
  f_has_email, f_has_phone, f_min_rating, f_min_reviews,
}, _schema) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  // General text search — business_name (BTree prefix match)
  if (search) {
    conditions.push(`"business_name" ILIKE $${idx++}`);
    values.push(`%${search}%`);
  }

  // Column-specific filters
  if (f_business_name) { conditions.push(`business_name ILIKE $${idx++}`); values.push(`%${f_business_name}%`); }
  if (f_city)          { conditions.push(`city          ILIKE $${idx++}`); values.push(`${f_city}%`); }
  if (f_state)         { conditions.push(`state         ILIKE $${idx++}`); values.push(`${f_state}%`); }
  if (f_pincode)       { conditions.push(`pincode       = $${idx++}`);      values.push(f_pincode); }
  if (f_domain)        { conditions.push(`domain        ILIKE $${idx++}`); values.push(`%${f_domain}%`); }
  if (f_industry)      { conditions.push(`industry      ILIKE $${idx++}`); values.push(`%${f_industry}%`); }
  if (f_website)       { conditions.push(`website       ILIKE $${idx++}`); values.push(`%${f_website}%`); }
  if (f_address)       { conditions.push(`address       ILIKE $${idx++}`); values.push(`%${f_address}%`); }
  if (f_geo_source)    { conditions.push(`geo_source    = $${idx++}`);      values.push(f_geo_source); }

  // Rating / reviews
  if (f_min_rating) {
    const r = parseFloat(f_min_rating);
    if (!isNaN(r)) { conditions.push(`rating >= $${idx++}`); values.push(r); }
  }
  if (f_min_reviews) {
    const rv = parseInt(f_min_reviews, 10);
    if (!isNaN(rv)) { conditions.push(`reviews >= $${idx++}`); values.push(rv); }
  }

  // Array presence
  if (f_has_email === "true")  { conditions.push(`cardinality(emails) > 0`); }
  if (f_has_email === "false") { conditions.push(`(emails IS NULL OR cardinality(emails) = 0)`); }
  // phone is a plain text column in companies
  if (f_has_phone === "true")  { conditions.push(`(phone IS NOT NULL AND phone <> '')`); }
  if (f_has_phone === "false") { conditions.push(`(phone IS NULL OR phone = '')`); }

  const hasFilters = conditions.length > 0;

  // Default filter: require complete records (business_name, phone, website, emails) if no search/filters are specified
  if (!hasFilters) {
    conditions.push("business_name IS NOT NULL AND business_name <> '' AND business_name !~ '^[0-9\\-]+$'");
    conditions.push("phone IS NOT NULL AND phone <> ''");
    conditions.push("website IS NOT NULL AND website <> ''");
    conditions.push("emails IS NOT NULL AND cardinality(emails) > 0");
  }

  const activeFilters = hasFilters || conditions.length > 0;

  return {
    whereStr: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
    nextIdx: idx,
    hasFilters: activeFilters,
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
      const cnt = await pgQuery(
        `SELECT reltuples::bigint AS cnt FROM pg_class WHERE oid = $1::regclass`,
        [FULL_TABLE],
        5000
      );
      totalRecords = parseInt(cnt.rows[0]?.cnt || "0", 10);
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
    res.json({ columns: selectCols, source: "cloud_sql", table: FC_TABLE });
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

    const totalRes = await pgQuery(
      `SELECT reltuples::bigint AS cnt FROM pg_class WHERE oid = $1::regclass`,
      [FULL_TABLE],
      5000
    );
    const payload = {
      total:  parseInt(totalRes.rows[0]?.cnt || "0", 10),
      source: "cloud_sql",
      table:  FC_TABLE,
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
    await cacheDel(COUNT_CACHE_KEY);
    res.json({ success: true, message: "Final Companies cache cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /  (paginated list)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", async (req, res) => {
  const {
    page      = 1,
    limit     = 50,
    search    = "",
    sort_by   = "",
    sort_dir  = "asc",
    // Column-specific filters
    f_business_name, f_city, f_state, f_pincode,
    f_domain, f_industry, f_website, f_address, f_geo_source,
    f_has_email, f_has_phone, f_min_rating, f_min_reviews,
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    const schema = await getSchema();
    const { selectSQL, selectCols } = schema;
    const { whereStr, values, nextIdx, hasFilters } = buildWhere(
      { search, f_business_name, f_city, f_state, f_pincode, f_domain, f_industry, f_website, f_address, f_geo_source, f_has_email, f_has_phone, f_min_rating, f_min_reviews },
      schema
    );

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
    if (!hasFilters) {
      const cachedCount = await cacheGet(COUNT_CACHE_KEY);
      if (cachedCount !== null && cachedCount !== undefined) {
        total = cachedCount;
      } else {
        // Fast estimate for large tables to avoid timeout
        const countRes = await pgQuery(
          `SELECT reltuples::bigint AS cnt FROM pg_class WHERE oid = $1::regclass`,
          [FULL_TABLE],
          5000
        );
        total = parseInt(countRes.rows[0]?.cnt || "0", 10);
        await cacheSet(COUNT_CACHE_KEY, total, COUNT_TTL);
      }
    } else {
      // Capped count — avoid full-scan timeout on 1.5M rows
      const countRes = await pgQuery(
        `SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM ${FULL_TABLE} ${whereStr} LIMIT 100001) subq`,
        values, 30000
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
      table:  FC_TABLE,
    });
  } catch (err) {
    logger.error(`[GET /] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
