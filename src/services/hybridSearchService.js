"use strict";

const { getLocalQueryEmbedding } = require("./localEmbedService");
const { query: pgQuery } = require("../db/cloudSql");
const logger = require("../utils/logger").forAgent("HybridSearchService");

/**
 * Perform a hybrid (structured + semantic vector) search on companies or people.
 * 
 * @param {object} params
 * @param {string} params.entityType "companies" or "people"
 * @param {string} params.search Natural language query to search semantically
 * @param {string} params.f_city City filter
 * @param {string} params.f_state State filter
 * @param {string} params.f_industry Industry filter (companies only)
 * @param {string} params.f_job_title Job title filter (people only)
 * @param {string} params.f_has_email "true" or "false"
 * @param {string} params.f_has_phone "true" or "false"
 * @param {number} params.page Page number (1-indexed)
 * @param {number} params.limit Number of items per page
 * @returns {Promise<{ records: any[], total: number }>}
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
  const tableName = isCompanies ? '"final"."companies"' : '"final"."people"';
  
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  // 1. Generate query embedding if search string is provided
  let embedding = null;
  if (search && search.trim().length > 0) {
    try {
      embedding = await getLocalQueryEmbedding(search);
      logger.info(`Generated local query embedding for: "${search}"`);
    } catch (err) {
      logger.error(`Failed to generate query embedding: ${err.message}`);
    }
  }

  // 2. Build PostgreSQL where clause
  const conditions = [];
  const queryParams = [];
  let idx = 1;

  if (f_city) {
    conditions.push(`city ILIKE $${idx++}`);
    queryParams.push(`${f_city}%`);
  }
  if (f_state) {
    conditions.push(`state ILIKE $${idx++}`);
    queryParams.push(`${f_state}%`);
  }

  if (isCompanies) {
    if (f_industry) {
      conditions.push(`industry::text ILIKE $${idx++}`);
      queryParams.push(`%${f_industry}%`);
    }
    if (f_has_email === "true") {
      conditions.push(`(emails IS NOT NULL AND emails <> '')`);
    } else if (f_has_email === "false") {
      conditions.push(`(emails IS NULL OR emails = '')`);
    }
    if (f_has_phone === "true") {
      conditions.push(`(phone IS NOT NULL AND phone <> '')`);
    } else if (f_has_phone === "false") {
      conditions.push(`(phone IS NULL OR phone = '')`);
    }
  } else {
    // People
    if (f_job_title) {
      conditions.push(`job_title ILIKE $${idx++}`);
      queryParams.push(`%${f_job_title}%`);
    }
    if (f_has_email === "true") {
      conditions.push(`(emails IS NOT NULL AND emails <> '')`);
    } else if (f_has_email === "false") {
      conditions.push(`(emails IS NULL OR emails = '')`);
    }
    if (f_has_phone === "true") {
      conditions.push(`(phones IS NOT NULL AND phones <> '')`);
    } else if (f_has_phone === "false") {
      conditions.push(`(phones IS NULL OR phones = '')`);
    }
  }

  // If there are no filters and no search query, add a base complete-profile filter
  const hasFilters = conditions.length > 0;
  if (!hasFilters && !embedding) {
    if (isCompanies) {
      conditions.push("business_name IS NOT NULL AND business_name <> ''");
      conditions.push("phone IS NOT NULL AND phone <> ''");
      conditions.push("website IS NOT NULL AND website <> ''");
      conditions.push("(emails IS NOT NULL AND emails <> '')");
    } else {
      conditions.push("full_name IS NOT NULL AND full_name <> ''");
      conditions.push("(emails IS NOT NULL AND emails <> '')");
      conditions.push("(phones IS NOT NULL AND phones <> '')");
    }
  }

  // 3. Build selection, ordering, and execution logic
  let selectSQL = "*";
  let orderBySQL = "ORDER BY created_at DESC";

  // If vector embedding exists, rank by cosine distance
  if (embedding && embedding.length === 384) {
    const vectorIdx = idx++;
    queryParams.push(JSON.stringify(embedding));
    
    selectSQL = `*, (1 - (embedding <=> $${vectorIdx}::vector)) AS similarity_score`;
    // We only rank rows where embedding is not null to ensure HNSW index is utilized
    conditions.push("embedding IS NOT NULL");
    orderBySQL = `ORDER BY embedding <=> $${vectorIdx}::vector`;
  }

  const whereStr = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Query records
  const dataSQL = `
    SELECT ${selectSQL}
    FROM ${tableName}
    ${whereStr}
    ${orderBySQL}
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  // Count total matching records (limit to 10K for fast UX)
  const countSQL = `
    SELECT COUNT(*) AS cnt 
    FROM (
      SELECT 1 
      FROM ${tableName}
      ${whereStr}
      LIMIT 10001
    ) subq
  `;

  try {
    const totalRes = await pgQuery(countSQL, queryParams.slice(0, idx - 3), 20000);
    const total = parseInt(totalRes.rows[0].cnt, 10);

    const dataRes = await pgQuery(dataSQL, [...queryParams, limitNum, offset], 30000);
    const records = dataRes.rows.map(row => {
      // Normalize columns
      const out = { ...row };
      delete out.embedding; // do not send binary vectors to frontend
      return out;
    });

    return { records, total };
  } catch (err) {
    logger.error(`Database query failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  performHybridSearch,
};
