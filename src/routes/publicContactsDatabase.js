"use strict";
// ============================================================
// PUBLIC CONTACTS DATABASE — Route Handler
// ============================================================
// Data source : Cloud SQL PostgreSQL (public.usa_public_contacts_82m)
// Instance    : sigma-current-497209-i6:us-central1:leader (34.71.167.187)
// Database    : doott
//
// Architecture mirrors /api/inbuild-database — same Cloud SQL
// connection, same pattern (Redis stats cache, schema discovery,
// WHERE builder).  Table is read-only; no sync / embed routes.
// ============================================================

const express = require("express");
const router  = express.Router();

const { query: pgQuery } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");
const logger = require("../utils/logger").forAgent("PublicContactsDB");

// ── Table config ───────────────────────────────────────────
const PC_SCHEMA = "public";
const PC_TABLE  = "usa_public_contacts_82m";
const FULL_TABLE = `"${PC_SCHEMA}"."${PC_TABLE}"`;

// ── Cache keys ─────────────────────────────────────────────
const STATS_KEY  = "cache:public-contacts-stats";
const SCHEMA_KEY = "cache:public-contacts-schema"; // in-memory only
const STATS_TTL  = 300; // 5 minutes

// Columns to exclude from SELECT
const SKIP_IN_SELECT = new Set(["embedding", "_row_hash", "unnamed_13"]);

// ── Standard field map ─────────────────────────────────────
// Maps actual column names → standard API field names shown to the frontend.
const NORMALIZE = {
  // Name
  full_name:        "name",
  first_name:       "first_name",
  last_name:        "last_name",
  name:             "name",
  // Phone
  phone:            "phone",
  phone_number:     "phone",
  mobile:           "phone",
  // Email
  email:            "email",
  email_address:    "email",
  // Location
  city:             "city",
  state:            "state",
  zip:              "zip",
  zip_code:         "zip",
  // Address
  address:          "address",
  street_address:   "address",
  // Age / DOB
  age:              "age",
  dob:              "dob",
  date_of_birth:    "dob",
};

