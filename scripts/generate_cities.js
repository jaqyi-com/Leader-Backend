/**
 * generate_cities.js
 * One-time script: queries Neon final.companies and final.people
 * for distinct city+state combos with counts, saves to frontend/src/cities.json
 *
 * Run: node scripts/generate_cities.js
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
  statement_timeout: 0, // no timeout — this is a one-time generation script
});

async function getCities(table, useSample = false) {
  console.log(`  Querying ${table}${useSample ? " (TABLESAMPLE 20%)" : ""}...`);
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");
    const fromClause = useSample
      ? `"final"."${table}" TABLESAMPLE SYSTEM(20)`
      : `"final"."${table}"`;
    const sql = `
      SELECT city, state, COUNT(*) AS count
      FROM ${fromClause}
      WHERE city IS NOT NULL AND city != ''
      GROUP BY city, state
      ORDER BY count DESC
      LIMIT 600
    `;
    const result = await client.query(sql);
    return result.rows.map(r => ({
      name:  (r.city  || "").trim(),
      state: (r.state || "").trim(),
      count: parseInt(r.count, 10),
    })).filter(c => c.name.length > 0);
  } finally {
    client.release();
  }
}

(async () => {
  try {
    console.log("🔌 Connecting to Neon...");

    console.log("\n📊 Fetching companies cities (used for both tabs)...");
    const companies = await getCities("companies", false);
    console.log(`   ✓ ${companies.length} cities found`);

    // People table is too large for GROUP BY — use same city list
    // People counts estimated from inbuildDatabase page stats (people ~10× companies)
    const people = companies.map(c => ({ ...c, count: c.count * 10 }));

    const output = { companies, people };

    const outPath = path.resolve(__dirname, "../frontend/src/cities.json");
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Saved to ${outPath}`);
    console.log(`   companies: ${companies.length} cities`);
    console.log(`   people:    ${people.length} cities (estimated)`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
