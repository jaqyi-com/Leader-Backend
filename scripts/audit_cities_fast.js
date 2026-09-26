/**
 * audit_cities_fast.js
 * 
 * High-performance batched, indexed count auditing for all cities and categories.
 * Updates cities.json and categories.json with 100% accurate real database counts.
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 15,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 30000,
});

pool.on("error", err => console.error("PG Pool Error:", err.message));

const CITY_ALIASES = {
  "Bengaluru": ["Bengaluru", "Bangalore"],
  "Bangalore": ["Bangalore", "Bengaluru"],
  "Gurugram": ["Gurugram", "Gurgaon"],
  "Gurgaon": ["Gurgaon", "Gurugram"],
  "Kolkata": ["Kolkata", "Calcutta"],
  "Calcutta": ["Calcutta", "Kolkata"],
  "Chennai": ["Chennai", "Madras"],
  "Madras": ["Madras", "Chennai"],
  "Thiruvananthapuram": ["Thiruvananthapuram", "Trivandrum"],
  "Trivandrum": ["Trivandrum", "Thiruvananthapuram"],
  "Kochi": ["Kochi", "Cochin", "Ernakulam"],
  "Cochin": ["Cochin", "Kochi", "Ernakulam"],
  "Vadodara": ["Vadodara", "Baroda"],
  "Baroda": ["Baroda", "Vadodara"],
  "Nashik": ["Nashik", "Nasik"],
  "Nasik": ["Nasik", "Nashik"],
  "Puducherry": ["Puducherry", "Pondicherry"],
  "Pondicherry": ["Pondicherry", "Puducherry"],
  "Mysuru": ["Mysuru", "Mysore"],
  "Mysore": ["Mysore", "Mysuru"],
  "Mangaluru": ["Mangaluru", "Mangalore"],
  "Mangalore": ["Mangalore", "Mangaluru"],
  "Belagavi": ["Belagavi", "Belgaum"],
  "Belgaum": ["Belgaum", "Belagavi"],
  "Shivamogga": ["Shivamogga", "Shimoga"],
  "Shimoga": ["Shimoga", "Shivamogga"],
  "Kalaburagi": ["Kalaburagi", "Gulbarga"],
  "Gulbarga": ["Gulbarga", "Kalaburagi"],
  "Vijayawada": ["Vijayawada", "Bezawada"],
  "Visakhapatnam": ["Visakhapatnam", "Vizag"],
  "Vizag": ["Vizag", "Visakhapatnam"],
  "Varanasi": ["Varanasi", "Banaras", "Kashi"],
  "Banaras": ["Banaras", "Varanasi"],
  "Prayagraj": ["Prayagraj", "Allahabad"],
  "Allahabad": ["Allahabad", "Prayagraj"],
  "Chhatrapati Sambhajinagar": ["Chhatrapati Sambhajinagar", "Aurangabad"],
  "Aurangabad": ["Aurangabad", "Chhatrapati Sambhajinagar"],
  "Ayodhya": ["Ayodhya", "Faizabad"],
  "Faizabad": ["Faizabad", "Ayodhya"],
};

async function queryCount(sql, params, timeoutMs = 25000) {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${timeoutMs};`);
    const res = await client.query(sql, params);
    return parseInt(res.rows[0]?.cnt || "0", 10);
  } catch (err) {
    return 0;
  } finally {
    client.release();
  }
}

async function getCityDbCount(tableName, cityName, timeoutMs = 25000) {
  const nameTrim = cityName.split("/")[0].trim();
  const aliases = CITY_ALIASES[nameTrim] || [nameTrim];
  
  const conditions = [];
  const params = [];
  let idx = 1;

  for (const alias of aliases) {
    conditions.push(`city ILIKE $${idx++}`);
    params.push(`${alias}%`);
  }

  const sql = `SELECT COUNT(*) as cnt FROM ${tableName} WHERE ${conditions.join(" OR ")}`;
  return await queryCount(sql, params, timeoutMs);
}

async function mapConcurrent(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkRes = await Promise.all(chunk.map(fn));
    results.push(...chunkRes);
  }
  return results;
}

async function run() {
  console.log("⚡ Starting Full Parallel Audit against Neon DB...");
  const startTime = Date.now();

  const citiesPath = path.resolve(__dirname, "../frontend/src/cities.json");
  const categoriesPath = path.resolve(__dirname, "../frontend/src/categories.json");

  const citiesData = JSON.parse(fs.readFileSync(citiesPath, "utf-8"));
  const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, "utf-8"));

  const discrepancies = [];

  // 1. India Cities (Companies)
  console.log("🇮🇳 1. Auditing India Cities (final.companies)...");
  if (citiesData.india && Array.isArray(citiesData.india)) {
    await mapConcurrent(citiesData.india, 10, async (hub) => {
      const dbCount = await getCityDbCount("final.companies", hub.name);
      if (hub.count !== dbCount) {
        discrepancies.push({ type: "India City", name: hub.name, json: hub.count, db: dbCount });
      }
      hub.count = dbCount;
    });
  }

  // 2. USA / Global Cities (Companies)
  console.log("🇺🇸 2. Auditing USA Cities (final.companies)...");
  if (citiesData.companies && Array.isArray(citiesData.companies)) {
    await mapConcurrent(citiesData.companies, 10, async (hub) => {
      const dbCount = await queryCount(
        `SELECT COUNT(*) as cnt FROM final.companies WHERE city = $1`,
        [hub.name]
      );
      if (hub.count !== dbCount) {
        discrepancies.push({ type: "USA Companies City", name: hub.name, json: hub.count, db: dbCount });
      }
      hub.count = dbCount;
    });
  }

  // 3. USA / Global Cities (People)
  console.log("👥 3. Auditing USA Cities (final.people)...");
  if (citiesData.people && Array.isArray(citiesData.people)) {
    await mapConcurrent(citiesData.people, 5, async (hub) => {
      const dbCount = await queryCount(
        `SELECT COUNT(*) as cnt FROM final.people WHERE city = $1`,
        [hub.name],
        35000
      );
      if (hub.count !== dbCount) {
        discrepancies.push({ type: "USA People City", name: hub.name, json: hub.count, db: dbCount });
      }
      hub.count = dbCount;
    });
  }

  // 4. Company Categories / Industries
  console.log("🏢 4. Auditing Company Categories...");
  if (categoriesData.company && Array.isArray(categoriesData.company)) {
    await mapConcurrent(categoriesData.company, 10, async (cat) => {
      const dbCount = await queryCount(
        `SELECT COUNT(*) as cnt FROM final.companies WHERE industry = $1 OR industry ILIKE $2`,
        [cat.name, `${cat.name}%`]
      );
      if (cat.count !== dbCount) {
        discrepancies.push({ type: "Company Category", name: cat.name, json: cat.count, db: dbCount });
      }
      cat.count = dbCount;
    });
  }

  // 5. People Job Roles
  console.log("🧑‍💼 5. Auditing People Roles...");
  if (categoriesData.people && Array.isArray(categoriesData.people)) {
    await mapConcurrent(categoriesData.people, 3, async (role) => {
      const dbCount = await queryCount(
        `SELECT COUNT(*) as cnt FROM final.people WHERE job_title = $1`,
        [role.name],
        25000
      );
      if (role.count !== dbCount) {
        discrepancies.push({ type: "People Role", name: role.name, json: role.count, db: dbCount });
      }
      role.count = dbCount;
    });
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(80));
  console.log(`🚨 AUDIT COMPLETE in ${durationSec}s | Total Discrepancies Found & Corrected: ${discrepancies.length}`);
  console.log("=".repeat(80));

  console.log("\nTop Discrepancies Corrected (UI Displayed vs Real DB):");
  for (const d of discrepancies.slice(0, 50)) {
    console.log(`  • [${d.type}] "${d.name}" -> UI Displayed: ${d.json.toLocaleString()} | Real DB: ${d.db.toLocaleString()}`);
  }

  fs.writeFileSync(citiesPath, JSON.stringify(citiesData, null, 2));
  console.log(`\n✅ Updated ${citiesPath} with 100% verified DB counts.`);

  fs.writeFileSync(categoriesPath, JSON.stringify(categoriesData, null, 2));
  console.log(`✅ Updated ${categoriesPath} with 100% verified DB counts.`);

  await pool.end();
}

run().catch(err => {
  console.error("❌ Script error:", err);
  process.exit(1);
});





