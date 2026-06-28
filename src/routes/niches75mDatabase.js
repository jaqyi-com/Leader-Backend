"use strict";
// ============================================================
// NICHES 75M DATA — Route Handler
// ============================================================
// Data source : Cloud SQL PostgreSQL (public.niches_75m_data)
// Instance    : sigma-current-497209-i6:us-central1:leader (34.71.167.187)
// Database    : doott
//
// Key columns (113 total):
//   _niche, _filename, full_name, first_name, last_name,
//   job_title, company, company_website, company_email,
//   company_phone, email, phone, website, location,
//   state, city, zip_code, street_address,
//   industry, revenue_range, team_size, linked_url,
//   business_name, contact_person, ...
// ============================================================

const express = require("express");
const router  = express.Router();

const { query: pgQuery } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");
const logger = require("../utils/logger").forAgent("Niches75mDB");

// ── Table config ───────────────────────────────────────────
const N_SCHEMA   = "public";
const N_TABLE    = "niches_75m_data";
const FULL_TABLE = `"${N_SCHEMA}"."${N_TABLE}"`;

// ── Cache ──────────────────────────────────────────────────
const STATS_KEY = "cache:niches75m-stats";
const STATS_TTL = 300; // 5 min

// Columns to exclude from SELECT (too large / internal / junk)
const SKIP_IN_SELECT = new Set([
  "_row_hash", "unnamed_13", "unnamed_14", "unnamed_12",
  "unnamed_15", "unnamed_16", "unnamed_17", "unnamed_18",
  "uuid", "company_uuid", "id", "_id",
  // niche pivot columns (rarely useful in table view)
  "trucking","furniture_shop","landscape","custom_home_builder","solar",
  "irrigation_repair","roofing","window_installation","land_clearing",
  "photographer","garage_doors","property_management","plumbers",
  "business_coach","auto_repair","real_estate_agent","remodeler",
  "car_dealership","commercial_cleaning_service",
]);

// Actual DB col → frontend API field name
const COL_TO_FIELD = {
  full_name:          "name",
  first_name:         "first_name",
  last_name:          "last_name",
  job_title:          "job_title",
  company:            "company",
  business_name:      "business_name",
  contact_person:     "contact_person",
  company_website:    "website",
  website:            "website2",
  company_email:      "company_email",
  email:              "email",
  corporate_email:    "corporate_email",
  generic_email:      "generic_email",
  company_phone:      "company_phone",
  phone:              "phone",
  phone_1:            "phone_1",
  phone_2:            "phone_2",
  location:           "location",
  city:               "city",
  state:              "state",
  zip_code:           "zip",
  street_address:     "address",
  industry:           "industry",
  revenue_range:      "revenue_range",
  team_size:          "team_size",
  number_of_employees:"employees",
  total_funding:      "total_funding",
  linked_url:         "linkedin",
  facebook_profile:   "facebook",
  company_facebook:   "company_facebook",
  _niche:             "niche",
  _filename:          "source_file",
  number:             "number",
  furst_name:         "furst_name",
  contact:            "contact",
  phone_type:         "phone_type",
};

// ── In-memory schema cache ─────────────────────────────────
let _schemaCache = null;

