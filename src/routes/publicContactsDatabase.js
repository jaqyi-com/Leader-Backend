"use strict";
// ============================================================
// PUBLIC CONTACTS DATABASE — Route Handler
// ============================================================
// Data source : Cloud SQL PostgreSQL (public.usa_public_contacts_82m)
// Instance    : sigma-current-497209-i6:us-central1:leader (34.71.167.187)
// Database    : doott
//
// Actual columns discovered from live schema:
//   _source_file, first_name, middle_name, last_name, xxxx,
//   email, ccc, xxx, first_name_1, middle_name_1, last_name_1,
//   title, company_name, mailing_address, primary_city,
//   primary_state, zip_code, country, phone, web_address,
//   email_1, revenue, employee, industry, sub_industry, _row_hash
// ============================================================

const express = require("express");
const router  = express.Router();

const { query: pgQuery } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");
const logger = require("../utils/logger").forAgent("PublicContactsDB");

// ── Table config ───────────────────────────────────────────
const PC_SCHEMA  = "public";
const PC_TABLE   = "usa_public_contacts_82m";
const FULL_TABLE = `"${PC_SCHEMA}"."${PC_TABLE}"`;

// ── Cache ──────────────────────────────────────────────────
const STATS_KEY = "cache:public-contacts-stats";
const STATS_TTL = 300; // 5 min

// Columns to exclude from SELECT output
const SKIP_IN_SELECT = new Set(["_row_hash", "xxxx", "ccc", "xxx", "uuid", "company_uuid", "id", "_id"]);

// ── Actual column mapping → standard API field names ───────
// Maps actual DB column → frontend field key
const COL_TO_FIELD = {
  first_name:      "first_name",
  middle_name:     "middle_name",
  last_name:       "last_name",
  email:           "email",
  email_1:         "email_1",
  phone:           "phone",
  mailing_address: "address",
  primary_city:    "city",
  primary_state:   "state",
  zip_code:        "zip",
  country:         "country",
  company_name:    "company",
  title:           "title",
  web_address:     "website",
  revenue:         "revenue",
  employee:        "employee",
  industry:        "industry",
  sub_industry:    "sub_industry",
  _source_file:    "source_file",
  first_name_1:    "first_name_1",
  middle_name_1:   "middle_name_1",
  last_name_1:     "last_name_1",
};

// ── Schema (static — we know the columns) ──────────────────
let _schemaCache = null;

async function getSchema() {
  if (_schemaCache) return _schemaCache;

  const res = await pgQuery(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [PC_SCHEMA, PC_TABLE]
  );

  const actualCols = res.rows.map(r => r.column_name);
  const selectCols = actualCols.filter(c => !SKIP_IN_SELECT.has(c));
  const selectSQL  = selectCols.map(c => `"${c}"`).join(", ");

  const colToField = {}; // db_col → api_field
  const fieldToCol = {}; // api_field → db_col

  for (const col of selectCols) {
    const field = COL_TO_FIELD[col] || col;
    colToField[col]   = field;
    if (!fieldToCol[field]) fieldToCol[field] = col;
  }

  logger.info(`[CloudSQL] PC Schema — ${actualCols.length} cols, ${selectCols.length} selected`);
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
function buildWhere({
  search    = "",
  name      = "",
  email     = "",
  phone     = "",
  city      = "",
  state     = "",
  zip       = "",
  company   = "",
  has_email = "",
  has_phone = "",
}) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (search) {
    conditions.push(
      `("first_name" ILIKE $${idx} OR "last_name" ILIKE $${idx} OR "email" ILIKE $${idx} OR "phone" ILIKE $${idx} OR "primary_city" ILIKE $${idx} OR "company_name" ILIKE $${idx})`
    );
    values.push(`%${search}%`);
    idx++;
  }

  if (name) {
    conditions.push(`("first_name" ILIKE $${idx} OR "last_name" ILIKE $${idx} OR "middle_name" ILIKE $${idx})`);
    values.push(`%${name}%`);
    idx++;
  }

  if (email) {
    conditions.push(`("email" ILIKE $${idx} OR "email_1" ILIKE $${idx})`);
    values.push(`%${email}%`);
    idx++;
  }

  if (phone) {
    conditions.push(`"phone" ILIKE $${idx}`);
    values.push(`%${phone}%`);
    idx++;
  }

  if (city) {
    conditions.push(`"primary_city" ILIKE $${idx}`);
    values.push(`%${city}%`);
    idx++;
  }

  if (state) {
    conditions.push(`"primary_state" ILIKE $${idx}`);
    values.push(`%${state}%`);
    idx++;
  }

  if (zip) {
    conditions.push(`"zip_code" ILIKE $${idx}`);
    values.push(`%${zip}%`);
    idx++;
  }

  if (company) {
    conditions.push(`"company_name" ILIKE $${idx}`);
    values.push(`%${company}%`);
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
    res.json({ columns: selectCols, source: "cloud_sql", table: PC_TABLE });
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

    const [totalRes, emailRes, phoneRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}`),
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} WHERE "email" IS NOT NULL AND "email" != ''`),
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE} WHERE "phone" IS NOT NULL AND "phone" != ''`),
    ]);

    const payload = {
      total:      parseInt(totalRes.rows[0].cnt, 10),
      with_email: parseInt(emailRes.rows[0].cnt, 10),
      with_phone: parseInt(phoneRes.rows[0].cnt, 10),
      source:     "cloud_sql",
      table:      PC_TABLE,
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
    res.json({ success: true, message: "Public contacts cache cleared." });
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
    city      = "",
    state     = "",
    zip       = "",
    company   = "",
    has_email = "",
    has_phone = "",
    sort_by   = "last_name",
    sort_dir  = "asc",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  // Map frontend sort_by names to actual DB column names
  const SORT_MAP = {
    name:       "last_name",
    first_name: "first_name",
    last_name:  "last_name",
    email:      "email",
    phone:      "phone",
    city:       "primary_city",
    state:      "primary_state",
    zip:        "zip_code",
    company:    "company_name",
    industry:   "industry",
  };
  const actualSortCol = SORT_MAP[sort_by] || "last_name";
  const sortDir = sort_dir === "desc" ? "DESC" : "ASC";

  try {
    const schema = await getSchema();
    const { selectSQL } = schema;

    const { whereStr, values, nextIdx } = buildWhere({
      search, name, email, phone, city, state, zip, company, has_email, has_phone,
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
      table:  PC_TABLE,
    });
  } catch (err) {
    logger.error(`[GET /] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
