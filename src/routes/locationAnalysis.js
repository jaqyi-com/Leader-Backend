/**
 * /api/location-analysis
 * Aggregates lat/long data from final.people and final.companies into
 * geographic clusters. Supports filter params: city, state, industry,
 * has_email, has_phone (people), min_rating (companies).
 *
 * Unfiltered results are Redis-cached 1hr.
 * Filtered results bypass cache (too many combinations to cache).
 */

const express = require("express");
const { query: pgQuery } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");

const router = express.Router();

const CACHE_TTL     = 3600;
const CACHE_PEOPLE  = "loc:clusters:people";
const CACHE_COMP    = "loc:clusters:companies";
const CACHE_STATS_P = "loc:stats:people";
const CACHE_STATS_C = "loc:stats:companies";

// ── Build dynamic WHERE clauses from filters ──────────────────
function buildPeopleWhere(f) {
  const clauses = [
    `lat IS NOT NULL AND "long" IS NOT NULL`,
    `lat BETWEEN -90 AND 90`,
    `"long" BETWEEN -180 AND 180`,
  ];
  const params = [];
  let idx = 1;

  // Text searches (using indexed columns)
  if (f.full_name)   { clauses.push(`full_name  ILIKE $${idx++}`); params.push(`%${f.full_name}%`); }
  if (f.job_title)   { clauses.push(`job_title  ILIKE $${idx++}`); params.push(`%${f.job_title}%`); }
  if (f.location)    { clauses.push(`location   ILIKE $${idx++}`); params.push(`%${f.location}%`); }
  if (f.industry)    { clauses.push(`job_title  ILIKE $${idx++}`); params.push(`%${f.industry}%`); }  // alias

  // Exact-match columns (BTree indexed — fast)
  if (f.city)        { clauses.push(`city       ILIKE $${idx++}`); params.push(`${f.city}%`); }
  if (f.state)       { clauses.push(`state      ILIKE $${idx++}`); params.push(`${f.state}%`); }
  if (f.pincode)     { clauses.push(`pincode    = $${idx++}`);      params.push(f.pincode); }
  if (f.geo_source)  { clauses.push(`geo_source = $${idx++}`);      params.push(f.geo_source); }

  // Array presence — cardinality() returns 0 for {} (safe, unlike array_length)
  if (f.has_email === "true")  { clauses.push(`cardinality(emails) > 0`); }
  if (f.has_email === "false") { clauses.push(`(emails IS NULL OR cardinality(emails) = 0)`); }
  if (f.has_phone === "true")  { clauses.push(`cardinality(phones) > 0`); }
  if (f.has_phone === "false") { clauses.push(`(phones IS NULL OR cardinality(phones) = 0)`); }

  return { where: clauses.join(" AND "), params };
}

function buildCompaniesWhere(f) {
  const clauses = [
    `lat IS NOT NULL AND "long" IS NOT NULL`,
    `lat BETWEEN -90 AND 90`,
    `"long" BETWEEN -180 AND 180`,
  ];
  const params = [];
  let idx = 1;

  // Text searches
  if (f.business_name) { clauses.push(`business_name ILIKE $${idx++}`); params.push(`%${f.business_name}%`); }
  if (f.website)       { clauses.push(`website       ILIKE $${idx++}`); params.push(`%${f.website}%`); }
  if (f.domain)        { clauses.push(`domain        ILIKE $${idx++}`); params.push(`%${f.domain}%`); }
  if (f.address)       { clauses.push(`address       ILIKE $${idx++}`); params.push(`%${f.address}%`); }
  if (f.industry)      { clauses.push(`industry      ILIKE $${idx++}`); params.push(`%${f.industry}%`); }

  // Exact/prefix columns (BTree indexed — fast)
  if (f.city)       { clauses.push(`city       ILIKE $${idx++}`); params.push(`${f.city}%`); }
  if (f.state)      { clauses.push(`state      ILIKE $${idx++}`); params.push(`${f.state}%`); }
  if (f.pincode)    { clauses.push(`pincode    = $${idx++}`);      params.push(f.pincode); }
  if (f.geo_source) { clauses.push(`geo_source = $${idx++}`);      params.push(f.geo_source); }

  // Numeric
  if (f.min_rating) {
    const r = parseFloat(f.min_rating);
    if (!isNaN(r)) { clauses.push(`rating >= $${idx++}`); params.push(r); }
  }
  if (f.min_reviews) {
    const rv = parseInt(f.min_reviews, 10);
    if (!isNaN(rv)) { clauses.push(`reviews >= $${idx++}`); params.push(rv); }
  }

  // Phone (text column, not array)
  if (f.has_phone === "true")  { clauses.push(`(phone IS NOT NULL AND phone <> '')`); }
  if (f.has_phone === "false") { clauses.push(`(phone IS NULL OR phone = '')`); }

  // Email array — cardinality() returns 0 for {} (safe)
  if (f.has_email === "true")  { clauses.push(`cardinality(emails) > 0`); }
  if (f.has_email === "false") { clauses.push(`(emails IS NULL OR cardinality(emails) = 0)`); }

  return { where: clauses.join(" AND "), params };
}

