"use strict";
// ============================================================
// IN BUILD DATABASE — Route Handler
// ============================================================
// Data source : Cloud SQL PostgreSQL (public.usa_business_data)
// Instance    : sigma-current-497209-i6:us-central1:leader (34.71.167.187)
// Database    : doott
//
// Architecture:
//   • All READ queries  → Cloud SQL (public.usa_business_data)
//   • POST /sync        → No-op (data lives in Cloud SQL, no import needed)
//   • POST /refresh     → Clears Redis stats cache + schema cache
//   • GET  /health      → Cloud SQL connectivity + row count
//
// MongoDB Atlas is NOT touched here — it remains for all other features.
// ============================================================

const express = require("express");
const router  = express.Router();
const OpenAI  = require("openai");

const { query: pgQuery, SCHEMA, TABLE } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel }  = require("../db/redis");
const logger = require("../utils/logger").forAgent("InBuildDatabase");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// Fully-qualified table reference (safe, no user input)
const FULL_TABLE      = `"${SCHEMA}"."${TABLE}"`;
const STATS_CACHE_KEY = "cache:inbuild-stats";

// Columns that may contain phone / website data
const PHONE_COLS = ["phone_number"];
const WEB_COLS   = ["website", "company_website"];

// Redis key for caching query embeddings (avoids re-embedding same query)
const EMBED_CACHE_PREFIX = "cache:embed:";
const EMBED_CACHE_TTL    = 60 * 60 * 24; // 24 hours
const STATS_CACHE_TTL = 120; // seconds

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COLUMN NORMALISATION MAP
// Maps common DB column name variations → standard API field name
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COLUMN NORMALISATION MAP
// Maps actual usa_business_data column names → standard API field names
// Discovered from live schema: 85 columns, 742,079 rows
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const NORMALIZE = {
  // Name
  "business_name":    "name",
  "company":          "name",
  "full_name":        "name",
  // Phone — consolidated into phone_number
  "phone_number":      "phone",
  "company_phone":     "phone",   // legacy alias kept for backward compat
  // Email — consolidated into email_address
  "email_address":     "email",
  "email":             "email",   // legacy alias
  "company_email":     "email",   // legacy alias
  // Website
  "company_website":  "website",
  "website":          "website",
  // City / Region — primary is `city`, also `location`, `state`
  "location":         "city_file",
  "city":             "city_file",
  "state":            "city_file",
  // Category
  "_category":        "category",
  "industry":         "category",
  // Address
  "street_address":   "address",
  // URL / Social
  "linked_url":       "url",
  "facebook_profile": "url",
};

const CORE_FIELDS = new Set([
  "name", "category", "city_file", "rating",
  "reviews", "phone_number", "address", "website", "url",
]);

