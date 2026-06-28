/**
 * /api/location-analysis
 * Aggregates lat/long data from final.people and final.companies into
 * geographic clusters for map visualization. Returns at most 5000 top clusters
 * per layer so the frontend can render them without lag.
 */

const express = require("express");
const { query: pgQuery } = require("../db/cloudSql");
const { cacheGet, cacheSet, cacheDel } = require("../db/redis");

const router = express.Router();

// Cache TTL — geo data rarely changes
const CACHE_TTL     = 3600;  // 1 hour
const CACHE_PEOPLE  = "loc:clusters:people";
const CACHE_COMP    = "loc:clusters:companies";
const CACHE_STATS_P = "loc:stats:people";
const CACHE_STATS_C = "loc:stats:companies";

// Bucket resolution (degrees). 0.1 → ~11km cells
const BUCKET = "0.1";

// ── Helpers ──────────────────────────────────────────────────
async function getPeopleClusters() {
  const hit = await cacheGet(CACHE_PEOPLE);
  if (hit) return hit;

  const res = await pgQuery(`
    SELECT
      ROUND(lat::numeric,  1)      AS lat,
      ROUND("long"::numeric, 1)    AS lng,
      COUNT(*)                     AS count,
      MIN(city)                    AS city,
      MIN(state)                   AS state
    FROM final.people
    WHERE lat  IS NOT NULL AND "long" IS NOT NULL
      AND lat  BETWEEN -90  AND 90
      AND "long" BETWEEN -180 AND 180
    GROUP BY 1, 2
    ORDER BY count DESC
    LIMIT 5000
  `, [], 120000);

  const data = res.rows.map(r => ({
    lat:   parseFloat(r.lat),
    lng:   parseFloat(r.lng),
    count: parseInt(r.count, 10),
    city:  r.city  || "",
    state: r.state || "",
  }));

  await cacheSet(CACHE_PEOPLE, data, CACHE_TTL);
  return data;
}

async function getCompaniesClusters() {
  const hit = await cacheGet(CACHE_COMP);
  if (hit) return hit;

  const res = await pgQuery(`
    SELECT
      ROUND(lat::numeric,  1)      AS lat,
      ROUND("long"::numeric, 1)    AS lng,
      COUNT(*)                     AS count,
      MIN(city)                    AS city,
      MIN(state)                   AS state
    FROM final.companies
    WHERE lat  IS NOT NULL AND "long" IS NOT NULL
      AND lat  BETWEEN -90  AND 90
      AND "long" BETWEEN -180 AND 180
    GROUP BY 1, 2
    ORDER BY count DESC
    LIMIT 5000
  `, [], 120000);

  const data = res.rows.map(r => ({
    lat:   parseFloat(r.lat),
    lng:   parseFloat(r.lng),
    count: parseInt(r.count, 10),
    city:  r.city  || "",
    state: r.state || "",
  }));

  await cacheSet(CACHE_COMP, data, CACHE_TTL);
  return data;
}

async function getPeopleStats() {
  const hit = await cacheGet(CACHE_STATS_P);
  if (hit) return hit;

  const [totalRes, topCitiesRes, topStatesRes] = await Promise.all([
    pgQuery(`SELECT COUNT(*) AS cnt FROM final.people WHERE lat IS NOT NULL AND "long" IS NOT NULL AND lat BETWEEN -90 AND 90 AND "long" BETWEEN -180 AND 180`),
    pgQuery(`SELECT city, COUNT(*) AS cnt FROM final.people WHERE city IS NOT NULL AND city <> '' AND LENGTH(city) > 2 AND city NOT SIMILAR TO '[0-9\\-\\.]+' GROUP BY city ORDER BY cnt DESC LIMIT 10`, [], 60000),
    pgQuery(`SELECT state, COUNT(*) AS cnt FROM final.people WHERE state IS NOT NULL AND state <> '' AND LENGTH(state) > 2 AND state NOT SIMILAR TO '[0-9\\-\\.]+' GROUP BY state ORDER BY cnt DESC LIMIT 10`, [], 60000),
  ]);

  const data = {
    total:     parseInt(totalRes.rows[0].cnt, 10),
    topCities: topCitiesRes.rows.map(r => ({ name: r.city,  count: parseInt(r.cnt, 10) })),
    topStates: topStatesRes.rows.map(r => ({ name: r.state, count: parseInt(r.cnt, 10) })),
  };

  await cacheSet(CACHE_STATS_P, data, CACHE_TTL);
  return data;
}

async function getCompaniesStats() {
  const hit = await cacheGet(CACHE_STATS_C);
  if (hit) return hit;

  const [totalRes, topCitiesRes, topStatesRes] = await Promise.all([
    pgQuery(`SELECT COUNT(*) AS cnt FROM final.companies WHERE lat IS NOT NULL AND "long" IS NOT NULL AND lat BETWEEN -90 AND 90 AND "long" BETWEEN -180 AND 180`),
    pgQuery(`SELECT city, COUNT(*) AS cnt FROM final.companies WHERE city IS NOT NULL AND city <> '' GROUP BY city ORDER BY cnt DESC LIMIT 10`, [], 60000),
    pgQuery(`SELECT industry, COUNT(*) AS cnt FROM final.companies WHERE industry IS NOT NULL AND industry <> '' GROUP BY industry ORDER BY cnt DESC LIMIT 10`, [], 60000),
  ]);

  const data = {
    total:       parseInt(totalRes.rows[0].cnt, 10),
    topCities:   topCitiesRes.rows.map(r => ({ name: r.city,     count: parseInt(r.cnt, 10) })),
    topIndustry: topStatesRes.rows.map(r => ({ name: r.industry, count: parseInt(r.cnt, 10) })),
  };

  await cacheSet(CACHE_STATS_C, data, CACHE_TTL);
  return data;
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/location-analysis/clusters?type=people|companies|both
router.get("/clusters", async (req, res) => {
  const { type = "people" } = req.query;
  try {
    let people = [], companies = [];
    if (type === "people"    || type === "both") people    = await getPeopleClusters();
    if (type === "companies" || type === "both") companies = await getCompaniesClusters();
    res.json({ people, companies, type });
  } catch (err) {
    console.error(`[location-analysis/clusters] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/location-analysis/stats?type=people|companies
router.get("/stats", async (req, res) => {
  const { type = "people" } = req.query;
  try {
    const stats = type === "companies"
      ? await getCompaniesStats()
      : await getPeopleStats();
    res.json({ ...stats, type });
  } catch (err) {
    console.error(`[location-analysis/stats] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/location-analysis/refresh — clear cache
router.post("/refresh", async (_req, res) => {
  try {
    await Promise.all([
      cacheDel(CACHE_PEOPLE),
      cacheDel(CACHE_COMP),
      cacheDel(CACHE_STATS_P),
      cacheDel(CACHE_STATS_C),
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
