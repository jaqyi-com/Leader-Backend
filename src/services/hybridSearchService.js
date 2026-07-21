"use strict";

// ============================================================
// HYBRID SEARCH SERVICE — Neon PostgreSQL (pgvector)
// ============================================================
// Strategy:
//   1. Pure vector ANN (no filters) → HNSW directQuery (fast, ~1-3s after warmup)
//   2. City/state/field filters → structured ILIKE + keyword search
//   3. Automatic fallback: if vector times out → structured search
//
// Tables: final.companies  |  final.people
// Model:  all-MiniLM-L6-v2  (384-dim)  — matches embed_neon.py
// Indexes: idx_companies_hnsw (HNSW, cosine)  |  idx_people_hnsw (building...)
// ============================================================

const { getLocalQueryEmbedding } = require("./localEmbedService");
const { query: pgQuery, directQuery, directQueryWithSession } = require("../db/cloudSql");
const logger = require("../utils/logger").forAgent("HybridSearchService");

// ── Timeouts ─────────────────────────────────────────────────────
const VECTOR_QUERY_TIMEOUT_MS  = 28000;  // 28s — HNSW ANN via direct conn
const STRUCT_QUERY_TIMEOUT_MS  = 30000;  // 30s — structured search (btree)
const COUNT_QUERY_TIMEOUT_MS   = 8000;   //  8s — count (fails safely → DB_TOTALS)

// ── HNSW index availability ───────────────────────────────────────
// idx_companies_hnsw   ✅ VALID
// idx_people_hnsw_0…f  ✅ ALL 16 SHARDS VALID (built 2026-07-21, ~4h)
// Both vector searches are now enabled.
const HNSW_READY = {
  companies: true,
  people:    true,   // ✅ All 16 shards built and valid
};

// ── DB total row estimates ────────────────────────────────────────
// Btree indexes (ALL ✅ READY):
//   idx_people_city, idx_people_state, idx_people_job_title
//   idx_companies_city, idx_companies_state
const DB_TOTALS = {
  companies: 1_781_218,
  people:   43_932_594,
};

/**
 * Perform a hybrid (structured + semantic vector) search on companies or people.
 *
 * @param {object} params
 * @param {string} params.entityType     "companies" or "people"
 * @param {string} params.search         Natural language query (embedded → vector)
 * @param {string} params.f_city         City filter
 * @param {string} params.f_state        State filter
 * @param {string} params.f_industry     Industry filter (companies only)
 * @param {string} params.f_job_title    Job title filter (people only)
 * @param {string} params.f_has_email    "true" | "false" | ""
 * @param {string} params.f_has_phone    "true" | "false" | ""
 * @param {number} params.page           Page number (1-indexed)
 * @param {number} params.limit          Results per page (max 100)
 * @returns {Promise<{ records: any[], total: number, mode: string }>}
 */
