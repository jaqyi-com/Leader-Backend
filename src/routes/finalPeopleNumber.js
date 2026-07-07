"use strict";
// ============================================================
// FINAL PEOPLE (NUMBER) — Route Handler
// Data source : Cloud SQL PostgreSQL (final.people)
// Filter      : Only rows where a phone column is non-empty
// ============================================================

const express = require("express");
const router  = express.Router();
const { query: pgQuery } = require("../db/cloudSql");
const logger = require("../utils/logger").forAgent("FinalPeopleNumberDB");

const FP_SCHEMA  = "final";
const FP_TABLE   = "people";
const FULL_TABLE = `"${FP_SCHEMA}"."${FP_TABLE}"`;

const SKIP_IN_SELECT = new Set(["_row_hash", "embedding", "uuid", "company_uuid", "id", "_id"]);

let _schemaCache    = null;
let _phoneColCache  = null;

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

  _schemaCache = { actualCols, selectCols, selectSQL, fieldToCol, colToField };
  return _schemaCache;
}

async function getPhoneCol(schema) {
  if (_phoneColCache) return _phoneColCache;
  const phoneCandidates = [
    "phones", "phone", "phone_number", "mobile", "contact_number", "work_phone",
  ];
  for (const col of phoneCandidates) {
    if (schema.actualCols.includes(col)) {
      _phoneColCache = col;
      return col;
    }
  }
  const found = schema.actualCols.find(c => c.toLowerCase().includes("phone") || c.toLowerCase().includes("mobile"));
  _phoneColCache = found || null;
  return _phoneColCache;
}

function normalizeRow({ selectCols, colToField }, row) {
  const out = {};
  for (const col of selectCols) {
    const field = colToField[col] || col;
    const val   = row[col];
    out[field] = val !== null && val !== undefined ? String(val) : "";
  }
  const full = out.full_name || "";
  if (full && !out.first_name) {
    const parts = full.trim().split(/\s+/);
    out.first_name = parts[0] || "";
    out.last_name  = parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  return out;
}

function buildWhere(
  { search = "", f_city = "", f_state = "", f_job_title = "", f_location = "" },
  phoneCol
) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  // Base filter: must have phone
  if (phoneCol) {
    conditions.push(`("${phoneCol}" IS NOT NULL AND "${phoneCol}" <> '')`);
  }

  // search: ILIKE on full_name only (trgm GIN indexed -> super fast!)
  if (search) {
    conditions.push(`"full_name" ILIKE $${idx++}`);
    values.push(`%${search}%`);
  }

  if (f_city)      { conditions.push(`"city"      ILIKE $${idx++}`); values.push(`${f_city}%`); }
  if (f_state)     { conditions.push(`"state"     ILIKE $${idx++}`); values.push(`${f_state}%`); }
  if (f_job_title) { conditions.push(`"job_title" ILIKE $${idx++}`); values.push(`%${f_job_title}%`); }
  if (f_location)  { conditions.push(`"location"  ILIKE $${idx++}`); values.push(`%${f_location}%`); }

  return {
    whereStr: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
    nextIdx: idx,
  };
}

router.get("/health", async (req, res) => {
  try {
    const pingRes = await pgQuery("SELECT NOW() AS now");
    const schema  = await getSchema();
    const phoneCol = await getPhoneCol(schema);
    const filter = phoneCol
      ? `WHERE "${phoneCol}" IS NOT NULL AND "${phoneCol}" <> ''`
      : "";
    const cnt = await pgQuery(`SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM ${FULL_TABLE} ${filter} LIMIT 10001) subq`, [], 15000);
    const totalRecords = parseInt(cnt.rows[0].cnt, 10);
    res.json({ ok: true, source: "cloud_sql", table: FULL_TABLE, serverTime: pingRes.rows[0].now, totalRecords });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

router.get("/columns", async (req, res) => {
  try {
    const { selectCols } = await getSchema();
    res.json({ columns: selectCols });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const schema   = await getSchema();
    const phoneCol = await getPhoneCol(schema);
    const filter   = phoneCol
      ? `WHERE "${phoneCol}" IS NOT NULL AND "${phoneCol}" <> ''`
      : "";
    const totalRes = await pgQuery(`SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM ${FULL_TABLE} ${filter} LIMIT 100001) subq`, [], 20000);
    res.json({
      total:  parseInt(totalRes.rows[0].cnt, 10),
      source: "cloud_sql",
      table:  FP_TABLE,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/refresh", async (req, res) => {
  _schemaCache   = null;
  _phoneColCache = null;
  res.json({ success: true, message: "Local in-memory schema caches cleared." });
});

router.get("/", async (req, res) => {
  const {
    page      = 1,
    limit     = 50,
    search    = "",
    sort_by   = "",
    sort_dir  = "asc",
    f_city    = "",
    f_state   = "",
    f_job_title = "",
    f_location = "",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    const schema = await getSchema();
    const { selectSQL, selectCols } = schema;
    const phoneCol = await getPhoneCol(schema);

    const { whereStr, values, nextIdx } = buildWhere(
      { search, f_city, f_state, f_job_title, f_location },
      phoneCol
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

    // Direct DB count every time (no Redis cache!)
    const countRes = await pgQuery(
      `SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM ${FULL_TABLE} ${whereStr} LIMIT 100001) subq`,
      values,
      30000
    );
    const total = parseInt(countRes.rows[0].cnt, 10);

    const dataRes = await pgQuery(dataSQL, [...values, limitNum, offset], 60000);
    const records = dataRes.rows.map(row => normalizeRow(schema, row));

    res.json({
      records,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
    });
  } catch (err) {
    logger.error(`[GET /] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