function hasFilters(f) {
  return !!(
    f.city || f.state || f.industry || f.has_email || f.has_phone || f.min_rating ||
    f.full_name || f.job_title || f.location || f.pincode || f.geo_source || f.min_reviews ||
    f.business_name || f.website || f.domain || f.address
  );
}

// ── Cluster queries ────────────────────────────────────────────
async function getPeopleClusters(filters = {}) {
  const filtered = hasFilters(filters);
  if (!filtered) {
    const hit = await cacheGet(CACHE_PEOPLE);
    if (hit) return hit;
  }

  const { where, params } = buildPeopleWhere(filters);
  const res = await pgQuery(`
    SELECT
      ROUND(lat::numeric,    1) AS lat,
      ROUND("long"::numeric, 1) AS lng,
      COUNT(*)                  AS count,
      MIN(city)                 AS city,
      MIN(state)                AS state
    FROM final.people
    WHERE ${where}
    GROUP BY 1, 2
    ORDER BY count DESC
    LIMIT 5000
  `, params, 120000);

  const data = res.rows.map(r => ({
    lat:   parseFloat(r.lat),
    lng:   parseFloat(r.lng),
    count: parseInt(r.count, 10),
    city:  r.city  || "",
    state: r.state || "",
  }));

  if (!filtered) await cacheSet(CACHE_PEOPLE, data, CACHE_TTL);
  return data;
}

async function getCompaniesClusters(filters = {}) {
  const filtered = hasFilters(filters);
  if (!filtered) {
    const hit = await cacheGet(CACHE_COMP);
    if (hit) return hit;
  }

  const { where, params } = buildCompaniesWhere(filters);
  const res = await pgQuery(`
    SELECT
      ROUND(lat::numeric,    1) AS lat,
      ROUND("long"::numeric, 1) AS lng,
      COUNT(*)                  AS count,
      MIN(city)                 AS city,
      MIN(state)                AS state
    FROM final.companies
    WHERE ${where}
    GROUP BY 1, 2
    ORDER BY count DESC
    LIMIT 5000
  `, params, 120000);

  const data = res.rows.map(r => ({
    lat:   parseFloat(r.lat),
    lng:   parseFloat(r.lng),
    count: parseInt(r.count, 10),
    city:  r.city  || "",
    state: r.state || "",
  }));

  if (!filtered) await cacheSet(CACHE_COMP, data, CACHE_TTL);
  return data;
}

// ── Stats (unfiltered, cached) ─────────────────────────────────
async function getPeopleStats() {
  const hit = await cacheGet(CACHE_STATS_P);
  if (hit) return hit;

  const [totalRes, topCitiesRes, topStatesRes, topJobsRes] = await Promise.all([
    pgQuery(`SELECT COUNT(*) AS cnt FROM final.people
             WHERE lat IS NOT NULL AND "long" IS NOT NULL
               AND lat BETWEEN -90 AND 90 AND "long" BETWEEN -180 AND 180`),
    pgQuery(`SELECT city, COUNT(*) AS cnt FROM final.people
             WHERE city IS NOT NULL AND city <> '' AND LENGTH(city) > 2
               AND city NOT SIMILAR TO '[0-9\\-\\.]+'
             GROUP BY city ORDER BY cnt DESC LIMIT 10`, [], 60000),
    pgQuery(`SELECT state, COUNT(*) AS cnt FROM final.people
             WHERE state IS NOT NULL AND state <> '' AND LENGTH(state) > 2
               AND state NOT SIMILAR TO '[0-9\\-\\.]+'
             GROUP BY state ORDER BY cnt DESC LIMIT 10`, [], 60000),
    pgQuery(`SELECT job_title, COUNT(*) AS cnt FROM final.people
             WHERE job_title IS NOT NULL AND job_title <> '' AND LENGTH(job_title) > 3
             GROUP BY job_title ORDER BY cnt DESC LIMIT 10`, [], 60000),
  ]);

  const data = {
    total:     parseInt(totalRes.rows[0].cnt, 10),
    topCities: topCitiesRes.rows.map(r => ({ name: r.city,      count: parseInt(r.cnt, 10) })),
    topStates: topStatesRes.rows.map(r => ({ name: r.state,     count: parseInt(r.cnt, 10) })),
    topJobs:   topJobsRes.rows.map(r   => ({ name: r.job_title, count: parseInt(r.cnt, 10) })),
  };

  await cacheSet(CACHE_STATS_P, data, CACHE_TTL);
  return data;
}

