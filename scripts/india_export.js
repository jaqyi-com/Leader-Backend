require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 600000,
});

function clean(raw) {
  if (!raw || raw === "{}") return "";
  return raw.replace(/^\{/, "").replace(/\}$/, "").split(",")[0].trim().replace(/"/g, "");
}
function esc(val) {
  if (!val) return "";
  return '"' + String(val).replace(/"/g, '""') + '"';
}

const INDIA_STATES = new Set([
  "Maharashtra","Delhi","Karnataka","Andhra Pradesh","TamilNadu",
  "Gujarat","Rajasthan","Uttar Pradesh","Telangana","Kerala",
  "Madhya Pradesh","West Bengal","Haryana","Goa","Punjab",
  "Bihar","Assam","Odisha","Jharkhand","Chhattisgarh","Himachal Pradesh"
]);

const DECISION_TITLES = [
  "ceo","founder","co-founder","owner","director","cto","coo","cfo",
  "president","vp","vice president","managing director","md","managing partner",
  "partner","head","principal","proprietor","chairman","chief","executive"
];

function isDecisionMaker(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return DECISION_TITLES.some(kw => t.includes(kw));
}

async function main() {
  const c = await pool.connect();
  console.log("✅ Connected. Fetching large batch — filtering in JS...");
  console.time("query");

  // Fetch 5000 India contacts with BOTH email+phone (no job_title filter in SQL)
  // Then filter for decision-maker titles in JS — avoids slow full-table scan
  const r = await c.query(`
    SELECT full_name, first_name, last_name, job_title,
           city, state, location, emails, phones, linked_url
    FROM final.people
    WHERE state IN (
      'Maharashtra','Delhi','Karnataka','Andhra Pradesh','TamilNadu',
      'Gujarat','Rajasthan','Uttar Pradesh','Telangana','Kerala',
      'Madhya Pradesh','West Bengal','Haryana','Goa','Punjab',
      'Bihar','Assam','Odisha','Jharkhand','Chhattisgarh','Himachal Pradesh'
    )
    AND emails IS NOT NULL AND emails <> '' AND emails <> '{}'
    AND phones IS NOT NULL AND phones <> '' AND phones <> '{}'
    LIMIT 5000;
  `);

  console.timeEnd("query");
  console.log("Raw rows fetched:", r.rows.length);

  // Filter in JS for decision-maker titles
  const decisionMakers = r.rows.filter(row => isDecisionMaker(row.job_title));
  console.log("Decision makers found:", decisionMakers.length);

  // If not enough DMs, include all with any job title
  const allWithTitle = r.rows.filter(row => row.job_title && row.job_title.trim() !== "");
  console.log("Any job title:", allWithTitle.length);

  // Use DMs if >= 50, else fall back to any title, else all
  let final = decisionMakers.length >= 50 ? decisionMakers :
              allWithTitle.length >= 50   ? allWithTitle   : r.rows;
  final = final.slice(0, 200);

  const headers = ["S.No","Full Name","Job Title","City","State","Email","Phone","LinkedIn","Location"];
  const lines = final.map((row, i) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.full_name || "";
    return [
      i+1, esc(name), esc(row.job_title||""),
      esc(row.city||""), esc(row.state),
      esc(clean(row.emails)), esc(clean(row.phones)),
      esc(row.linked_url||""), esc(row.location||"")
    ].join(",");
  });

  const out = path.resolve(__dirname, "../Sample_India_DecisionMakers_LeaderData.csv");
  fs.writeFileSync(out, [headers.join(","), ...lines].join("\n"), "utf8");

  console.log("\n🎉 CSV SAVED:", out);
  console.log("📊 Records:", final.length);

  // States
  const states = {};
  final.forEach(r => { states[r.state] = (states[r.state]||0)+1; });
  console.log("States:", Object.entries(states).sort((a,b)=>b[1]-a[1]).map(([s,c])=>`${s}:${c}`).join(" | "));

  // Top titles
  const titles = {};
  final.forEach(r => { if(r.job_title) titles[r.job_title]=(titles[r.job_title]||0)+1; });
  const top = Object.entries(titles).sort((a,b)=>b[1]-a[1]).slice(0,10);
  console.log("\nTop Job Titles:");
  top.forEach(([t,c]) => console.log(`  ${c}x  ${t}`));

  console.log("\n--- PREVIEW ---");
  final.slice(0,8).forEach((row, i) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.full_name;
    console.log(`${i+1}. ${name} | ${row.job_title||"no title"} | ${row.state} | ${clean(row.emails)} | ${clean(row.phones)}`);
  });

  c.release();
  await pool.end();
}

main().catch(e => { console.error("❌ FAIL:", e.message); process.exit(1); });