async function performHybridSearch({
  entityType = "companies",
  search = "",
  f_city = "",
  f_state = "",
  f_industry = "",
  f_job_title = "",
  f_has_email = "",
  f_has_phone = "",
  page = 1,
  limit = 25,
}) {
  const isCompanies = entityType === "companies";
  const tableName   = isCompanies ? '"final"."companies"' : '"final"."people"';

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  // Combine search keywords with extracted industry and job title semantically
  let semanticSearchTerm = (search || "").trim();
  if (f_industry && !semanticSearchTerm.toLowerCase().includes(f_industry.toLowerCase())) {
    semanticSearchTerm = `${semanticSearchTerm} ${f_industry}`.trim();
  }
  if (f_job_title && !semanticSearchTerm.toLowerCase().includes(f_job_title.toLowerCase())) {
    semanticSearchTerm = `${semanticSearchTerm} ${f_job_title}`.trim();
  }

  // ── 1. Generate embedding for semantic search ─────────────────
  let embedding = null;
  if (semanticSearchTerm) {
    try {
      embedding = await getLocalQueryEmbedding(semanticSearchTerm);
      if (!Array.isArray(embedding) || embedding.length !== 384) {
        logger.warn(`[HybridSearch] Bad embedding for "${semanticSearchTerm}" — skipping vector`);
        embedding = null;
      } else {
        logger.info(`[HybridSearch] Embedding ready (384-dim) for: "${semanticSearchTerm}"`);
      }
    } catch (err) {
      logger.error(`[HybridSearch] Embedding failed: ${err.message}`);
    }
  }

  // ── 2. Build structured WHERE filters ────────────────────────
  const structConditions = [];
  const structParams     = [];
  let idx = 1;

  // Country-level terms that don't match any state/city column values — skip them
  const SKIP_LOCATION = new Set([
    'usa','us','united states','united states of america',
    'india','in','global','worldwide','world','international',
    'uk','united kingdom','canada','ca','australia','au',
  ]);

  if (f_city && !SKIP_LOCATION.has(f_city.toLowerCase())) {
    structConditions.push(`city ILIKE $${idx++}`);
    structParams.push(`${f_city}%`);
  }
  if (f_state && !SKIP_LOCATION.has(f_state.toLowerCase())) {
    structConditions.push(`state ILIKE $${idx++}`);
    structParams.push(`${f_state}%`);
  }
  if (isCompanies) {
    if (f_has_email === "true")        structConditions.push(`(emails IS NOT NULL AND emails <> '' AND emails <> '{}')`);
    else if (f_has_email === "false")  structConditions.push(`(emails IS NULL OR emails = '' OR emails = '{}')`);
    if (f_has_phone === "true")        structConditions.push(`(phone IS NOT NULL AND phone <> '')`);
    else if (f_has_phone === "false")  structConditions.push(`(phone IS NULL OR phone = '')`);
  } else {
    // People: emails and phones are text columns storing PostgreSQL array literals e.g. {a@b.com,c@d.com}
    if (f_has_email === "true")        structConditions.push(`(emails IS NOT NULL AND emails <> '' AND emails <> '{}')`);
    else if (f_has_email === "false")  structConditions.push(`(emails IS NULL OR emails = '' OR emails = '{}')`);
    if (f_has_phone === "true")        structConditions.push(`(phones IS NOT NULL AND phones <> '' AND phones <> '{}')`);
    else if (f_has_phone === "false")  structConditions.push(`(phones IS NULL OR phones = '' OR phones = '{}')`);
  }

  // ── 3. Always add keyword ILIKE search for the core search term ──
  // This ensures results come back even when struct filters narrow the set.
  if (search && search.trim()) {
    const kw = `%${search.trim()}%`;
    if (isCompanies) {
      structConditions.push(`(business_name ILIKE $${idx} OR industry ILIKE $${idx})`);
      structParams.push(kw);
      idx++;
    } else {
      // For people: search job_title primarily. Also search full_name but only as secondary.
      // Using OR with the same param index for both columns.
      structConditions.push(`(job_title ILIKE $${idx} OR location ILIKE $${idx})`);
      structParams.push(kw);
      idx++;
    }
  }

  // ── 4. Default quality filter when nothing specified ─────────
  if (structConditions.length === 0 && !embedding) {
    if (isCompanies) {
      structConditions.push("business_name IS NOT NULL AND business_name <> ''");
      structConditions.push("phone IS NOT NULL AND phone <> ''");
    } else {
      structConditions.push("full_name IS NOT NULL AND full_name <> ''");
      structConditions.push("job_title IS NOT NULL AND job_title <> ''");
    }
  }

  // ── 5. Choose search strategy ────────────────────────────────
  const hasStructuredFilters = structConditions.length > 0;
  const entityKey = isCompanies ? "companies" : "people";
  const canUseVector = embedding && HNSW_READY[entityKey];

  if (canUseVector) {
    try {
      const result = await runVectorSearch({
        tableName, embedding, structConditions, structParams,
        idx, limitNum, offset, isCompanies,
      });
      return { ...result, mode: "vector" };
    } catch (err) {
      logger.warn(`[HybridSearch] Vector search failed (${err.message}), falling back to structured`);
      // Fall through to structured search below
    }
  }

  // ── 6. Structured-only search ─────────────────────────────────
  const result = await runStructuredSearch({
    tableName, structConditions, structParams, idx, limitNum, offset,
  });
  return { ...result, mode: "structured" };
}