async function getCompaniesStats() {
  const hit = await cacheGet(CACHE_STATS_C);
  if (hit) return hit;

  const [totalRes, topCitiesRes, topIndustryRes] = await Promise.all([
    pgQuery(`SELECT COUNT(*) AS cnt FROM final.companies
             WHERE lat IS NOT NULL AND "long" IS NOT NULL
               AND lat BETWEEN -90 AND 90 AND "long" BETWEEN -180 AND 180`),
    pgQuery(`SELECT city, COUNT(*) AS cnt FROM final.companies
             WHERE city IS NOT NULL AND city <> '' AND LENGTH(city) > 2
               AND city NOT SIMILAR TO '[0-9\\-\\.]+'
             GROUP BY city ORDER BY cnt DESC LIMIT 10`, [], 60000),
    pgQuery(`SELECT industry, COUNT(*) AS cnt FROM final.companies
             WHERE industry IS NOT NULL AND industry <> ''
             GROUP BY industry ORDER BY cnt DESC LIMIT 10`, [], 60000),
  ]);

  const data = {
    total:       parseInt(totalRes.rows[0].cnt, 10),
    topCities:   topCitiesRes.rows.map(r => ({ name: r.city,     count: parseInt(r.cnt, 10) })),
    topIndustry: topIndustryRes.rows.map(r => ({ name: r.industry, count: parseInt(r.cnt, 10) })),
  };

  await cacheSet(CACHE_STATS_C, data, CACHE_TTL);
  return data;
}

// ── Routes ────────────────────────────────────────────────────

// GET /api/location-analysis/clusters
//   ?type=people|companies|both
//   People filters:   full_name, job_title, location, city, state, pincode, geo_source, has_email, has_phone
//   Companies filters:business_name, website, domain, address, industry, city, state, pincode, geo_source, has_phone, has_email, min_rating, min_reviews
router.get("/clusters", async (req, res) => {
  const {
    type = "both",
    // Shared
    city, state, pincode, geo_source,
    // People-specific
    full_name, job_title, location, industry, has_email, has_phone,
    // Companies-specific
    business_name, website, domain, address, min_rating, min_reviews,
  } = req.query;

  const filters = {
    city, state, pincode, geo_source,
    full_name, job_title, location, industry, has_email, has_phone,
    business_name, website, domain, address, min_rating, min_reviews,
  };

  try {
    let people = [], companies = [];
    if (type === "people"    || type === "both") people    = await getPeopleClusters(filters);
    if (type === "companies" || type === "both") companies = await getCompaniesClusters(filters);
    res.json({ people, companies, type, filters });
  } catch (err) {
    console.error(`[location-analysis/clusters] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/location-analysis/stats?type=people|companies
router.get("/stats", async (req, res) => {
  const { type = "people" } = req.query;
  try {
    const stats = type === "companies" ? await getCompaniesStats() : await getPeopleStats();
    res.json({ ...stats, type });
  } catch (err) {
    console.error(`[location-analysis/stats] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/location-analysis/refresh — clear all caches
router.post("/refresh", async (_req, res) => {
  try {
    await Promise.all([
      cacheDel(CACHE_PEOPLE), cacheDel(CACHE_COMP),
      cacheDel(CACHE_STATS_P), cacheDel(CACHE_STATS_C),
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