async function getSchema() {
  if (_schemaCache) return _schemaCache;

  const res = await pgQuery(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [N_SCHEMA, N_TABLE]
  );

  const actualCols = res.rows.map(r => r.column_name);
  const selectCols = actualCols.filter(c => !SKIP_IN_SELECT.has(c));
  const selectSQL  = selectCols.map(c => `"${c}"`).join(", ");

  const colToField = {};
  const fieldToCol = {};

  for (const col of selectCols) {
    const field = COL_TO_FIELD[col] || col;
    colToField[col] = field;
    if (!fieldToCol[field]) fieldToCol[field] = col;
  }

  logger.info(`[CloudSQL] N75m Schema — ${actualCols.length} cols, ${selectCols.length} selected`);
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
// WHERE CLAUSE BUILDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildWhere({
  search    = "",
  name      = "",
  email     = "",
  phone     = "",
  company   = "",
  city      = "",
  state     = "",
  niche     = "",
  industry  = "",
  has_email = "",
  has_phone = "",
}) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (search) {
    conditions.push(
      `("full_name" ILIKE $${idx} OR "company" ILIKE $${idx} OR "email" ILIKE $${idx} OR "phone" ILIKE $${idx} OR "city" ILIKE $${idx} OR "_niche" ILIKE $${idx} OR "business_name" ILIKE $${idx})`
    );
    values.push(`%${search}%`);
    idx++;
  }

  if (name) {
    conditions.push(`("full_name" ILIKE $${idx} OR "first_name" ILIKE $${idx} OR "last_name" ILIKE $${idx})`);
    values.push(`%${name}%`);
    idx++;
  }

  if (email) {
    conditions.push(`("email" ILIKE $${idx} OR "company_email" ILIKE $${idx} OR "corporate_email" ILIKE $${idx})`);
    values.push(`%${email}%`);
    idx++;
  }

  if (phone) {
    conditions.push(`("phone" ILIKE $${idx} OR "company_phone" ILIKE $${idx} OR "phone_1" ILIKE $${idx})`);
    values.push(`%${phone}%`);
    idx++;
  }

  if (company) {
    conditions.push(`("company" ILIKE $${idx} OR "business_name" ILIKE $${idx})`);
    values.push(`%${company}%`);
    idx++;
  }

  if (city) {
    conditions.push(`"city" ILIKE $${idx}`);
    values.push(`%${city}%`);
    idx++;
  }

  if (state) {
    conditions.push(`"state" ILIKE $${idx}`);
    values.push(`%${state}%`);
    idx++;
  }

  if (niche) {
    conditions.push(`"_niche" ILIKE $${idx}`);
    values.push(`%${niche}%`);
    idx++;
  }

  if (industry) {
    conditions.push(`"industry" ILIKE $${idx}`);
    values.push(`%${industry}%`);
    idx++;
  }

  if (has_email === "true") {
    conditions.push(`("email" IS NOT NULL AND "email" != '')`);
  } else if (has_email === "false") {
    conditions.push(`("email" IS NULL OR "email" = '')`);
  }

  if (has_phone === "true") {
    conditions.push(`("phone" IS NOT NULL AND "phone" != '')`);
  } else if (has_phone === "false") {
    conditions.push(`("phone" IS NULL OR "phone" = '')`);
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
    res.json({ columns: selectCols, source: "cloud_sql", table: N_TABLE });
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

    const [totalRes, emailRes, phoneRes, nicheRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}`),
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} WHERE "email" IS NOT NULL AND "email" != ''`),
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} WHERE "phone" IS NOT NULL AND "phone" != ''`),
      pgQuery(`SELECT COUNT(DISTINCT "_niche") AS cnt FROM ${FULL_TABLE} WHERE "_niche" IS NOT NULL AND "_niche" != ''`),
    ]);

    const payload = {
      total:       parseInt(totalRes.rows[0].cnt, 10),
      with_email:  parseInt(emailRes.rows[0].cnt, 10),
      with_phone:  parseInt(phoneRes.rows[0].cnt, 10),
      niche_count: parseInt(nicheRes.rows[0].cnt, 10),
      source:      "cloud_sql",
      table:       N_TABLE,
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
    res.json({ success: true, message: "Niches 75M cache cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /  — paginated, filtered, sorted
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", async (req, res) => {
  const {
    page      = 1,
    limit     = 50,
    search    = "",
    name      = "",
    email     = "",
    phone     = "",
    company   = "",
    city      = "",
    state     = "",
    niche     = "",
    industry  = "",
    has_email = "",
    has_phone = "",
    sort_by   = "full_name",
    sort_dir  = "asc",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  // Safe sort column whitelist
  const SORT_MAP = {
    name:       "full_name",
    first_name: "first_name",
    last_name:  "last_name",
    company:    "company",
    email:      "email",
    phone:      "phone",
    city:       "city",
    state:      "state",
    niche:      "_niche",
    industry:   "industry",
    job_title:  "job_title",
  };
  const actualSortCol = SORT_MAP[sort_by] || "full_name";
  const sortDir = sort_dir === "desc" ? "DESC" : "ASC";

  try {
    const schema = await getSchema();
    const { selectSQL } = schema;

    const { whereStr, values, nextIdx } = buildWhere({
      search, name, email, phone, company, city, state, niche, industry, has_email, has_phone,
    });

    const dataSQL = `
      SELECT ${selectSQL} FROM ${FULL_TABLE}
      ${whereStr}
      ORDER BY "${actualSortCol}" ${sortDir} NULLS LAST
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;
    const countSQL = `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} ${whereStr}`;

    const [dataRes, countRes] = await Promise.all([
      pgQuery(dataSQL,  [...values, limitNum, offset]),
      pgQuery(countSQL, values),
    ]);

    const total   = parseInt(countRes.rows[0].cnt, 10);
    const records = dataRes.rows.map(row => normalizeRow(schema, row));

    res.json({
      records,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
      source: "cloud_sql",
      table:  N_TABLE,
    });
  } catch (err) {
    logger.error(`[GET /] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