// ─────────────────────────────────────────────────────────────────
// VECTOR SEARCH (HNSW cosine similarity — fast after index build)
// ─────────────────────────────────────────────────────────────────
async function runVectorSearch({
  tableName, embedding, structConditions, structParams,
  idx, limitNum, offset, isCompanies,
}) {
  // Clone params to avoid mutation
  const queryParams = [...structParams];

  // Append vector param
  const vectorIdx = idx;
  queryParams.push(JSON.stringify(embedding));
  idx++;

  // Add embedding IS NOT NULL so HNSW index is used
  const allConditions = [...structConditions, "embedding IS NOT NULL"];
  const whereStr = allConditions.length > 0 ? `WHERE ${allConditions.join(" AND ")}` : "";

  const dataSQL = `
    SELECT *, (1 - (embedding <=> $${vectorIdx}::vector)) AS similarity_score
    FROM ${tableName}
    ${whereStr}
    ORDER BY embedding <=> $${vectorIdx}::vector
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  logger.info(`[HybridSearch] Vector query:\n${dataSQL.slice(0, 200)}`);

  // Use direct pool for pgvector queries (pooler strips SET statements)
  // If structured filters are present, we use session configuration to set ef_search to 1000 for accurate post-filtering recall.
  let dataRes;
  if (structConditions.length > 0) {
    dataRes = await directQueryWithSession(
      dataSQL,
      [...queryParams, limitNum, offset],
      ["SET LOCAL hnsw.ef_search = 1000;"],
      VECTOR_QUERY_TIMEOUT_MS
    );
  } else {
    dataRes = await directQuery(
      dataSQL,
      [...queryParams, limitNum, offset],
      VECTOR_QUERY_TIMEOUT_MS
    );
  }
  
  const records = dataRes.rows.map(row => {
    const out = { ...row };
    delete out.embedding; // strip binary blob
    return out;
  });

  // Use approximate total (skip count for vector search — too slow on 43M rows)
  const total = isCompanies ? DB_TOTALS.companies : DB_TOTALS.people;

  logger.info(`[HybridSearch] Vector search returned ${records.length} records`);
  return { records, total };
}


// ─────────────────────────────────────────────────────────────────
// STRUCTURED SEARCH (Filter + ORDER BY created_at)
// ─────────────────────────────────────────────────────────────────
async function runStructuredSearch({ tableName, structConditions, structParams, idx, limitNum, offset }) {
  const whereStr = structConditions.length > 0 ? `WHERE ${structConditions.join(" AND ")}` : "";
  const isCompanies = tableName.includes("companies");

  const dataSQL = `
    SELECT *
    FROM ${tableName}
    ${whereStr}
    ORDER BY uuid
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  // Count limited to 10,001 rows for UI performance
  // Run count and data in parallel — if count times out, use DB_TOTALS estimate
  const countSQL = `
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT 1
      FROM ${tableName}
      ${whereStr}
      LIMIT 10001
    ) subq
  `;

  const countParams = [...structParams];
  const dataParams  = [...structParams, limitNum, offset];

  logger.info(`[HybridSearch] Structured query`);

  // Run both in parallel — count can fail safely
  const [countResult, dataRes] = await Promise.all([
    pgQuery(countSQL, countParams, COUNT_QUERY_TIMEOUT_MS).catch(err => {
      logger.warn(`[HybridSearch] Count query timed out (${err.message}) — using estimate`);
      return null;
    }),
    pgQuery(dataSQL, dataParams, STRUCT_QUERY_TIMEOUT_MS),
  ]);

  const total = countResult
    ? parseInt(countResult.rows[0].cnt, 10)
    : (isCompanies ? DB_TOTALS.companies : DB_TOTALS.people);

  const records = dataRes.rows.map(row => {
    const out = { ...row };
    delete out.embedding;
    return out;
  });

  logger.info(`[HybridSearch] Structured search returned ${records.length} of ${total} records`);
  return { records, total };
}


module.exports = {
  performHybridSearch,
  DB_TOTALS,
};