// Extra rich fields from usa_business_data exposed at top level (not buried in extra)
const RICH_FIELDS = new Set([
  "email_address", "job_title", "first_name", "last_name", "contact_person",
  "company_facebook", "linked_url",
  "revenue_range", "number_of_employees", "team_size", "total_funding",
  "zip_code", "state", "industry", "city",
  "phone_number",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCHEMA DISCOVERY (lazy, cached in-memory)
// Introspects public.usa_business_data columns once, builds mappings.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let _schemaCache = null;

// Columns to EXCLUDE from SELECT — too large or not needed by frontend.
// embedding : 512-dim vector (6 KB per row) → sent only in semantic-search
// _row_hash : dedup utility column
// unnamed_13: stale artifact column
const SKIP_IN_SELECT = new Set(["embedding", "_row_hash", "unnamed_13"]);

async function getSchema() {
  if (_schemaCache) return _schemaCache;

  const res = await pgQuery(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [SCHEMA, TABLE]
  );

  const actualCols = res.rows.map(r => r.column_name);

  // Columns returned by regular SELECT (excludes large/binary cols)
  const selectCols = actualCols.filter(c => !SKIP_IN_SELECT.has(c));
  const selectSQL  = selectCols.map(c => `"${c}"`).join(", ");

  // fieldToCol : standard_name → actual_db_column  (e.g. "name" → "business_name")
  // colToField : actual_db_column → standard_name   (for result normalisation)
  const fieldToCol = {};
  const colToField = {};

  for (const col of selectCols) {
    const lower      = col.toLowerCase();
    const stdField   = NORMALIZE[lower] || (CORE_FIELDS.has(lower) ? lower : null);
    if (stdField && !fieldToCol[stdField]) {
      fieldToCol[stdField] = col;
      colToField[col]      = stdField;
    }
  }

  // For any standard field still unmapped, default to itself
  for (const f of CORE_FIELDS) {
    if (!fieldToCol[f]) fieldToCol[f] = f;
  }

  logger.info(
    `[CloudSQL] Schema loaded — ${actualCols.length} total cols, ${selectCols.length} selected. Mappings: ${JSON.stringify(fieldToCol)}`
  );

  _schemaCache = { actualCols, selectCols, selectSQL, fieldToCol, colToField };
  return _schemaCache;
}

/** Normalise a raw DB row into the standard API shape.
 *  Iterates selectCols (never includes embedding/_row_hash/unnamed_13). */
function normalizeRow({ selectCols, colToField }, row) {
  const core  = {};
  const rich  = {};
  const extra = {};

  for (const col of selectCols) {
    const val   = row[col] ?? "";
    const field = colToField[col];

    if (field && CORE_FIELDS.has(field)) {
      // Map to standard field name
      core[field] = val !== null ? String(val) : "";
    } else if (col !== "id" && RICH_FIELDS.has(col)) {
      // Expose rich contact fields at top level
      rich[col] = val;
    } else if (col !== "id") {
      extra[col] = val;
    }
  }

  // Ensure every core field is present
  for (const f of CORE_FIELDS) {
    if (core[f] === undefined) core[f] = "";
  }

  return { ...core, ...rich, ...extra };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHERE CLAUSE BUILDER  (fully parameterised — no SQL injection)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildWhere({ search, category, city, state, has_phone, has_website }, fieldToCol) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (search) {
    // Search across name, category, city, phone_number, address, email
    const searchTargets = [
      "business_name", "_category", "city", "state",
      "phone_number", "email_address",
      "street_address", "contact_person", "job_title",
    ];
    const searchCols = searchTargets.map(c => `"${c}" ILIKE $${idx}`);
    conditions.push(`(${searchCols.join(" OR ")})`);
    values.push(`%${search}%`);
    idx++;
  }

  if (category) {
    conditions.push(`"_category" ILIKE $${idx}`);
    values.push(`%${category}%`);
    idx++;
  }

  if (city) {
    conditions.push(`("city" ILIKE $${idx} OR "city" ILIKE $${idx})`);
    values.push(`%${city}%`);
    idx++;
  }

  if (state) {
    conditions.push(`"state" ILIKE $${idx}`);
    values.push(`%${state}%`);
    idx++;
  }

  // has_phone — check ALL phone columns with OR (has data) / AND (no data)
  if (has_phone === "true") {
    conditions.push(`("phone_number" IS NOT NULL AND "phone_number" != '')`);
  } else if (has_phone === "false") {
    conditions.push(`("phone_number" IS NULL OR "phone_number" = '')`);
  }

  // has_website — check ALL website columns with OR / AND
  if (has_website === "true") {
    const conds = WEB_COLS.map(
      c => `("${c}" IS NOT NULL AND "${c}" != '' AND "${c}" NOT ILIKE '%website%')`
    );
    conditions.push(`(${conds.join(" OR ")})`);
  } else if (has_website === "false") {
    const conds = WEB_COLS.map(c => `("${c}" IS NULL OR "${c}" = '')`);
    conditions.push(`(${conds.join(" AND ")})`);
  }

  // Exclude the one header artifact row; IS DISTINCT FROM keeps NULLs
  conditions.push(`"business_name" IS DISTINCT FROM 'business_name'`);

  return {
    whereStr: `WHERE ${conditions.join(" AND ")}`,
    values,
    nextIdx:  idx,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /health
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/health", async (req, res) => {
  try {
    const pingRes = await pgQuery("SELECT NOW() AS now");

    let totalRecords = 0;
    try {
      const cntRes = await pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}`);
      totalRecords = parseInt(cntRes.rows[0].cnt, 10);
    } catch (_) { /* ignore — reported via ok:false if ping also fails */ }

    res.json({
      ok:           true,
      source:       "cloud_sql",
      instance:     "sigma-current-497209-i6:us-central1:leader",
      database:     process.env.CLOUD_SQL_DB || "doott",
      table:        FULL_TABLE,
      serverTime:   pingRes.rows[0].now,
      totalRecords,
    });
  } catch (err) {
    logger.error(`[health] ${err.message}`);
    res.status(503).json({ ok: false, source: "cloud_sql", error: err.message });
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /columns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/columns", async (req, res) => {
  try {
    const { actualCols, fieldToCol } = await getSchema();

    const coreKeys  = [...CORE_FIELDS].filter(f => fieldToCol[f]);
    const mappedCols = new Set(Object.values(fieldToCol));
    const extraKeys  = actualCols.filter(c => !mappedCols.has(c) && c !== "id");

    res.json({ columns: [...coreKeys, ...extraKeys], source: "cloud_sql" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/stats", async (req, res) => {
  try {
    const cached = await cacheGet(STATS_CACHE_KEY);
    if (cached) return res.json({ ...cached, _cache: "hit" });

    const { fieldToCol } = await getSchema();
    const phoneCol   = `"phone_number"`;
    const websiteCol = `"${fieldToCol.website || "website"}"`;

    const HEADER_FILTER = `"business_name" IS DISTINCT FROM 'business_name'`;

    const [totalRes, phoneRes, websiteRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} WHERE ${HEADER_FILTER}`),
      pgQuery(
        `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}
         WHERE ${HEADER_FILTER}
           AND ${phoneCol} IS NOT NULL AND ${phoneCol} != ''`
      ),
      pgQuery(
        `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}
         WHERE ${HEADER_FILTER}
           AND ${websiteCol} IS NOT NULL AND ${websiteCol} != '' AND ${websiteCol} IS DISTINCT FROM 'website'`
      ),
    ]);

    const payload = {
      total:        parseInt(totalRes.rows[0].cnt,   10),
      with_phone:   parseInt(phoneRes.rows[0].cnt,   10),
      with_website: parseInt(websiteRes.rows[0].cnt, 10),
      source:       "cloud_sql",
    };

    await cacheSet(STATS_CACHE_KEY, payload, STATS_CACHE_TTL);
    res.json(payload);
  } catch (err) {
    logger.error(`[stats] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /embedding-status  — how many rows have embeddings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/embedding-status", async (req, res) => {
  try {
    const [totalRes, embRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} WHERE "business_name" IS DISTINCT FROM 'business_name'`),
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} WHERE embedding IS NOT NULL`),
    ]);
    const total    = parseInt(totalRes.rows[0].cnt);
    const embedded = parseInt(embRes.rows[0].cnt);
    res.json({
      total,
      embedded,
      remaining: total - embedded,
      percent:   total > 0 ? parseFloat(((embedded / total) * 100).toFixed(1)) : 0,
      ready:     embedded > 10000, // flag: enough embeddings to use semantic search
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /semantic-search  — pgvector cosine similarity search
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/semantic-search", async (req, res) => {
  const {
    query       = "",
    category    = "",
    city        = "",
    state       = "",
    has_phone   = "",
    has_website = "",
    page        = 1,
    limit       = 50,
  } = req.body;

  if (!query.trim()) return res.status(422).json({ error: "query is required" });

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    // 1. Get query embedding (Redis-cached by query text)
    const cacheKey = EMBED_CACHE_PREFIX + Buffer.from(query).toString("base64").slice(0, 64);
    let queryVec = await cacheGet(cacheKey);

    if (!queryVec) {
      const embRes = await openai.embeddings.create({
        model:      "text-embedding-3-small",
        input:      query.slice(0, 2000),
        dimensions: 512,
      });
      queryVec = embRes.data[0].embedding;
      await cacheSet(cacheKey, queryVec, EMBED_CACHE_TTL);
    }

    const vecStr = `[${queryVec.join(",")}]`;

    // 2. Build optional hard filters — two param arrays:
    //    countValues: filter params only ($1,$2,...) — count SQL has NO vector param
    //    searchValues: vector at $1, then same filters at $2,$3,... — search SQL uses <=> $1
    const baseConditions = [`embedding IS NOT NULL`, `"business_name" IS DISTINCT FROM 'business_name'`];

    const countConditions  = [...baseConditions];
    const countValues      = [];
    let   cIdx             = 1;

    const searchConditions = [...baseConditions];
    const searchValues     = [vecStr];   // $1 = vector for cosine distance
    let   sIdx             = 2;

    if (category) {
      countConditions.push(`"_category" ILIKE $${cIdx}`);   countValues.push(`%${category}%`);  cIdx++;
      searchConditions.push(`"_category" ILIKE $${sIdx}`);  searchValues.push(`%${category}%`); sIdx++;
    }
    if (city) {
      countConditions.push(`"city" ILIKE $${cIdx}`);   countValues.push(`%${city}%`);  cIdx++;
      searchConditions.push(`"city" ILIKE $${sIdx}`);  searchValues.push(`%${city}%`); sIdx++;
    }
    if (state) {
      countConditions.push(`"state" ILIKE $${cIdx}`);   countValues.push(`%${state}%`);  cIdx++;
      searchConditions.push(`"state" ILIKE $${sIdx}`);  searchValues.push(`%${state}%`); sIdx++;
    }

    // Phone / website filters
    if (has_phone === "true") {
      countConditions.push(`("phone_number" IS NOT NULL AND "phone_number" != '')`);
      searchConditions.push(`("phone_number" IS NOT NULL AND "phone_number" != '')`);
    } else if (has_phone === "false") {
      const clause = `("phone_number" IS NULL OR "phone_number" = '')`;
      countConditions.push(clause);
      searchConditions.push(clause);
    }

    if (has_website === "true") {
      const conds = WEB_COLS.map(c => `("${c}" IS NOT NULL AND "${c}" != '' AND "${c}" NOT ILIKE '%website%')`);
      const clause = `(${conds.join(" OR ")})`;
      countConditions.push(clause);
      searchConditions.push(clause);
    } else if (has_website === "false") {
      const clause = `(${WEB_COLS.map(c => `("${c}" IS NULL OR "${c}" = '')`).join(" AND ")})`;
      countConditions.push(clause);
      searchConditions.push(clause);
    }

    const countWhereStr  = `WHERE ${countConditions.join(" AND ")}`;
    const searchWhereStr = `WHERE ${searchConditions.join(" AND ")}`;

    // 3. Count total matches — uses countValues (no vector, 0 or more filter params)
    const countSql = `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${countWhereStr}`;
    const countRes = await pgQuery(countSql, countValues);
    const total    = parseInt(countRes.rows[0].cnt);

    // 4. Semantic search — vector at $1, filters at $2..N, then LIMIT/OFFSET
    searchValues.push(limitNum, offset);
    const searchSql = `
      SELECT *,
        ROUND((1 - (embedding <=> $1)::numeric) * 100, 1) AS similarity
      FROM ${FULL_TABLE}
      ${searchWhereStr}
      ORDER BY embedding <=> $1
      LIMIT $${sIdx} OFFSET $${sIdx + 1}
    `;
    const searchRes = await pgQuery(searchSql, searchValues);


    const { selectCols, colToField, fieldToCol } = await getSchema();
    const leads = searchRes.rows.map(row => {
      const similarity = row.similarity;
      delete row.embedding; // don't send 512-float arrays to frontend
      const normalized = normalizeRow({ selectCols, colToField }, row);
      return { ...normalized, similarity };
    });

    res.json({ leads, total, page: pageNum, limit: limitNum, source: "semantic", query });
  } catch (err) {
    logger.error(`[semantic-search] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /  — paginated, filtered, sorted from Cloud SQL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", async (req, res) => {
  const {
    page        = 1,
    limit       = 50,
    search      = "",
    category    = "",
    city        = "",
    state       = "",
    has_phone   = "",
    has_website = "",
    sort_by     = "name",
    sort_dir    = "asc",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page,  10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    const schema = await getSchema();
    const { fieldToCol } = schema;

    const { whereStr, values, nextIdx } = buildWhere(
      { search, category, city, state, has_phone, has_website },
      fieldToCol
    );

    // Safe sort: only allow mapped column names
    const sortCol = `"${fieldToCol[sort_by] || fieldToCol.name || "name"}"`;
    const sortDir = sort_dir === "desc" ? "DESC" : "ASC";

    const { selectSQL } = schema;
    const dataSQL = `
      SELECT ${selectSQL} FROM ${FULL_TABLE}
      ${whereStr}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;
    const countSQL = `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${whereStr}`;

    const [dataRes, countRes] = await Promise.all([
      pgQuery(dataSQL,  [...values, limitNum, offset]),
      pgQuery(countSQL, values),
    ]);

    const total  = parseInt(countRes.rows[0].cnt, 10);
    const leads  = dataRes.rows.map(row => normalizeRow(schema, row));

    res.json({
      leads,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
      source: "cloud_sql",
    });
  } catch (err) {
    logger.error(`[GET /] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /ai-filter — Convert natural language → SQL filter params
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/ai-filter", async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(422).json({ error: "query is required" });

  try {
    const systemPrompt = `You are a database filter assistant. Convert the user's natural language query into structured filter parameters for a business dataset.

Return ONLY valid JSON with any of these optional keys (omit keys that aren't mentioned):
{
  "search":      "string",
  "category":    "string",
  "city":        "string",
  "has_phone":   "true|false",
  "has_website": "true|false",
  "sort_by":     "name|rating|reviews",
  "sort_dir":    "asc|desc",
  "summary":     "string"
}`;

    const response = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      temperature:     0.1,
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
// GET /sync/status
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/sync/status", (req, res) => {
  res.json({
    running:   false,
    source:    "cloud_sql",
    message:   "Data lives directly in Cloud SQL (public.usa_business_data). No sync required.",
    lastSync:  "N/A",
    lastCount: null,
    lastError: null,
    progress:  "✅ Cloud SQL is the primary store.",
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /sync — Not applicable (data already in Cloud SQL)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/sync", (req, res) => {
  res.json({
    started: false,
    source:  "cloud_sql",
    message: "Sync is not required. Data lives directly in Cloud SQL (public.usa_business_data). Use POST /refresh to clear cache.",
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /refresh — clear Redis stats cache + schema cache
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/refresh", async (req, res) => {
  try {
    _schemaCache = null;                  // force schema re-discovery on next request
    await cacheDel(STATS_CACHE_KEY);
    res.json({ success: true, message: "Stats cache and schema cache cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /map  — business density by state (+ top cities)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/map", async (req, res) => {
  const { category = "", limit = 15 } = req.query;
  try {
    const conditions = [`"business_name" IS DISTINCT FROM 'business_name'`, `"state" IS NOT NULL`, `"state" != ''`];
    const values = [];
    let idx = 1;
    if (category) {
      conditions.push(`"_category" ILIKE $${idx}`);
      values.push(`%${category}%`);
      idx++;
    }
    const whereStr = `WHERE ${conditions.join(" AND ")}`;

    const [stateRes, cityRes] = await Promise.all([
      pgQuery(
        `SELECT "state", COUNT(*) AS count FROM ${FULL_TABLE} ${whereStr} GROUP BY "state" ORDER BY count DESC LIMIT 60`,
        values
      ),
      pgQuery(
        `SELECT "city", "state", COUNT(*) AS count FROM ${FULL_TABLE}
         ${whereStr} AND "city" IS NOT NULL AND "city" != ''
         GROUP BY "city", "state" ORDER BY count DESC LIMIT ${Math.min(parseInt(limit) || 15, 50)}`,
        values
      ),
    ]);

    res.json({
      category,
      byState:  stateRes.rows.map(r => ({ state: r.state,   count: parseInt(r.count) })),
      topCities: cityRes.rows.map(r => ({ city: r.city, state: r.state, count: parseInt(r.count) })),
    });
  } catch (err) {
    logger.error(`[GET /map] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /market-intel  — full market intelligence for a category
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/market-intel", async (req, res) => {
  const { category = "", state = "" } = req.query;
  if (!category.trim()) return res.status(422).json({ error: "category is required" });

  try {
    const conditions = [`"business_name" IS DISTINCT FROM 'business_name'`];
    const values = [];
    let idx = 1;
    if (category) { conditions.push(`"_category" ILIKE $${idx}`); values.push(`%${category}%`); idx++; }
    if (state)    { conditions.push(`"state" ILIKE $${idx}`);     values.push(`%${state}%`);    idx++; }
    const w = `WHERE ${conditions.join(" AND ")}`;

    const safeRun = (sql, vals = values) =>
      pgQuery(sql, vals).catch(() => ({ rows: [] }));

    const [
      totalRes, phoneRes, websiteRes, emailRes, linkedRes,
      stateRes, cityRes, revenueRes, employeeRes,
    ] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${w}`, values),
      safeRun(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${w} AND "phone_number" IS NOT NULL AND "phone_number" != ''`),
      safeRun(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${w} AND ("company_website" IS NOT NULL AND "company_website" != '' AND "company_website" NOT ILIKE '%website%')`),
      safeRun(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${w} AND ("email_address" IS NOT NULL AND "email_address" != '')`),
      safeRun(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${w} AND ("linked_url" IS NOT NULL AND "linked_url" != '')`),
      safeRun(`SELECT "state", COUNT(*) AS count FROM ${FULL_TABLE} ${w} AND "state" IS NOT NULL AND "state" != '' GROUP BY "state" ORDER BY count DESC LIMIT 15`),
      safeRun(`SELECT "city",  COUNT(*) AS count FROM ${FULL_TABLE} ${w} AND "city"  IS NOT NULL AND "city"  != '' GROUP BY "city"  ORDER BY count DESC LIMIT 10`),
      safeRun(`SELECT "revenue_range", COUNT(*) AS count FROM ${FULL_TABLE} ${w} AND "revenue_range" IS NOT NULL AND "revenue_range" != '' GROUP BY "revenue_range" ORDER BY count DESC LIMIT 8`),
      safeRun(`SELECT "number_of_employees", COUNT(*) AS count FROM ${FULL_TABLE} ${w} AND "number_of_employees" IS NOT NULL AND "number_of_employees" != '' GROUP BY "number_of_employees" ORDER BY count DESC LIMIT 8`),
    ]);

    const total = parseInt(totalRes.rows[0].cnt || 0);
    const pct   = (n) => (total > 0 ? Math.round((parseInt(n) / total) * 100) : 0);

    res.json({
      category, state, total,
      coverage: {
        phone:   { count: parseInt(phoneRes.rows[0]?.cnt   || 0), pct: pct(phoneRes.rows[0]?.cnt   || 0) },
        website: { count: parseInt(websiteRes.rows[0]?.cnt || 0), pct: pct(websiteRes.rows[0]?.cnt || 0) },
        email:   { count: parseInt(emailRes.rows[0]?.cnt   || 0), pct: pct(emailRes.rows[0]?.cnt   || 0) },
        linkedin:{ count: parseInt(linkedRes.rows[0]?.cnt  || 0), pct: pct(linkedRes.rows[0]?.cnt  || 0) },
      },
      byState:   stateRes.rows.map(r => ({ state: r.state,                        count: parseInt(r.count) })),
      topCities: cityRes.rows.map(r  => ({ city:  r.city,                         count: parseInt(r.count) })),
      revenue:   revenueRes.rows.map(r   => ({ range: r.revenue_range,            count: parseInt(r.count) })),
      employees: employeeRes.rows.map(r  => ({ size:  r.number_of_employees,      count: parseInt(r.count) })),
    });
  } catch (err) {
    logger.error(`[GET /market-intel] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /ideal-customer  — AI description → semantic search + explanations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/ideal-customer", async (req, res) => {
  const { description = "", page = 1, limit = 20 } = req.body;
  if (!description.trim()) return res.status(422).json({ error: "description is required" });

  try {
    // Step 1: AI extracts structured profile
    const profileCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini", temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract filter params AND an optimized semantic search query from a business description. Return JSON only:
{
  "semanticQuery": "string — optimized query for pgvector similarity",
  "category":    "string or empty",
  "city":        "string or empty",
  "state":       "string or empty — use 2-letter abbreviation",
  "has_phone":   "true|false|empty",
  "has_website": "true|false|empty",
  "profileSummary": "string — 1-2 sentence description of this ideal customer"
}`,
        },
        { role: "user", content: description },
      ],
    });
    const profile = JSON.parse(profileCompletion.choices[0].message.content);

    // Step 2: Embed the semantic query
    const embRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: (profile.semanticQuery || description).slice(0, 2000),
      dimensions: 512,
    });
    const vecStr = `[${embRes.data[0].embedding.join(",")}]`;

    // Step 3: Build pgvector search with filters
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * limitNum;

    const conditions = [`embedding IS NOT NULL`, `"business_name" IS DISTINCT FROM 'business_name'`];
    const sValues = [vecStr]; // $1 = vector
    let sIdx = 2;

    if (profile.category)    { conditions.push(`"_category" ILIKE $${sIdx}`);  sValues.push(`%${profile.category}%`);  sIdx++; }
    if (profile.city)        { conditions.push(`"city" ILIKE $${sIdx}`);        sValues.push(`%${profile.city}%`);      sIdx++; }
    if (profile.state)       { conditions.push(`"state" ILIKE $${sIdx}`);       sValues.push(`%${profile.state}%`);     sIdx++; }
    if (profile.has_phone    === "true") conditions.push(`("phone_number" IS NOT NULL AND "phone_number" != '')`);
    if (profile.has_website  === "true") conditions.push(`("company_website" IS NOT NULL AND "company_website" != '' AND "company_website" NOT ILIKE '%website%')`);

    sValues.push(limitNum, offset);
    const searchSql = `
      SELECT *, ROUND((1 - (embedding <=> $1)::numeric) * 100, 1) AS similarity
      FROM ${FULL_TABLE}
      WHERE ${conditions.join(" AND ")}
      ORDER BY embedding <=> $1
      LIMIT $${sIdx} OFFSET $${sIdx + 1}
    `;

    const schema    = await getSchema();
    const searchRes = await pgQuery(searchSql, sValues);
    const leads     = searchRes.rows.map(row => {
      const sim = row.similarity;
      delete row.embedding;
      return { ...normalizeRow(schema, row), similarity: sim };
    });

    // Step 4: AI writes "why this matches" for top 3
    let explanations = {};
    const top3 = leads.slice(0, 3);
    if (top3.length > 0) {
      const explainCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini", temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Write a short 1-sentence "why this matches" for each business. Return: { "0": "...", "1": "...", "2": "..." }`,
          },
          {
            role: "user",
            content: `Ideal customer: "${description}"\nMatches: ${JSON.stringify(top3.map(l => ({ name: l.name, category: l.category, city: l.city_file, revenue: l.revenue_range, employees: l.number_of_employees, score: l.similarity })))}`,
          },
        ],
      });
      explanations = JSON.parse(explainCompletion.choices[0].message.content);
    }

    res.json({ leads, profile, explanations, description, page: pageNum, limit: limitNum });
  } catch (err) {
    logger.error(`[POST /ideal-customer] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /launch-campaign  — create OutreachCampaign from selected DB rows
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/launch-campaign", async (req, res) => {
  try {
    const { leads = [], campaignName = "DB Campaign", channels = ["email"] } = req.body;
    if (!leads.length) return res.status(422).json({ error: "No leads provided" });
    if (!req.user?.orgId) return res.status(401).json({ error: "Authentication required" });

    const { OutreachCampaign } = require("../db/mongoose");
    const mongoose = require("mongoose");

    const contacts = leads
      .map(lead => ({
        contactId:          new mongoose.Types.ObjectId(),
        contactSource:      "inbuilt_db",
        name:               (lead.name || lead.business_name || "Unknown").slice(0, 200),
        email:              lead.email_address || "",
        phone:              lead.phone_number || lead.company_phone || "",
        companyName:        (lead.name || "").slice(0, 200),
        score:              Math.round(Number(lead.similarity) || 50),
        icebreaker:         "",
        personalizedSubject:"",
        personalizedEmail:  "",
        whatsappMessage:    "",
        status:             "pending",
        deliveries:         [],
      }))
      .filter(c => c.email || c.phone); // only contactable leads

    if (!contacts.length) {
      return res.status(422).json({ error: "None of the selected leads have email or phone data" });
    }

    const campaign = await OutreachCampaign.create({
      name:     campaignName,
      channels,
      sequence: [
        { day: 0, channel: channels[0] || "email", label: "Initial Contact" },
        { day: 3, channel: "email",                 label: "Follow-up" },
      ],
      contacts,
      status: "draft",
      orgId:  req.user.orgId,
    });

    res.json({ success: true, campaign, contactCount: contacts.length });
  } catch (err) {
    logger.error(`[POST /launch-campaign] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

