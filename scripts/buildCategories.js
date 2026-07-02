// Run this ONCE locally to generate hardcoded categories from ALL records.
// Usage: node scripts/buildCategories.js
require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  host:     process.env.CLOUD_SQL_HOST     || "34.9.35.25",
  port:     parseInt(process.env.CLOUD_SQL_PORT || "5432", 10),
  database: process.env.CLOUD_SQL_DB       || "doott_new",
  user:     process.env.CLOUD_SQL_USER     || "postgres",
  password: process.env.CLOUD_SQL_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const STOP_WORDS = new Set([
  "a","an","the","of","in","and","or","for","to","at","by","on","as","is","with","from",
  "senior","junior","lead","principal","associate","assistant","chief","head","global",
  "regional","national","corporate","interim","acting","sr","jr","ii","iii","iv","i",
]);
const STRIP_AT = /\s+(?:at|@|for|with|-)\s+.*/i;

function normalizePeople(raw = "") {
  let s = raw.replace(STRIP_AT, "").trim();
  s = s.replace(/[,;|#&*]/g, " ").replace(/\s{2,}/g, " ").trim();
  const words = s.split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 3);
  if (!words.length) return "";
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function normalizeCompany(raw = "") {
  const s = raw.replace(/[,;|#&*]/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!s || s.length < 2) return "";
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

async function runQuery(client, sql) {
  // Disable statement_timeout for this session so full scans can complete
  await client.query("SET statement_timeout = 0");
  const res = await client.query(sql);
  return res.rows;
}

async function main() {
  const client = await pool.connect();
  console.log("✅ Connected to DB");

  try {
    // ── PEOPLE: full GROUP BY on all 43M rows ──────────────
    console.log("⏳ Querying people job_titles (ALL 43M rows, no timeout)…");
    console.time("people");
    const peopleRows = await runQuery(client, `
      SELECT job_title, count(*) AS count
      FROM "final"."people"
      WHERE job_title IS NOT NULL AND job_title != ''
      GROUP BY job_title
      ORDER BY count DESC
      LIMIT 2000
    `);
    console.timeEnd("people");
    console.log(`   Found ${peopleRows.length} distinct job titles`);

    // Normalise + group
    const pFreq = {};
    for (const r of peopleRows) {
      const name = normalizePeople(r.job_title);
      if (!name || name.length < 2) continue;
      pFreq[name] = (pFreq[name] || 0) + parseInt(r.count, 10);
    }
    const peopleCats = Object.entries(pFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([name, count]) => ({ name, count }));

    // ── COMPANIES: full GROUP BY on all 1.78M rows ─────────
    console.log("⏳ Querying company industries (ALL 1.78M rows, no timeout)…");
    console.time("companies");
    const companyRows = await runQuery(client, `
      SELECT industry, count(*) AS count
      FROM "final"."companies"
      WHERE industry IS NOT NULL AND industry != ''
      GROUP BY industry
      ORDER BY count DESC
      LIMIT 2000
    `);
    console.timeEnd("companies");
    console.log(`   Found ${companyRows.length} distinct industries`);

    // Normalise + group
    const cFreq = {};
    for (const r of companyRows) {
      const name = normalizeCompany(r.industry);
      if (!name || name.length < 2) continue;
      cFreq[name] = (cFreq[name] || 0) + parseInt(r.count, 10);
    }
    const companyCats = Object.entries(cFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([name, count]) => ({ name, count }));

    // ── Write output ────────────────────────────────────────
    const output = { people: peopleCats, company: companyCats };
    const outPath = path.join(__dirname, "../frontend/src/categories.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log("\n✅ Written to:", outPath);
    console.log(`   People categories  : ${peopleCats.length}`);
    console.log(`   Company categories : ${companyCats.length}`);
    console.log("\nTop 5 People:");
    peopleCats.slice(0, 5).forEach(c => console.log(`  ${c.count.toLocaleString()} × ${c.name}`));
    console.log("\nTop 5 Companies:");
    companyCats.slice(0, 5).forEach(c => console.log(`  ${c.count.toLocaleString()} × ${c.name}`));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
