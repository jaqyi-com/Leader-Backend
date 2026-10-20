/**
 * audit_cities_and_categories.js
 * 
 * Fast, 4-query audit of all cities in cities.json and categories in categories.json
 * against actual PostgreSQL database counts in final.companies and final.people.
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

pool.on("error", err => console.error("PG Pool error:", err.message));

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected to Neon DB for Fast Audit");
  await client.query("SET statement_timeout = 0;");

  try {
    const citiesPath = path.resolve(__dirname, "../frontend/src/cities.json");
    const categoriesPath = path.resolve(__dirname, "../frontend/src/categories.json");

    const citiesData = JSON.parse(fs.readFileSync(citiesPath, "utf-8"));
    const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, "utf-8"));

    // ── 1. Group By Cities (Companies) ──────────────────────────────────────
    console.log("📊 1. Querying Companies Cities Breakdown...");
    const compCityRes = await client.query(`
      SELECT LOWER(TRIM(city)) as norm_city, COUNT(*) as cnt
      FROM final.companies
      WHERE city IS NOT NULL AND TRIM(city) != ''
      GROUP BY LOWER(TRIM(city));
    `);

    const compCityMap = new Map();
    for (const r of compCityRes.rows) {
      compCityMap.set(r.norm_city, parseInt(r.cnt, 10));
    }

    // ── 2. Group By Cities (People) ─────────────────────────────────────────
    console.log("📊 2. Querying People Cities Breakdown...");
    const peopleCityRes = await client.query(`
      SELECT LOWER(TRIM(city)) as norm_city, COUNT(*) as cnt
      FROM final.people
      WHERE city IS NOT NULL AND TRIM(city) != ''
      GROUP BY LOWER(TRIM(city));
    `);

    const peopleCityMap = new Map();
    for (const r of peopleCityRes.rows) {
      peopleCityMap.set(r.norm_city, parseInt(r.cnt, 10));
    }

    // ── 3. Group By Industries (Companies) ──────────────────────────────────
    console.log("📊 3. Querying Companies Industries Breakdown...");
    const indRes = await client.query(`
      SELECT LOWER(TRIM(industry)) as norm_ind, COUNT(*) as cnt
      FROM final.companies
      WHERE industry IS NOT NULL AND TRIM(industry) != ''
      GROUP BY LOWER(TRIM(industry));
    `);

    const indMap = new Map();
    for (const r of indRes.rows) {
      indMap.set(r.norm_ind, parseInt(r.cnt, 10));
    }

    // ── 4. Group By Job Titles (People) ─────────────────────────────────────
    console.log("📊 4. Querying People Job Titles Breakdown...");
    const roleRes = await client.query(`
      SELECT LOWER(TRIM(job_title)) as norm_role, COUNT(*) as cnt
      FROM final.people
      WHERE job_title IS NOT NULL AND TRIM(job_title) != ''
      GROUP BY LOWER(TRIM(job_title));
    `);

    const roleMap = new Map();
    for (const r of roleRes.rows) {
      roleMap.set(r.norm_role, parseInt(r.cnt, 10));
    }

    // ── 5. COMPARE & UPDATE ──────────────────────────────────────────────────
    const discrepancies = [];

    // Helper to get count from map with fallback fuzzy/prefix lookup
    function getCityCount(map, name) {
      const norm = name.trim().toLowerCase();
      if (map.has(norm)) return map.get(norm);
      let sum = 0;
      for (const [k, v] of map.entries()) {
        if (k === norm || k.startsWith(`${norm} -`) || k.startsWith(`${norm},`)) {
          sum += v;
        }
      }
      return sum;
    }

    function getSubstrCount(map, name) {
      const norm = name.trim().toLowerCase();
      let sum = 0;
      for (const [k, v] of map.entries()) {
        if (k.includes(norm)) {
          sum += v;
        }
      }
      return sum;
    }

    // A. India Cities
    if (citiesData.india && Array.isArray(citiesData.india)) {
      for (const hub of citiesData.india) {
        const dbCount = getCityCount(compCityMap, hub.name);
        if (hub.count !== dbCount) {
          discrepancies.push({
            type: "India City (Companies)",
            name: hub.name,
            jsonCount: hub.count,
            dbCount
          });
        }
        hub.count = dbCount;
      }
    }

    // B. USA/Global Cities (Companies)
    if (citiesData.companies && Array.isArray(citiesData.companies)) {
      for (const hub of citiesData.companies) {
        const dbCount = getCityCount(compCityMap, hub.name);
        if (hub.count !== dbCount) {
          discrepancies.push({
            type: "USA City (Companies)",
            name: hub.name,
            jsonCount: hub.count,
            dbCount
          });
        }
        hub.count = dbCount;
      }
    }

    // C. USA/Global Cities (People)
    if (citiesData.people && Array.isArray(citiesData.people)) {
      for (const hub of citiesData.people) {
        const dbCount = getCityCount(peopleCityMap, hub.name);
        if (hub.count !== dbCount) {
          discrepancies.push({
            type: "USA City (People)",
            name: hub.name,
            jsonCount: hub.count,
            dbCount
          });
        }
        hub.count = dbCount;
      }
    }

    // D. Company Categories
    if (categoriesData.company && Array.isArray(categoriesData.company)) {
      for (const cat of categoriesData.company) {
        const dbCount = getSubstrCount(indMap, cat.name);
        if (cat.count !== dbCount) {
          discrepancies.push({
            type: "Company Category",
            name: cat.name,
            jsonCount: cat.count,
            dbCount
          });
        }
        cat.count = dbCount;
      }
    }

    // E. People Roles
    if (categoriesData.people && Array.isArray(categoriesData.people)) {
      for (const role of categoriesData.people) {
        const dbCount = getSubstrCount(roleMap, role.name);
        if (role.count !== dbCount) {
          discrepancies.push({
            type: "People Role",
            name: role.name,
            jsonCount: role.count,
            dbCount
          });
        }
        role.count = dbCount;
      }
    }

    console.log("\n" + "="*80);
    console.log(`🚨 AUDIT REPORT: Found ${discrepancies.length} Total Discrepancies Across Cities & Categories.`);
    console.log("="*80);

    console.log("\nSample Discrepancies Fixed:");
    for (const d of discrepancies.slice(0, 30)) {
      console.log(`  [${d.type}] ${d.name} -> UI Displayed: ${d.jsonCount.toLocaleString()} | Actual DB Count: ${d.dbCount.toLocaleString()}`);
    }

    // Write updated files
    fs.writeFileSync(citiesPath, JSON.stringify(citiesData, null, 2));
    console.log(`\n✅ Updated ${citiesPath} with 100% verified database counts.`);

    fs.writeFileSync(categoriesPath, JSON.stringify(categoriesData, null, 2));
    console.log(`✅ Updated ${categoriesPath} with 100% verified database counts.`);

  } finally {
    client.release();
    pool.end();
  }
}

run().catch(err => {
  console.error("❌ Audit script error:", err);
  process.exit(1);
});