const CORE_FIELDS = new Set([
  "name", "first_name", "last_name", "phone", "email",
  "city", "state", "zip", "address", "age", "dob",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCHEMA DISCOVERY — lazy, in-memory cached
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

  const fieldToCol = {}; // standard_name → actual_db_col
  const colToField = {}; // actual_db_col → standard_name

  for (const col of selectCols) {
    const lower    = col.toLowerCase();
    const stdField = NORMALIZE[lower] || (CORE_FIELDS.has(lower) ? lower : null);
    if (stdField && !fieldToCol[stdField]) {
      fieldToCol[stdField] = col;
      colToField[col]      = stdField;
    }
  }

  for (const f of CORE_FIELDS) {
    if (!fieldToCol[f]) fieldToCol[f] = f;
  }

  logger.info(
    `[CloudSQL] PC Schema loaded — ${actualCols.length} total cols, ${selectCols.length} selected.`
  );

  _schemaCache = { actualCols, selectCols, selectSQL, fieldToCol, colToField };
  return _schemaCache;
}

/** Normalise a raw DB row → standard API shape */
function normalizeRow({ selectCols, colToField }, row) {
  const core  = {};
  const extra = {};

  for (const col of selectCols) {
    const val   = row[col] ?? "";
    const field = colToField[col];

    if (field && CORE_FIELDS.has(field)) {
      core[field] = val !== null ? String(val) : "";
    } else if (col !== "id") {
      extra[col] = val;
    }
  }

  for (const f of CORE_FIELDS) {
    if (core[f] === undefined) core[f] = "";
  }

  return { ...core, ...extra };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHERE CLAUSE BUILDER (fully parameterised)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildWhere({
  search = "",
  name   = "",
  email  = "",
  phone  = "",
  city   = "",
  state  = "",
  zip    = "",
  has_email = "",
  has_phone = "",
}, fieldToCol) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  const colName  = fieldToCol.name  || "full_name";
  const colEmail = fieldToCol.email || "email";
  const colPhone = fieldToCol.phone || "phone";
  const colCity  = fieldToCol.city  || "city";
  const colState = fieldToCol.state || "state";
  const colZip   = fieldToCol.zip   || "zip";

  if (search) {
    const targets = [colName, colEmail, colPhone, colCity, colState].filter(Boolean);
    const cols    = targets.map(c => `"${c}" ILIKE $${idx}`);
    conditions.push(`(${cols.join(" OR ")})`);
    values.push(`%${search}%`);
    idx++;
  }

  if (name && colName) {
    conditions.push(`"${colName}" ILIKE $${idx}`);
    values.push(`%${name}%`);
    idx++;
  }

  if (email && colEmail) {
    conditions.push(`"${colEmail}" ILIKE $${idx}`);
    values.push(`%${email}%`);
    idx++;
  }

  if (phone && colPhone) {
    conditions.push(`"${colPhone}" ILIKE $${idx}`);
    values.push(`%${phone}%`);
    idx++;
  }

  if (city && colCity) {
    conditions.push(`"${colCity}" ILIKE $${idx}`);
    values.push(`%${city}%`);
    idx++;
  }

  if (state && colState) {
    conditions.push(`"${colState}" ILIKE $${idx}`);
    values.push(`%${state}%`);
    idx++;
  }

  if (zip && colZip) {
    conditions.push(`"${colZip}" ILIKE $${idx}`);
    values.push(`%${zip}%`);
    idx++;
  }

  if (has_email === "true" && colEmail) {
    conditions.push(`("${colEmail}" IS NOT NULL AND "${colEmail}" != '')`);
  } else if (has_email === "false" && colEmail) {
    conditions.push(`("${colEmail}" IS NULL OR "${colEmail}" = '')`);
  }

  if (has_phone === "true" && colPhone) {
    conditions.push(`("${colPhone}" IS NOT NULL AND "${colPhone}" != '')`);
  } else if (has_phone === "false" && colPhone) {
    conditions.push(`("${colPhone}" IS NULL OR "${colPhone}" = '')`);
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
    res.json({
      ok: true,
      source: "cloud_sql",
      table: FULL_TABLE,
      serverTime: pingRes.rows[0].now,
      totalRecords,
    });
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
    const { actualCols, fieldToCol } = await getSchema();
    const coreKeys   = [...CORE_FIELDS].filter(f => fieldToCol[f]);
    const mappedCols = new Set(Object.values(fieldToCol));
    const extraKeys  = actualCols.filter(c => !mappedCols.has(c) && c !== "id");
    res.json({ columns: [...coreKeys, ...extraKeys], source: "cloud_sql", table: PC_TABLE });
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

    const { fieldToCol } = await getSchema();
    const emailCol = `"${fieldToCol.email || "email"}"`;
    const phoneCol = `"${fieldToCol.phone || "phone"}"`;

    const [totalRes, emailRes, phoneRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}`),
      pgQuery(
        `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}
         WHERE ${emailCol} IS NOT NULL AND ${emailCol} != ''`
      ),
      pgQuery(
        `SELECT COUNT(*) AS cnt FROM ${FULL_TABLE}
         WHERE ${phoneCol} IS NOT NULL AND ${phoneCol} != ''`
      ),
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
// POST /refresh — clear Redis stats + in-memory schema cache
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
    has_email = "",
    has_phone = "",
    sort_by   = "name",
    sort_dir  = "asc",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    const schema = await getSchema();
    const { fieldToCol, selectSQL } = schema;

    const { whereStr, values, nextIdx } = buildWhere(
      { search, name, email, phone, city, state, zip, has_email, has_phone },
      fieldToCol
    );

    const sortCol = `"${fieldToCol[sort_by] || fieldToCol.name || "full_name"}"`;
    const sortDir = sort_dir === "desc" ? "DESC" : "ASC";

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
