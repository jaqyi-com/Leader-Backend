"use strict";
// ============================================================
// FINAL PEOPLE — Route Handler
// ============================================================
// Data source : Cloud SQL PostgreSQL (public.final_people)
// Instance    : sigma-current-497209-i6:us-central1:leader (34.71.167.187)
// Database    : doott
//
// Architecture:
//   • All READ queries  → Cloud SQL (public.final_people)
//   • POST /refresh     → Clears Redis stats cache + schema cache
//   • GET  /health      → Cloud SQL connectivity + row count
// ============================================================

const express = require("express");
const router  = express.Router();

const { query: pgQuery, directQueryWithSession } = require("../db/cloudSql");
// Count/sort-guard queries use the index plan: exact when a filter matches few rows, they time out
// (and fall back to an estimate) when it matches millions.
const indexedQuery = (sql, params, ms) => directQueryWithSession(sql, params, ["SET LOCAL enable_seqscan = off;"], ms);
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");
const {
  escapeLike, hasWord, jobTitleCondition, INDIA_STATES_SQL, exactCappedTotal,
  searchTimeoutMs, resultWindowError, checkSortAllowed, sendSearchError, shortTitleNeedsFilter, runFilteredSearch,
} = require("../utils/searchFilters");


const logger = require("../utils/logger").forAgent("FinalPeopleDB");

// ── Table config ───────────────────────────────────────────
const FP_SCHEMA  = "final";
const FP_TABLE   = "people";
const FULL_TABLE = `"${FP_SCHEMA}"."${FP_TABLE}"`;

// ── Cache ──────────────────────────────────────────────────
const STATS_KEY     = "cache:final-people-stats";
const COUNT_CACHE_KEY = "cache:final-people-count";
const STATS_TTL     = 300; // 5 min
const COUNT_TTL     = 120; // 2 min

// Columns to exclude from SELECT output
const SKIP_IN_SELECT = new Set(["_row_hash", "embedding", "uuid", "company_uuid", "id", "_id"]);

// ── In-memory schema cache ─────────────────────────────────
const KNOWN_PEOPLE_COLS = [
  "uuid", "company_uuid", "full_name", "first_name", "last_name", "job_title",
  "linked_url", "location", "city", "state", "pincode", "lat", "long",
  "geo_source", "emails", "phones", "created_at", "embedding",
  "is_email_valid", "email_status", "email_score", "email_verified_at"
];

function buildSchemaObj(actualCols) {
  const selectCols = actualCols.filter(c => !SKIP_IN_SELECT.has(c));
  const selectSQL  = selectCols.map(c => `"${c}"`).join(", ");

  const colToField = {};
  const fieldToCol = {};
  for (const col of selectCols) {
    colToField[col] = col;
    if (!fieldToCol[col]) fieldToCol[col] = col;
  }
  return { actualCols, selectCols, selectSQL, fieldToCol, colToField };
}

let _schemaCache = buildSchemaObj(KNOWN_PEOPLE_COLS);

async function getSchema() {
  return _schemaCache;
}

