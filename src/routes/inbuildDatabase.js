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

  // fieldToCol : standard_name → actual_db_column  (e.g. "name" → "business_name")
  // colToField : actual_db_column → standard_name   (for result normalisation)
  const fieldToCol = {};
  const colToField = {};

  for (const col of actualCols) {
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
    `[CloudSQL] Schema loaded — ${actualCols.length} cols. Mappings: ${JSON.stringify(fieldToCol)}`
  );

  _schemaCache = { actualCols, fieldToCol, colToField };
  return _schemaCache;
}

/** Normalise a raw DB row into the standard API shape. */
function normalizeRow({ actualCols, colToField }, row) {
  const core  = {};
  const rich  = {};
  const extra = {};

  for (const col of actualCols) {
    const val   = row[col] ?? "";
    const field = colToField[col];

    if (field && CORE_FIELDS.has(field)) {
      // Map to standard field name
      core[field] = val !== null ? String(val) : "";
    } else if (col !== "id" && col !== "_row_hash" && RICH_FIELDS.has(col)) {
      // Expose rich contact fields at top level
      rich[col] = val;
    } else if (col !== "id" && col !== "_row_hash" && col !== "unnamed_13") {
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
function buildWhere({ search, category, city, has_phone, has_website }, fieldToCol) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  const col = (f) => `"${fieldToCol[f] || f}"`;

  if (search) {
    // Search across name, category, city, phone, address, email, contact_person
    const searchTargets = [
      fieldToCol.name     || "business_name",
      fieldToCol.category || "_category",
      fieldToCol.city_file || "city",
      fieldToCol.phone    || "phone",
      fieldToCol.address  || "street_address",
      "email",
      "contact_person",
      "job_title",
    ].filter(Boolean);

    const searchCols = searchTargets.map(c => `"${c}" ILIKE $${idx}`);
    conditions.push(`(${searchCols.join(" OR ")})`);
    values.push(`%${search}%`);
    idx++;
  }

  if (category) {
    conditions.push(`${col("category")} ILIKE $${idx}`);
    values.push(`%${category}%`);
    idx++;
  }

  if (city) {
    // Search across city + state + location
    conditions.push(
      `("city" ILIKE $${idx} OR "state" ILIKE $${idx} OR "location" ILIKE $${idx})`
    );
    values.push(`%${city}%`);
    idx++;
  }

  // has_phone: check primary phone column
  const phoneActual = fieldToCol.phone || "phone";
  if (has_phone === "true") {
    conditions.push(
      `("${phoneActual}" IS NOT NULL AND "${phoneActual}" != '' AND "${phoneActual}" != '${TABLE}')`
    );
  } else if (has_phone === "false") {
    conditions.push(
      `("${phoneActual}" IS NULL OR "${phoneActual}" = '')`
    );
  }

  // has_website: check website column
  const webActual = fieldToCol.website || "website";
  if (has_website === "true") {
    conditions.push(
      `("${webActual}" IS NOT NULL AND "${webActual}" != '' AND "${webActual}" NOT ILIKE '%website%')`
    );
  } else if (has_website === "false") {
    conditions.push(
      `("${webActual}" IS NULL OR "${webActual}" = '')`
    );
  }

  // Always exclude the header row artifact (row 1 has column names as values)
  conditions.push(`"business_name" != 'business_name'`);

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
    } catch (_) { /* table might be empty or temp error */ }

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
    res.status(503).json({
      ok:     false,
      source: "cloud_sql",
      error:  err.message,
    });
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

    const [totalRes, phoneRes, websiteRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}`),
      pgQuery(
        `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}
         WHERE ${phoneCol} IS NOT NULL AND ${phoneCol} != ''`
      ),
      pgQuery(
        `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}
         WHERE ${websiteCol} IS NOT NULL AND ${websiteCol} != ''`
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
// GET /  — paginated, filtered, sorted from Cloud SQL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", async (req, res) => {
  const {
    page        = 1,
    limit       = 50,
    search      = "",
    category    = "",
    city        = "",
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
      { search, category, city, has_phone, has_website },
      fieldToCol
    );

    // Safe sort: only allow mapped column names
    const sortCol = `"${fieldToCol[sort_by] || fieldToCol.name || "name"}"`;
    const sortDir = sort_dir === "desc" ? "DESC" : "ASC";

    const dataSQL = `
      SELECT * FROM ${FULL_TABLE}
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
