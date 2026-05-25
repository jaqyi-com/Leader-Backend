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
const PHONE_COLS = ["phone", "company_phone"];
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
  // Phone — `phone` column has the real data (phone_1..9 are extras)
  "phone":            "phone",
  "company_phone":    "phone",
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
  "reviews", "phone", "address", "website", "url",
]);

// Extra rich fields from usa_business_data exposed at top level (not buried in extra)
const RICH_FIELDS = new Set([
  "email", "job_title", "first_name", "last_name", "contact_person",
  "company_email", "company_phone", "company_facebook", "linked_url",
  "revenue_range", "number_of_employees", "team_size", "total_funding",
  "zip_code", "state", "industry", "city",
  "phone", "phone_1", "phone_2", "phone_3",
  "work_email_1", "work_email_2", "direct_email_1", "direct_email_2",
  "generic_email", "corporate_email",
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
    // Search across name, category, city, BOTH phone columns, address, email
    const searchTargets = [
      "business_name", "_category", "city", "state",
      "phone", "company_phone",
      "street_address", "email", "contact_person", "job_title",
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
    const conds = PHONE_COLS.map(
      c => `("${c}" IS NOT NULL AND "${c}" != '' AND "${c}" IS DISTINCT FROM 'phone')`
    );
    conditions.push(`(${conds.join(" OR ")})`);
  } else if (has_phone === "false") {
    const conds = PHONE_COLS.map(c => `("${c}" IS NULL OR "${c}" = '')`);
    conditions.push(`(${conds.join(" AND ")})`);
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
    const phoneCol   = `"${fieldToCol.phone   || "phone"}"`;
    const websiteCol = `"${fieldToCol.website || "website"}"`;

    const HEADER_FILTER = `"business_name" IS DISTINCT FROM 'business_name'`;

    const [totalRes, phoneRes, websiteRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} WHERE ${HEADER_FILTER}`),
      pgQuery(
        `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}
         WHERE ${HEADER_FILTER}
           AND ${phoneCol} IS NOT NULL AND ${phoneCol} != '' AND ${phoneCol} IS DISTINCT FROM 'phone'`
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

    // Phone / website filters — no bound params (IS NOT NULL checks)
    if (has_phone === "true") {
      const conds = PHONE_COLS.map(c => `("${c}" IS NOT NULL AND "${c}" != '' AND "${c}" IS DISTINCT FROM 'phone')`);
      const clause = `(${conds.join(" OR ")})`;
      countConditions.push(clause);
      searchConditions.push(clause);
    } else if (has_phone === "false") {
      const clause = `(${PHONE_COLS.map(c => `("${c}" IS NULL OR "${c}" = '')`).join(" AND ")})`;
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


    const { actualCols, colToField, fieldToCol } = await getSchema();
    const leads = searchRes.rows.map(row => {
      const similarity = row.similarity;
      delete row.embedding; // don't send 512-float arrays to frontend
      const normalized = normalizeRow({ actualCols, colToField }, row);
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

module.exports = router;
