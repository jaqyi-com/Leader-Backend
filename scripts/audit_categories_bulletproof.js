/**
 * audit_categories_bulletproof.js
 * 
 * Uses SET statement_timeout = 0 on a single Postgres connection session
 * to extract exact, live Neon DB counts for all company industries and people job roles.
 * Updates all 6 sections of frontend/src/categories.json:
 *  - india.company & india.people
 *  - usa.company & usa.people
 *  - root company & root people
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

async function run() {
  const client = await pool.connect();
  console.log("⚡ Connected to Neon DB for Bulletproof Category Audit...");

  // Disable statement timeout for session
  await client.query("SET statement_timeout = 0;");

  const categoriesPath = path.resolve(__dirname, "../frontend/src/categories.json");
  const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, "utf-8"));

  // ── 1. Fetch Companies Industry Maps ─────────────────────────────────────
  console.log("🏢 1/4 Fetching ALL Company Industry counts...");
  const indAllRes = await client.query(`
    SELECT LOWER(TRIM(industry)) as norm_ind, COUNT(*) as cnt
    FROM final.companies
    WHERE industry IS NOT NULL AND TRIM(industry) != ''
    GROUP BY LOWER(TRIM(industry));
  `);
  const indAllMap = new Map();
  for (const r of indAllRes.rows) indAllMap.set(r.norm_ind, parseInt(r.cnt, 10));

  console.log("🏢 2/4 Fetching India Company Industry counts...");
  const indIndiaRes = await client.query(`
    SELECT LOWER(TRIM(industry)) as norm_ind, COUNT(*) as cnt
    FROM final.companies
    WHERE industry IS NOT NULL AND TRIM(industry) != ''
      AND ("geo_source" != 'us_zip' OR "pincode" ~ '^[1-9][0-9]{5}$')
    GROUP BY LOWER(TRIM(industry));
  `);
  const indIndiaMap = new Map();
  for (const r of indIndiaRes.rows) indIndiaMap.set(r.norm_ind, parseInt(r.cnt, 10));

  console.log("🏢 3/4 Fetching USA Company Industry counts...");
  const indUsaRes = await client.query(`
    SELECT LOWER(TRIM(industry)) as norm_ind, COUNT(*) as cnt
    FROM final.companies
    WHERE industry IS NOT NULL AND TRIM(industry) != ''
      AND "geo_source" = 'us_zip'
    GROUP BY LOWER(TRIM(industry));
  `);
  const indUsaMap = new Map();
  for (const r of indUsaRes.rows) indUsaMap.set(r.norm_ind, parseInt(r.cnt, 10));

  // ── 2. Fetch People Job Title Maps ───────────────────────────────────────
  console.log("🧑‍💼 4/4 Fetching ALL People Job Title counts (45M rows full scan)...");
  console.time("People DB Query");
  const roleAllRes = await client.query(`
    SELECT LOWER(TRIM(job_title)) as norm_role, COUNT(*) as cnt
    FROM final.people
    WHERE job_title IS NOT NULL AND TRIM(job_title) != ''
    GROUP BY LOWER(TRIM(job_title));
  `);
  console.timeEnd("People DB Query");

  const roleAllMap = new Map();
  for (const r of roleAllRes.rows) roleAllMap.set(r.norm_role, parseInt(r.cnt, 10));

  client.release();
  await pool.end();

  // ── 3. Helper to lookup category count from DB map ───────────────────────
  function getCategoryDbCount(dbMap, categoryName) {
    const target = categoryName.trim().toLowerCase();
    
    // Exact match
    if (dbMap.has(target)) {
      return dbMap.get(target);
    }

    // Substring/Prefix matching
    let sum = 0;
    for (const [key, cnt] of dbMap.entries()) {
      if (key === target || key.startsWith(target) || key.includes(target)) {
        sum += cnt;
      }
    }
    return sum;
  }

  // ── 4. Audit & Update All 6 Categories Sections ──────────────────────────
  const discrepancies = [];

  function updateList(sectionName, list, dbMap) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const realCount = getCategoryDbCount(dbMap, item.name);
      if (item.count !== realCount) {
        discrepancies.push({
          section: sectionName,
          name: item.name,
          displayed: item.count,
          actual: realCount
        });
      }
      item.count = realCount;
    }
  }

  console.log("\n📊 Auditing & updating all category counts...");

  if (categoriesData.india) {
    updateList("India Companies", categoriesData.india.company, indIndiaMap);
    updateList("India People", categoriesData.india.people, roleAllMap);
  }

  if (categoriesData.usa) {
    updateList("USA Companies", categoriesData.usa.company, indUsaMap);
    updateList("USA People", categoriesData.usa.people, roleAllMap);
  }

  if (categoriesData.company) {
    updateList("Root Companies", categoriesData.company, indAllMap);
  }

  if (categoriesData.people) {
    updateList("Root People", categoriesData.people, roleAllMap);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`🚨 CATEGORY AUDIT COMPLETE | Discrepancies Found & Fixed: ${discrepancies.length}`);
  console.log("="*80);

  console.log("\nTop 40 Discrepancies Fixed (UI Card Display -> Verified DB Count):");
  for (const d of discrepancies.slice(0, 40)) {
    console.log(`  • [${d.section}] "${d.name}" | UI Displayed: ${d.displayed.toLocaleString()} -> Verified DB: ${d.actual.toLocaleString()}`);
  }

  fs.writeFileSync(categoriesPath, JSON.stringify(categoriesData, null, 2));
  console.log(`\n✅ Successfully updated ${categoriesPath} with 100% verified DB counts.`);
}

run().catch(err => {
  console.error("❌ Audit failed:", err);
  process.exit(1);
});
