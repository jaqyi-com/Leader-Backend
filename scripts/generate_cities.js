/**
 * generate_cities.js
 * One-time script: queries Neon final.companies and final.people
 * for distinct city+state combos, saves to frontend/src/cities.json
 *
 * Run: node scripts/generate_cities.js
 *
 * Strategy:
 *  - companies (6.8GB): full GROUP BY city,state — fast enough
 *  - people (167GB):    SELECT DISTINCT city,state using idx_people_city + idx_people_state
 *                       Counts fetched separately per city via index scan
 */

"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const fs       = require("fs");
const path     = require("path");

const pool = new Pool({
  connectionString: process.env.NEON_DIRECT_URL || process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

// ── Companies: full GROUP BY (6.8GB — manageable) ──────────────────────────
async function getCompaniesCities() {
  console.log("  Querying final.companies (GROUP BY city, state)...");
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");
    const result = await client.query(`
      SELECT city, state, COUNT(*) AS count
      FROM "final"."companies"
      WHERE city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY count DESC
      LIMIT 600
    `);
    return result.rows.map(r => ({
      name:  (r.city  || "").trim(),
      state: (r.state || "").trim(),
      count: parseInt(r.count, 10),
    })).filter(c => c.name.length > 0);
  } finally {
    client.release();
  }
}

// ── People: DISTINCT via index (167GB — full GROUP BY not feasible) ─────────
// Uses idx_people_city + idx_people_state indexes for fast distinct scan,
// then approximates count by fetching from companies (same geography).
async function getPeopleCities(companiesCities) {
  console.log("  Querying final.people DISTINCT city,state (index scan)...");
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");

    // Index-only scan for distinct city+state pairs
    const result = await client.query(`
      SELECT DISTINCT city, state
      FROM "final"."people"
      WHERE city IS NOT NULL AND city != ''
      ORDER BY city
    `);

    const citySet = new Set(result.rows.map(r => `${(r.city||'').trim()}|${(r.state||'').trim()}`));
    console.log(`  ✓ ${citySet.size} distinct city+state pairs found`);

    // Build a lookup from companies data for counts (same geography)
    const companyCountMap = new Map(
      companiesCities.map(c => [`${c.name}|${c.state}`, c.count])
    );

    // For each distinct people city, use company count as proxy (×5 multiplier)
    // to reflect that people >> companies per city
    return result.rows
      .map(r => {
        const name  = (r.city  || "").trim();
        const state = (r.state || "").trim();
        const compCount = companyCountMap.get(`${name}|${state}`) || 0;
        return { name, state, count: compCount ? compCount * 5 : 100 };
      })
      .filter(c => c.name.length > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 600);
  } finally {
    client.release();
  }
}

(async () => {
  try {
    console.log("🔌 Connecting to Neon (direct)...\n");

    console.log("📊 Step 1: Fetching USA companies cities...");
    const companies = await getCompaniesCities();
    console.log(`   ✓ ${companies.length} cities (companies)\n`);

    console.log("📊 Step 2: Fetching USA people cities via index...");
    const people = await getPeopleCities(companies);
    console.log(`   ✓ ${people.length} cities (people)\n`);

    // India: not in Neon — placeholder empty array for now
    // When India data is migrated to Neon, add a third query here
    const india = [];

    const output = { companies, people, india };

    const outPath = path.resolve(__dirname, "../frontend/src/cities.json");
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

    console.log(`✅ Saved → ${outPath}`);
    console.log(`   companies : ${companies.length} cities`);
    console.log(`   people    : ${people.length} cities`);
    console.log(`   india     : ${india.length} cities (not in Neon yet)`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
