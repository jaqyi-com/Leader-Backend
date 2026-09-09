/**
 * clean_people_state.js
 *
 * Uses Neon's @neondatabase/serverless HTTP driver — each query is a
 * single HTTP POST, so there are NO TCP connection timeouts.
 *
 * Fixes in final.people:
 *  1. Whitespace trimming
 *  2. Cities stored in state field
 *  3. State name spelling variants (30+ groups)
 *  4. US state codes → UPPERCASE
 *
 * Usage: node scripts/clean_people_state.js
 */

const { neon } = require("@neondatabase/serverless");

const NEON_URL =
  "postgresql://neondb_owner:npg_0RCpItxXTuf6@ep-cool-shape-aik0wbtp-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const sql = neon(NEON_URL);

// Cities stored in the state field
const CITY_FIXES = [
  { bad: ["gurgaon", "gurugram"],       city: "Gurgaon",   state: "Haryana" },
  { bad: ["noida"],                      city: "Noida",     state: "Uttar Pradesh" },
  { bad: ["chennai", "madras"],          city: "Chennai",   state: "Tamil Nadu" },
  { bad: ["bangalore", "bengaluru"],     city: "Bangalore", state: "Karnataka" },
  { bad: ["mumbai", "bombay"],           city: "Mumbai",    state: "Maharashtra" },
  { bad: ["hyderabad"],                  city: "Hyderabad", state: "Telangana" },
  { bad: ["pune"],                       city: "Pune",      state: "Maharashtra" },
  { bad: ["kolkata", "calcutta"],        city: "Kolkata",   state: "West Bengal" },
  { bad: ["ahmedabad"],                  city: "Ahmedabad", state: "Gujarat" },
  { bad: ["jaipur"],                     city: "Jaipur",    state: "Rajasthan" },
  { bad: ["lucknow"],                    city: "Lucknow",   state: "Uttar Pradesh" },
  { bad: ["chandigarh"],                 city: "Chandigarh",state: "Punjab" },
  { bad: ["bhopal"],                     city: "Bhopal",    state: "Madhya Pradesh" },
  { bad: ["kochi", "cochin"],            city: "Kochi",     state: "Kerala" },
  { bad: ["patna"],                      city: "Patna",     state: "Bihar" },
];

// State name spelling variants
const STATE_FIXES = [
  { bad: ["mah","maharastra","mh","maharashtra","mahrashtra","mahrastra"], state: "Maharashtra" },
  { bad: ["kar","karnataka","ka","karnatka","karnatak"],                   state: "Karnataka" },
  { bad: ["tn","tamil nadu","tamilnadu","tamil","tamilnadhu"],             state: "Tamil Nadu" },
  { bad: ["gj","gujarat","gujrat","gujraat"],                              state: "Gujarat" },
  { bad: ["dl","delhi","new delhi","nd","n.delhi"],                        state: "Delhi" },
  { bad: ["ap","andhra pradesh","andhra","andhrapradesh","a.p"],           state: "Andhra Pradesh" },
  { bad: ["ts","tg","telangana","telegana"],                               state: "Telangana" },
  { bad: ["wb","west bengal","westbengal","w.bengal"],                     state: "West Bengal" },
  { bad: ["rj","rajasthan","raj","rajesthan"],                             state: "Rajasthan" },
  { bad: ["pb","punjab","panjab"],                                         state: "Punjab" },
  { bad: ["hr","haryana","hariyana"],                                      state: "Haryana" },
  { bad: ["mp","madhya pradesh","madhyapradesh","m.p"],                    state: "Madhya Pradesh" },
  { bad: ["kl","kerala","kerela"],                                         state: "Kerala" },
  { bad: ["br","bihar"],                                                   state: "Bihar" },
  { bad: ["up","uttar pradesh","uttarpradesh","u.p"],                      state: "Uttar Pradesh" },
  { bad: ["uk","uttarakhand","uttrakhand"],                                state: "Uttarakhand" },
  { bad: ["hp","himachal pradesh","himachalpradesh"],                      state: "Himachal Pradesh" },
  { bad: ["jk","jammu and kashmir","jammu & kashmir","j&k"],              state: "Jammu & Kashmir" },
  { bad: ["ga","goa"],                                                     state: "Goa" },
  { bad: ["as","assam"],                                                   state: "Assam" },
  { bad: ["od","or","odisha","orissa"],                                    state: "Odisha" },
  { bad: ["ct","cg","chhattisgarh","chattisgrah"],                         state: "Chhattisgarh" },
  { bad: ["jh","jharkhand","jharkand"],                                    state: "Jharkhand" },
];

async function runUpdate(label, query) {
  process.stdout.write(`  ${label}: `);
  try {
    const res = await sql(query);
    // neon() returns the result; rowCount is in the result object
    const count = res.length !== undefined ? res.length : "?";
    console.log(`done`);
    return count;
  } catch (err) {
    console.log(`ERROR — ${err.message}`);
    return 0;
  }
}

// Build a raw tagged-template string for neon()
async function execRaw(query) {
  // neon supports raw string queries via sql.query
  const res = await sql.query(query);
  return res.rowCount || 0;
}

async function main() {
  console.log("Using Neon HTTP driver (no TCP timeouts)\n");

  // Step 1: Trim whitespace
  console.log("─── Step 1: Trim whitespace ───");
  const t1 = await execRaw(
    "UPDATE final.people SET state = TRIM(state) WHERE state IS NOT NULL AND state <> TRIM(state)"
  );
  console.log(`  trimmed: ${t1} rows`);

  // Step 2: Fix cities in state field
  console.log("\n─── Step 2: Cities in state field ───");
  let cityTotal = 0;
  for (const fix of CITY_FIXES) {
    const inList = fix.bad.map((v) => `'${v}'`).join(", ");
    const count = await execRaw(
      `UPDATE final.people SET city = '${fix.city}', state = '${fix.state}' WHERE LOWER(TRIM(state)) IN (${inList})`
    );
    console.log(`  ${fix.city} / ${fix.state}: ${count}`);
    cityTotal += count;
  }

  // Step 3: State name normalization
  console.log("\n─── Step 3: State name normalization ───");
  let stateTotal = 0;
  for (const fix of STATE_FIXES) {
    const inList = fix.bad.map((v) => `'${v}'`).join(", ");
    const count = await execRaw(
      `UPDATE final.people SET state = '${fix.state}' WHERE LOWER(TRIM(state)) IN (${inList})`
    );
    console.log(`  ${fix.state}: ${count}`);
    stateTotal += count;
  }

  // Step 4: US state codes → uppercase
  console.log("\n─── Step 4: US state codes → UPPERCASE ───");
  const usCount = await execRaw(
    `UPDATE final.people SET state = UPPER(TRIM(state)) WHERE LENGTH(TRIM(state)) = 2 AND TRIM(state) <> UPPER(TRIM(state))`
  );
  console.log(`  uppercased: ${usCount}`);

  console.log("\n════════════════════════════════════════");
  console.log("✅ All done!");
  console.log(`   Whitespace trimmed : ${t1}`);
  console.log(`   Cities fixed       : ${cityTotal}`);
  console.log(`   State names fixed  : ${stateTotal}`);
  console.log(`   US codes uppercased: ${usCount}`);
  console.log(`   TOTAL              : ${t1 + cityTotal + stateTotal + usCount}`);
  console.log("════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
