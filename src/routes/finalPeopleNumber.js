"use strict";
// ============================================================
// FINAL PEOPLE (NUMBER) — Route Handler
// Data source : Cloud SQL PostgreSQL (final.people)
// Filter      : Only rows where a phone column is non-empty
// ============================================================

const express = require("express");
const router  = express.Router();
const { query: pgQuery, directQueryWithSession } = require("../db/cloudSql");
const {
  escapeLike, INDIA_STATES_SQL, exactCappedTotal,
  searchTimeoutMs, resultWindowError, checkSortAllowed, sendSearchError, shortTitleNeedsFilter,
} = require("../utils/searchFilters");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");


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
    if (col === "country") {
      continue; // Handled centrally in buildWhere
    } else if (col === "has_email") {
      col = "emails";
      op = val === "true" ? "nonempty" : "empty";
    } else if ((col === "email_status" || col === "is_email_valid") && val !== "") {
      const valLower = val.toLowerCase().trim();
      const hasEmailStatus = schemaColumns.includes("email_status");
      const hasIsEmailValid = schemaColumns.includes("is_email_valid");
      const subConds = [];

      if (valLower === "deliverable" || valLower === "valid" || valLower === "true") {
        if (hasEmailStatus) subConds.push(`"email_status" IN ('deliverable', 'valid')`);
        if (hasIsEmailValid) subConds.push(`"is_email_valid" = true`);
      } else if (valLower === "undeliverable" || valLower === "invalid" || valLower === "false") {
        // Only the status column: is_email_valid is FALSE for risky / unknown / undeliverable alike,
        // so "is_email_valid = false" would also return risky and unknown addresses.
        if (hasEmailStatus) subConds.push(`"email_status" IN ('undeliverable', 'invalid')`);
        else if (hasIsEmailValid) subConds.push(`"is_email_valid" = false`);
      } else if (valLower === "risky" || valLower.includes("catch")) {
        if (hasEmailStatus) subConds.push(`"email_status" IN ('risky', 'catch_all', 'catch-all')`);
      } else if (valLower === "unknown" || valLower === "unverified") {
        if (hasEmailStatus) subConds.push(`("email_status" IN ('unknown', 'unverified') OR "email_status" IS NULL)`);
      } else {
        if (hasEmailStatus) {
          const sIdx = idx++;
          values.push(escapeLike(val));
          subConds.push(`"email_status" ILIKE $${sIdx}`);
        }
      }

      if (subConds.length > 0) {
        conditions.push(`(${subConds.join(" OR ")})`);
        continue;
      }
    } else if ((col === "phone_status" || col === "is_phone_valid") && val !== "") {
      const valLower = val.toLowerCase().trim();
      const hasPhoneStatus = schemaColumns.includes("phone_status");
      const hasIsPhoneValid = schemaColumns.includes("is_phone_valid");
      const subConds = [];

      if (valLower === "valid" || valLower === "verified" || valLower === "true") {
        if (hasPhoneStatus) subConds.push(`"phone_status" IN ('valid', 'verified', 'mobile', 'landline', 'toll_free')`);
        if (hasIsPhoneValid) subConds.push(`"is_phone_valid" = true`);
      } else if (valLower === "invalid" || valLower === "false") {
        if (hasPhoneStatus) subConds.push(`"phone_status" = 'invalid'`);
        if (hasIsPhoneValid) subConds.push(`"is_phone_valid" = false`);
      } else if (valLower === "mobile" || valLower === "landline" || valLower === "toll_free") {
        if (hasPhoneStatus) subConds.push(`"phone_status" = '${valLower}'`);
      } else {
        if (hasPhoneStatus) {
          const sIdx = idx++;
          values.push(escapeLike(val));
          subConds.push(`"phone_status" ILIKE $${sIdx}`);
        }
      }

      if (subConds.length > 0) {
        conditions.push(`(${subConds.join(" OR ")})`);
        continue;
      }
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
        values.push(`${escapeLike(val)}%`);
      }
    } else if (op === "ew") {
      if (val !== "") {
        conditions.push(`${doubleQuotedCol} ILIKE $${idx++}`);
        values.push(`%${escapeLike(val)}`);
      }
    } else if (op === "nonempty") {
      // Works for plain TEXT columns AND array-literal strings ({} / {val1,val2})
      conditions.push(`(${doubleQuotedCol} IS NOT NULL AND ${doubleQuotedCol} <> '' AND ${doubleQuotedCol} <> '{}')`);
    } else if (op === "empty") {
      conditions.push(`(${doubleQuotedCol} IS NULL OR ${doubleQuotedCol} = '' OR ${doubleQuotedCol} = '{}')`);
    } else if (op === "contains") {
      if (val !== "") {
        if (val === "true" || val === "false") {
          conditions.push(`${doubleQuotedCol} = $${idx++}`);
          values.push(val);
        } else {
          conditions.push(`${doubleQuotedCol} ILIKE $${idx++}`);
          values.push(`%${escapeLike(val)}%`);
        }
      }
    }
  }

  return { conditions, nextIdx: idx };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHERE CLAUSE BUILDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildWhere(queryParams, phoneCol, schemaColumns) {
  const { search = "" } = queryParams;
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  // Base filter: must have phone (phones is TEXT storing array-literal like {+44..} or {})
  if (phoneCol) {
    conditions.push(`("${phoneCol}" IS NOT NULL AND "${phoneCol}" <> '' AND "${phoneCol}" <> '{}')`);
  }

  // search: ILIKE on full_name only (trgm GIN indexed -> super fast!)
  if (search) {
    conditions.push(`"full_name" ILIKE $${idx++}`);
    values.push(`%${escapeLike(search)}%`);
  }

  // Parse all query filters dynamically
  const { conditions: dynamicConditions, nextIdx } = parseQueryParamsToSQL(
    queryParams,
    schemaColumns,
    values,
    idx
  );
  conditions.push(...dynamicConditions);
  idx = nextIdx;

  // Handle explicit country filter (supports f_country, f_country_eq, f_country_contains, country)
  const countryParam = (
    queryParams.f_country ||
    queryParams.f_country_eq ||
    queryParams.f_country_contains ||
    queryParams.country ||
    ""
  ).toLowerCase().trim();

  const alreadyHasExplicitCountry = conditions.some(c =>
    c.startsWith('"state"') ||
    c.startsWith('"city"') ||
    c.includes('"location" ILIKE \'%United States%\'')
  );

  if (!alreadyHasExplicitCountry && countryParam) {
    if (countryParam === "india" || countryParam === "in") {
      conditions.push(`(
        ("geo_source" IS NULL OR "geo_source" NOT IN ('us_zip', 'us_city', 'us_state'))
        AND ("state" IS NULL OR "state" NOT IN ('CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI', 'CO', 'MN', 'SC', 'AL', 'LA', 'KY', 'OR', 'OK', 'CT', 'UT', 'IA', 'NV', 'AR', 'MS', 'KS', 'NM', 'NE', 'ID', 'WV', 'HI', 'NH', 'ME', 'MT', 'RI', 'DE', 'SD', 'ND', 'AK', 'DC', 'VT', 'WY'))
        AND ("location" IS NULL OR ("location" NOT ILIKE '%United States%' AND "location" NOT ILIKE '%USA%'))
        AND "state" IN (${INDIA_STATES_SQL})
      )`);
    } else if (countryParam === "usa" || countryParam === "us" || countryParam === "united states") {
      conditions.push(`(
        "geo_source" IN ('us_zip', 'us_city', 'us_state')
        OR "location" ILIKE '%United States%'
        OR "state" IN ('CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI', 'CO', 'MN', 'SC', 'AL', 'LA', 'KY', 'OR', 'OK', 'CT', 'UT', 'IA', 'NV', 'AR', 'MS', 'KS', 'NM', 'NE', 'ID', 'WV', 'HI', 'NH', 'ME', 'MT', 'RI', 'DE', 'SD', 'ND', 'AK', 'DC', 'VT', 'WY')
      )`);
    }
  }

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
    const cached = await cacheGet("cache:final-people-number-stats");
    if (cached) return res.json(cached);

    const schema   = await getSchema();
    const phoneCol = await getPhoneCol(schema);
    const filter   = phoneCol
      ? `WHERE "${phoneCol}" IS NOT NULL AND "${phoneCol}" <> '' AND "${phoneCol}" <> '{}'`
      : "";
    
    let total = 18537432;
    try {
      const explainRes = await pgQuery(`EXPLAIN SELECT * FROM ${FULL_TABLE} ${filter}`, [], 5000);
      if (explainRes.rows && explainRes.rows[0]) {
        const planStr = explainRes.rows[0]["QUERY PLAN"] || "";
        const match = planStr.match(/rows=(\d+)/);
        if (match) total = parseInt(match[1], 10);
      }
    } catch (_) {}

    const payload = {
      total,
      source: "cloud_sql",
      table:  FP_TABLE,
    };
    await cacheSet("cache:final-people-number-stats", payload, 600);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/refresh", async (req, res) => {
  _schemaCache   = null;
  _phoneColCache = null;
  await cacheDel("cache:final-people-number-stats");
  await cacheDel("cache:final-people-number-total");
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

  const parsedPage  = parseInt(page, 10);
  const parsedLimit = parseInt(limit, 10);
  const pageNum  = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limitNum = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(100, parsedLimit) : 50;
  const offset   = (pageNum - 1) * limitNum;
  const windowErr = resultWindowError(offset, limitNum);
  if (windowErr) return res.status(400).json(windowErr);
  const shortErr = shortTitleNeedsFilter(req.query);
  if (shortErr) return res.status(400).json(shortErr);

  try {
    const schema = await getSchema();
    const { selectSQL, selectCols } = schema;
    const phoneCol = await getPhoneCol(schema);

    const { whereStr, values, nextIdx } = buildWhere(
      req.query,
      phoneCol,
      selectCols
    );

    let orderClause = "";
    if (sort_by && selectCols.includes(sort_by)) {
      const dir = sort_dir === "desc" ? "DESC" : "ASC";
      orderClause = `ORDER BY "${sort_by}" ${dir} NULLS LAST`;
    }
    if (orderClause && vectorIdx === null) {
      // Sorting millions of rows always times out — only allow it on narrow result sets.
      const sortErr = await checkSortAllowed(pgQuery, FULL_TABLE, whereStr, values, values.length > 0);
      if (sortErr) return res.status(400).json(sortErr);
    }


    const dataSQL = `
      SELECT ${selectSQL} FROM ${FULL_TABLE}
      ${whereStr}
      ${orderClause}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;

    const dataRes = values.length > 0
      ? await directQueryWithSession(dataSQL, [...values, limitNum, offset], ["SET LOCAL enable_seqscan = off;"], searchTimeoutMs())
      : await pgQuery(dataSQL, [...values, limitNum, offset], 30000);

    const records = dataRes.rows.map(row => normalizeRow(schema, row));

    let total;
    let totalExact = false;
    if (records.length < limitNum && pageNum === 1) {
      total = records.length;
      totalExact = true;
    } else {
      const isBaseQuery = !search && values.length === 0;
      if (isBaseQuery) {
        const cachedTotal = await cacheGet("cache:final-people-number-total");
        if (cachedTotal) {
          total = cachedTotal;
        }
      }

      if (!total && !isBaseQuery) {
        // Exact count when the filter matches ≤ 10,000 rows; planner estimate only beyond that.
        const exact = await exactCappedTotal(pgQuery, FULL_TABLE, whereStr, values);
        if (exact) {
          total = exact.total;
          totalExact = true;
        }
      }

      if (!total && !totalExact) {
        try {
          const explainRes = await pgQuery(`EXPLAIN SELECT ${selectSQL} FROM ${FULL_TABLE} ${whereStr}`, values, 5000);
          if (explainRes.rows && explainRes.rows[0]) {
            const planStr = explainRes.rows[0]["QUERY PLAN"] || "";
            const match = planStr.match(/rows=(\d+)/);
            if (match) {
              total = parseInt(match[1], 10);
              if (isBaseQuery) {
                await cacheSet("cache:final-people-number-total", total, 600);
              }
            }
          }
        } catch (_) {}
      }

      if (!total && !totalExact) {
        total = records.length < limitNum
          ? ((pageNum - 1) * limitNum) + records.length
          : (pageNum * limitNum) + 1000;
        totalExact = records.length < limitNum;
      }
    }

    res.json({
      records,
      total,
      total_exact: totalExact,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
    });
  } catch (err) {
    return sendSearchError(res, err, logger);
  }
});

module.exports = router;