function normalizeRow({ selectCols, colToField }, row) {
  const out = {};
  for (const col of selectCols) {
    const field = colToField[col] || col;
    const val   = row[col];
    out[field] = val !== null && val !== undefined ? String(val) : "";
  }

  // Auto-derive first_name / last_name from full_name when DB has nulls
  const full = out.full_name || "";
  if (full && !out.first_name) {
    const parts = full.trim().split(/\s+/);
    out.first_name = parts[0] || "";
    out.last_name  = parts.length > 1 ? parts.slice(1).join(" ") : "";
  }

  return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHERE CLAUSE BUILDER
// Supported params:
//   search      — ILIKE on full_name only (GIN trgm indexed → fast on 43M rows)
//   f_city      — city ILIKE 'value%'   (BTree indexed)
//   f_state     — state ILIKE 'value%'  (BTree indexed)
//   f_pincode   — pincode = 'value'     (BTree indexed)
//   f_job_title — job_title ILIKE '%value%' (BTree indexed for prefix)
//   f_location  — location ILIKE 'value%'
//   f_geo_source— geo_source = 'value'
//   f_has_email — 'true'/'false'        (GIN array indexed)
//   f_has_phone — 'true'/'false'        (GIN array indexed)
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
    if (col === "country") {
      continue; // Handled centrally in buildWhere if no specific city/state filter is present
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
    } else if (col === "city" && val !== "") {
      const CITY_ALIASES = {
        "bengaluru": ["Bengaluru", "Bangalore"],
        "bangalore": ["Bangalore", "Bengaluru"],
        "gurugram": ["Gurugram", "Gurgaon"],
        "gurgaon": ["Gurgaon", "Gurugram"],
        "kolkata": ["Kolkata", "Calcutta"],
        "calcutta": ["Calcutta", "Kolkata"],
        "chennai": ["Chennai", "Madras"],
        "madras": ["Madras", "Chennai"],
        "thiruvananthapuram": ["Thiruvananthapuram", "Trivandrum"],
        "trivandrum": ["Trivandrum", "Thiruvananthapuram"],
        "kochi": ["Kochi", "Cochin", "Ernakulam"],
        "cochin": ["Cochin", "Kochi", "Ernakulam"],
        "vadodara": ["Vadodara", "Baroda"],
        "baroda": ["Baroda", "Vadodara"],
        "nashik": ["Nashik", "Nasik"],
        "nasik": ["Nasik", "Nashik"],
        "puducherry": ["Puducherry", "Pondicherry"],
        "pondicherry": ["Pondicherry", "Puducherry"],
        "mysuru": ["Mysuru", "Mysore"],
        "mysore": ["Mysore", "Mysuru"],
        "mangaluru": ["Mangaluru", "Mangalore"],
        "mangalore": ["Mangalore", "Mangaluru"],
        "belagavi": ["Belagavi", "Belgaum"],
        "belgaum": ["Belgaum", "Belagavi"],
      };
      const valLower = val.toLowerCase().trim();
      const aliases = CITY_ALIASES[valLower];
      if (aliases && aliases.length > 0) {
        const aliasConds = aliases.map(a => {
          const aIdx = idx++;
          values.push(`${a}%`);
          return `"city" ILIKE $${aIdx}`;
        });
        conditions.push(`(${aliasConds.join(" OR ")})`);
        continue;
      }
    }


    // Verify column exists in the schema to prevent SQL injection
    if (!schemaColumns.includes(col)) {
      continue;
    }

    const doubleQuotedCol = `"${col}"`;

    if (col === "job_title" && val !== "" && op === "contains") {
      const valLower = val.toLowerCase().trim();

      const JOB_TITLE_ALIASES = {
        "hospitals": ["Hospital", "Healthcare", "Health", "Medical", "Doctor", "Physician", "Surgeon"],
        "hospital": ["Hospital", "Healthcare", "Health", "Medical", "Doctor", "Physician", "Surgeon"],
        "food": ["Food", "Beverage", "FMCG", "Chef", "Catering", "Dairy", "Nutrition"],
        "fmcg / food & beverage": ["Food", "Beverage", "FMCG", "Chef", "Catering", "Dairy", "Nutrition"],
        "restaurant": ["Restaurant", "Cafe", "Dining", "Chef", "Baker", "Cook"],
        "restaurants": ["Restaurant", "Cafe", "Dining", "Chef", "Baker", "Cook"],
        "restaurants & cafes": ["Restaurant", "Cafe", "Dining", "Chef", "Baker", "Cook"],
        "fitness": ["Fitness", "Gym", "Trainer", "Wellness", "Coach"],
        "fitness / wellness": ["Fitness", "Gym", "Trainer", "Wellness", "Coach"],
        "real estate": ["Real Estate", "Property", "Realtor", "Broker", "Architect", "Builder"],
        "real estate & construction": ["Real Estate", "Property", "Realtor", "Broker", "Architect", "Builder"],
        "automobile": ["Automobile", "Automotive", "Auto", "Vehicle", "Dealer"],
        "automobile / dealerships": ["Automobile", "Automotive", "Auto", "Vehicle", "Dealer"],
        "education": ["Education", "Teacher", "Professor", "Academic", "Principal", "EdTech"],
        "education / edtech": ["Education", "Teacher", "Professor", "Academic", "Principal", "EdTech"],
        "finance": ["Finance", "Financial", "Accountant", "CFO", "Banking", "Investor", "CA"],
        "financial services / insurance": ["Finance", "Financial", "Accountant", "CFO", "Banking", "Investor", "CA"],
        "retail": ["Retail", "Store", "Sales", "Merchant", "Brand"],
        "retail / d2c / consumer brands": ["Retail", "Store", "Sales", "Merchant", "Brand"],
        "hotel": ["Hotel", "Hospitality", "Resort", "Lodging"],
        "hospitality & hotels": ["Hotel", "Hospitality", "Resort", "Lodging"],
        "hospitality": ["Hotel", "Hospitality", "Resort", "Lodging"],
        "fashion": ["Fashion", "Apparel", "Garment", "Designer", "Textile"],
        "fashion / lifestyle": ["Fashion", "Apparel", "Garment", "Designer", "Textile"],
        "software": ["Software", "Engineer", "Developer", "CTO", "SaaS", "IT", "Architect"],
        "software engineer": ["Software", "Engineer", "Developer", "IT"],
        "senior software engineer": ["Software", "Engineer", "Developer", "IT"],
        "lead engineer": ["Lead Engineer", "Engineer", "Developer", "Tech Lead"],
        "product manager": ["Product Manager", "Product"],
        "general manager": ["General Manager", "Manager"],
        "human resources manager": ["Human Resources", "HR Manager", "HR"],
        "director": ["Director", "Managing Director", "Executive Director"],
        "managing director": ["Managing Director", "Director"],
        "founder": ["Founder", "Co-Founder"],
        "co-founder": ["Co-Founder", "Founder"],
        "ceo": ["CEO", "Chief Executive Officer"],
        "chief executive officer": ["Chief Executive Officer", "CEO"],
        "cto": ["CTO", "Chief Technology Officer"],
        "chief technology officer": ["Chief Technology Officer", "CTO"],
        "technology / startups": ["Software", "Engineer", "Developer", "CTO", "SaaS", "IT", "Architect"],
        "travel": ["Travel", "Tourism", "Hospitality", "Guide"],
        "travel & recreation": ["Travel", "Tourism", "Hospitality", "Guide"],
        "environmental health safety": ["Environmental Health Safety", "Environmental Health & Safety", "Environmental Health and Safety", "EHS"],
        "environmental health & safety": ["Environmental Health Safety", "Environmental Health & Safety", "Environmental Health and Safety", "EHS"],
        "environmental health and safety": ["Environmental Health Safety", "Environmental Health & Safety", "Environmental Health and Safety", "EHS"],
        "hr manager": ["HR", "Human Resources", "People", "Talent"],
        "talent acquisition specialist": ["Talent", "Recruiter", "Recruitment", "HR"],
        "digital marketing specialist": ["Digital Marketing", "Marketing", "SEO", "Growth"],
        "chartered accountant": ["Chartered Accountant", "Accountant", "Finance", "CA", "Audit"],
        "legal counsel": ["Legal", "Counsel", "Attorney", "Lawyer", "Advocate"],
        "advocate": ["Advocate", "Lawyer", "Legal", "Attorney", "Counsel"],
      };

      const directAliases = JOB_TITLE_ALIASES[valLower];
      if (directAliases && directAliases.length > 0) {
        const aliasConds = directAliases.map(a => {
          const c = jobTitleCondition(a, values, idx);
          idx = c.nextIdx;
          return c.sql;
        });
        conditions.push(`(${aliasConds.join(" OR ")})`);
        continue;
      }

      // Check single role key matches (Founder, CEO, CTO, Director)
      const titleSet = new Set();
      if (valLower.includes("founder")) {
        ["Founder", "Co-Founder"].forEach(v => titleSet.add(v));
      }
      if (hasWord(valLower, "ceo")) {
        ["CEO", "Chief Executive Officer"].forEach(v => titleSet.add(v));
      }
      if (hasWord(valLower, "cto")) {
        ["CTO", "Chief Technology Officer"].forEach(v => titleSet.add(v));
      }
      if (valLower.includes("director")) {
        ["Director", "Managing Director"].forEach(v => titleSet.add(v));
      }

      if (titleSet.size > 0) {
        const titlesArray = Array.from(titleSet);
        const aliasConds = titlesArray.map(t => {
          const c = jobTitleCondition(t, values, idx);
          idx = c.nextIdx;
          return c.sql;
        });
        conditions.push(`(${aliasConds.join(" OR ")})`);
        continue;
      }

      // Multi-word / unmapped custom search: Exact phrase OR constituent words matching with OR
      const words = valLower.split(/[\s\-\/&\+]+/).filter(w => w.length > 2 && !["and", "the", "for", "with"].includes(w));
      if (words.length > 1) {
        const phraseIdx = idx++;
        values.push(`%${escapeLike(val.trim())}%`);

        const wordConds = words.map(w => {
          const c = jobTitleCondition(w, values, idx);
          idx = c.nextIdx;
          return c.sql;
        });
        conditions.push(`("job_title" ILIKE $${phraseIdx} OR (${wordConds.join(" OR ")}))`);
      } else {
        const c = jobTitleCondition(val.trim(), values, idx);
        idx = c.nextIdx;
        conditions.push(c.sql);
      }
      continue;
    }

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
          const rawVal = String(val).trim();
          const words = rawVal.split(/[\s\-_\/]+/).filter(w => w.length > 0);
          if (words.length <= 1) {
            conditions.push(`${doubleQuotedCol} ILIKE $${idx++}`);
            values.push(`%${escapeLike(rawVal)}%`);
          } else {
            // Match exact phrase, normalized spaced phrase, OR all constituent tokens
            const phraseIdx = idx++;
            values.push(`%${escapeLike(rawVal)}%`);
            
            const spacedVal = words.join(" ");
            let spacedIdx = null;
            if (spacedVal.toLowerCase() !== rawVal.toLowerCase()) {
              spacedIdx = idx++;
              values.push(`%${escapeLike(spacedVal)}%`);
            }
            
            const wordConds = words.map(w => {
              const wIdx = idx++;
              values.push(`%${escapeLike(w)}%`);
              return `${doubleQuotedCol} ILIKE $${wIdx}`;
            });
            
            if (spacedIdx !== null) {
              conditions.push(`(${doubleQuotedCol} ILIKE $${phraseIdx} OR ${doubleQuotedCol} ILIKE $${spacedIdx} OR (${wordConds.join(" AND ")}))`);
            } else {
              conditions.push(`(${doubleQuotedCol} ILIKE $${phraseIdx} OR (${wordConds.join(" AND ")}))`);
            }
          }
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
    conditions.push(`"full_name" ILIKE $${idx++}`);
    values.push(`%${escapeLike(search)}%`);
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

  const userHasFilters = conditions.length > 0 || (embedding && embedding.length === 384);

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
    res.json({ ok: true, version: "v2026.10.02-a42c9bb", source: "cloud_sql", table: FULL_TABLE,
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
    res.json({ columns: selectCols, source: "cloud_sql", table: FP_TABLE });
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
      table:  FP_TABLE,
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
    await cacheDel("cache:final-people-categories-v1");
    res.json({ success: true, message: "Final People cache cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /categories
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/categories", async (req, res) => {
  try {
    const cached = await cacheGet("cache:final-people-categories-v1");
    if (cached) return res.json(cached);

    const queryRes = await pgQuery(
      `SELECT job_title, count(*) as count 
       FROM (
         SELECT job_title 
         FROM ${FULL_TABLE} 
         WHERE job_title IS NOT NULL AND job_title != '' 
         LIMIT 20000
       ) AS sub 
       GROUP BY job_title 
       ORDER BY count DESC 
       LIMIT 100`,
       [],
       10000
    );

    const payload = queryRes.rows.map(r => ({
      name: r.job_title,
      count: parseInt(r.count, 10)
    }));

    await cacheSet("cache:final-people-categories-v1", payload, 86400); // 24 hours
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
    f_city, f_state, f_pincode, f_job_title, f_location, f_geo_source,
    f_has_email, f_has_phone,
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
    const { getLocalQueryEmbedding } = require("../services/localEmbedService");
    let embedding = null;
    if (search && search.trim().length > 0) {
      try {
        embedding = await getLocalQueryEmbedding(search);
      } catch (err) {
        logger.error(`Failed to generate query embedding for people search: ${err.message}`);
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
    } else if (sort_by && selectCols.includes(sort_by) && (sort_by !== "uuid" || !userHasFilters)) {
      const dir = sort_dir === "desc" ? "DESC" : "ASC";
      orderClause = `ORDER BY "${sort_by}" ${dir} NULLS LAST`;
    } else {
      // Omit ORDER BY when no explicit sort requested to allow 13x faster sequential page scan (< 280ms)
      orderClause = "";
    }

    if (orderClause && vectorIdx === null) {
      // Sorting millions of rows always times out — only allow it on narrow result sets.
      const sortErr = await checkSortAllowed(indexedQuery, FULL_TABLE, whereStr, values, userHasFilters);
      if (sortErr) return res.status(400).json(sortErr);
    }

    const dataSQL = `
      SELECT ${customSelectSQL} FROM ${FULL_TABLE}
      ${whereStr}
      ${orderClause}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;

    const dataPromise = userHasFilters
      ? runFilteredSearch(directQueryWithSession, dataSQL, [...values, limitNum, offset], searchTimeoutMs(), { vector: vectorIdx !== null })
      : pgQuery(dataSQL, [...values, limitNum, offset], 30000);

    const dataRes = await dataPromise;
    const records = dataRes.rows.map(row => normalizeRow(schema, row));

    let total;
    let totalExact = false;
    if (!userHasFilters) {
      const cachedCount = await cacheGet(COUNT_CACHE_KEY);
      if (cachedCount !== null && cachedCount !== undefined) {
        total = cachedCount;
      } else {
        try {
          const countRes = await pgQuery(
            `SELECT reltuples::bigint AS cnt FROM pg_class WHERE oid = $1::regclass`,
            [FULL_TABLE],
            2000
          );
          total = parseInt(countRes.rows[0]?.cnt || "0", 10);
          await cacheSet(COUNT_CACHE_KEY, total, COUNT_TTL);
        } catch (_) {
          total = 45059532;
        }
      }
    } else {
      if (records.length < limitNum && pageNum === 1) {
        total = records.length;
        totalExact = true;
      } else {
        // Exact count when the filter matches ≤ 10,000 rows; planner estimate only beyond that.
        const exact = await exactCappedTotal(indexedQuery, FULL_TABLE, whereStr, values);
        if (exact) {
          total = exact.total;
          totalExact = true;
        } else {
          try {
            const explainRes = await pgQuery(`EXPLAIN SELECT ${selectSQL} FROM ${FULL_TABLE} ${whereStr}`, values, 5000);
            if (explainRes.rows && explainRes.rows[0]) {
              const planStr = explainRes.rows[0]["QUERY PLAN"] || "";
              const match = planStr.match(/rows=(\d+)/);
              if (match) total = parseInt(match[1], 10);
            }
          } catch (_) {}
          if (!total) {
            total = records.length < limitNum
              ? ((pageNum - 1) * limitNum) + records.length
              : (pageNum * limitNum) + 1000;
            totalExact = records.length < limitNum;
          }
        }
      }
    }

    res.json({
      records,
      total,
      total_exact: totalExact,
      page:   pageNum,
      limit:  limitNum,
      pages:  Math.ceil(total / limitNum),
      source: "cloud_sql",
      table:  FP_TABLE,
    });
  } catch (err) {
    return sendSearchError(res, err, logger);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /cities  — distinct cities with people counts (City Explorer)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CITIES_CACHE_KEY = "cache:final-people-cities";
const CITIES_CACHE_TTL = 60 * 60 * 6; // 6 hours

router.get("/cities", async (req, res) => {
  try {
    const cached = await cacheGet(CITIES_CACHE_KEY);
    if (cached) return res.json({ ...cached, _cache: "hit" });

    const { selectCols } = await getSchema();
    const hasCity     = selectCols.includes("city");
    const hasState    = selectCols.includes("state");
    const hasLocation = selectCols.includes("location");

    // Prefer city column; fall back to location
    const cityCol = hasCity ? "city" : hasLocation ? "location" : null;
    if (!cityCol) {
      return res.json({ cities: [], total: 0, source: "cloud_sql", note: "No city column in final.people" });
    }

    const selectPart = hasState
      ? `"${cityCol}", "state", COUNT(*) AS count`
      : `"${cityCol}", NULL AS state, COUNT(*) AS count`;
    const groupPart  = hasState ? `"${cityCol}", "state"` : `"${cityCol}"`;

    const sql = `
      SELECT ${selectPart}
      FROM ${FULL_TABLE}
      WHERE "${cityCol}" IS NOT NULL AND "${cityCol}" != ''
      GROUP BY ${groupPart}
      ORDER BY count DESC
      LIMIT 500
    `;

    const result = await pgQuery(sql, [], 120000);
    const cities  = result.rows.map(r => ({
      city_file: (r[cityCol] || "").trim(),
      name:      (r[cityCol] || "").trim(),
      state:     (r.state || "").trim(),
      count:     parseInt(r.count, 10),
    })).filter(c => c.name.length > 0);

    const payload = { cities, total: cities.length, source: "cloud_sql" };
    await cacheSet(CITIES_CACHE_KEY, payload, CITIES_CACHE_TTL);
    res.json(payload);
  } catch (err) {
    logger.error(`[GET /cities] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

