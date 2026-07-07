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
function parseQueryParamsToSQL(queryParams, schemaColumns, values, startIdx) {
  const conditions = [];
  let idx = startIdx;

  for (const [key, rawVal] of Object.entries(queryParams)) {
    if (!key.startsWith("f_")) continue;
    const val = rawVal ? String(rawVal).trim() : "";

    // Parse the column and operator suffix
    let col = null;
    let op = null;

    if (key.endsWith("_eq")) {
      col = key.substring(2, key.length - 3);
      op = "eq";
    } else if (key.endsWith("_sw")) {
      col = key.substring(2, key.length - 3);
      op = "sw";
    } else if (key.endsWith("_ew")) {
      col = key.substring(2, key.length - 3);
      op = "ew";
    } else if (key.endsWith("_nonempty")) {
      col = key.substring(2, key.length - 9);
      op = "nonempty";
    } else if (key.endsWith("_empty")) {
      col = key.substring(2, key.length - 6);
      op = "empty";
    } else {
      col = key.substring(2);
      op = "contains";
    }

    // Special compatibility mapping for legacy filters
    if (col === "has_email") {
      col = "emails";
      op = val === "true" ? "nonempty" : "empty";
    } else if (col === "has_phone") {
      col = schemaColumns.includes("phone") ? "phone" : "phones";
      op = val === "true" ? "nonempty" : "empty";
    }

    // Verify column exists in the schema to prevent SQL injection
    if (!schemaColumns.includes(col)) {
      continue;
    }

    const doubleQuotedCol = `"${col}"`;

    if (op === "eq") {
      if (val !== "") {
        conditions.push(`${doubleQuotedCol} = $${idx++}`);
        values.push(val);
      }
    } else if (op === "sw") {
      if (val !== "") {
        conditions.push(`${doubleQuotedCol} ILIKE $${idx++}`);
        values.push(`${val}%`);
      }
    } else if (op === "ew") {
      if (val !== "") {
        conditions.push(`${doubleQuotedCol} ILIKE $${idx++}`);
        values.push(`%${val}`);
      }
    } else if (op === "nonempty") {
      conditions.push(`(${doubleQuotedCol} IS NOT NULL AND ${doubleQuotedCol} <> '')`);
    } else if (op === "empty") {
      conditions.push(`(${doubleQuotedCol} IS NULL OR ${doubleQuotedCol} = '')`);
    } else if (op === "contains") {
      if (val !== "") {
        if (val === "true" || val === "false") {
          conditions.push(`${doubleQuotedCol} = $${idx++}`);
          values.push(val);
        } else {
          conditions.push(`${doubleQuotedCol} ILIKE $${idx++}`);
          values.push(`%${val}%`);
        }
      }
    }
  }

  return { conditions, nextIdx: idx };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHERE CLAUSE BUILDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildWhere(queryParams, embedding, _schema) {
  const { search = "" } = queryParams;
  const conditions = [];
  const values     = [];
  let   idx        = 1;
  let   vectorIdx  = null;

  // If vector embedding is available, use vector search; fallback to text ILIKE
  if (embedding && embedding.length === 384) {
    conditions.push("embedding IS NOT NULL");
    vectorIdx = idx++;
    values.push(JSON.stringify(embedding));
  } else if (search) {
    conditions.push(`"business_name" ILIKE $${idx++}`);
    values.push(`%${search}%`);
  }

  // Parse all query filters dynamically
  const { conditions: dynamicConditions, nextIdx } = parseQueryParamsToSQL(
    queryParams,
    _schema.actualCols,
    values,
    idx
  );
  conditions.push(...dynamicConditions);
  idx = nextIdx;

  const hasFilters = dynamicConditions.length > 0;
  const userHasFilters = hasFilters || (embedding && embedding.length === 384);

  // Default filter: require complete records if no search/filters are specified
  if (!userHasFilters) {
    conditions.push("business_name IS NOT NULL AND business_name <> '' AND business_name !~ '^[0-9\\-]+$'");
    conditions.push("phone IS NOT NULL AND phone <> ''");
    conditions.push("website IS NOT NULL AND website <> ''");
    conditions.push("(emails IS NOT NULL AND emails <> '')");
  }

  return {
    whereStr: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
    nextIdx: idx,
    vectorIdx,
    userHasFilters,
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
    await cacheDel("cache:final-companies-categories-v1");
    res.json({ success: true, message: "Final Companies cache cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /categories
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/categories", async (req, res) => {
  try {
    const cached = await cacheGet("cache:final-companies-categories-v1");
    if (cached) return res.json(cached);

    const queryRes = await pgQuery(
      `SELECT industry, count(*) as count 
       FROM (
         SELECT industry 
         FROM ${FULL_TABLE} 
         WHERE industry IS NOT NULL AND industry != '' 
         LIMIT 20000
       ) AS sub 
       GROUP BY industry 
       ORDER BY count DESC 
       LIMIT 100`,
       [],
       10000
    );

    const payload = queryRes.rows.map(r => ({
      name: r.industry,
      count: parseInt(r.count, 10)
    }));

    await cacheSet("cache:final-companies-categories-v1", payload, 86400); // 24 hours
    res.json(payload);
  } catch (err) {
    logger.error(`[categories] ${err.message}`);
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
    const { getLocalQueryEmbedding } = require("../services/localEmbedService");
    let embedding = null;
    if (search && search.trim().length > 0) {
      try {
        embedding = await getLocalQueryEmbedding(search);
      } catch (err) {
        logger.error(`Failed to generate query embedding for companies search: ${err.message}`);
      }
    }

    const schema = await getSchema();
    const { selectSQL, selectCols } = schema;
    const { whereStr, values, nextIdx, vectorIdx, userHasFilters } = buildWhere(
      req.query,
      embedding,
      schema
    );

    let customSelectSQL = selectSQL;
    if (vectorIdx !== null) {
      customSelectSQL += `, (1 - (embedding <=> $${vectorIdx}::vector)) AS similarity_score`;
    }

    let orderClause = "";
    if (vectorIdx !== null) {
      orderClause = `ORDER BY embedding <=> $${vectorIdx}::vector ASC`;
    } else if (sort_by && selectCols.includes(sort_by)) {
      const dir = sort_dir === "desc" ? "DESC" : "ASC";
      orderClause = `ORDER BY "${sort_by}" ${dir} NULLS LAST`;
    } else {
      orderClause = `ORDER BY created_at DESC`;
    }

    const dataSQL = `
      SELECT ${customSelectSQL} FROM ${FULL_TABLE}
      ${whereStr}
      ${orderClause}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;

    let total;
    if (!userHasFilters) {
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
