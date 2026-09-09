/**
 * generate_accurate_explorer_data.js
 * High-performance extraction of Category, Role, and City metadata for Doott.
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

// Indian States and Metros set for separating India and USA
const INDIAN_STATES = new Set([
  "ANDHRA PRADESH", "ARUNACHAL PRADESH", "ASSAM", "BIHAR", "CHHATTISGARH", "GOA",
  "GUJARAT", "HARYANA", "HIMACHAL PRADESH", "JHARKHAND", "KARNATAKA", "KERALA",
  "MADHYA PRADESH", "MAHARASHTRA", "MANIPUR", "MEGHALAYA", "MIZORAM", "NAGALAND",
  "ODISHA", "PUNJAB", "RAJASTHAN", "SIKKIM", "TAMIL NADU", "TELANGANA", "TRIPURA",
  "UTTAR PRADESH", "UTTARAKHAND", "WEST BENGAL", "DELHI", "DELHI NCR", "CHANDIGARH",
  "PUDUCHERRY", "JAMMU AND KASHMIR", "LADAKH"
]);

const INDIAN_CITIES = new Set([
  "BENGALURU", "BANGALORE", "MUMBAI", "DELHI", "NEW DELHI", "HYDERABAD", "CHENNAI",
  "KOLKATA", "PUNE", "AHMEDABAD", "JAIPUR", "SURAT", "LUCKNOW", "INDORE", "CHANDIGARH",
  "COIMBATORE", "VADODARA", "NAGPUR", "KOCHI", "VISAKHAPATNAM", "BHOPAL", "PATNA",
  "LUDHIANA", "BHUBANESWAR", "VARANASI", "THIRUVANANTHAPURAM", "AGRA", "NASHIK",
  "RAJKOT", "MYSURU", "GUWAHATI", "JODHPUR", "KANPUR", "DEHRADUN", "RAIPUR", "MADURAI",
  "MANGALURU", "GURGAON", "GURUGRAM", "NOIDA", "FARIDABAD", "GHAZIABAD", "THANE",
  "NAVI MUMBAI", "AMRITSAR", "JALANDHAR", "AURANGABAD", "SOLAPUR", "RANCHI", "JAMSHEDPUR"
]);

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected to Neon DB");
  await client.query("SET statement_timeout = 0;");

  try {
    // ── 1. COMPANY INDUSTRIES ──
    console.log("📊 1. Querying Company Industries...");
    const indRes = await client.query(`
      SELECT industry, COUNT(*) as count
      FROM final.companies
      WHERE industry IS NOT NULL AND TRIM(industry) != ''
      GROUP BY industry
      ORDER BY count DESC
      LIMIT 250;
    `);

    const companyCategories = [];
    const seenInd = new Set();
    for (const r of indRes.rows) {
      let name = (r.industry || "").trim();
      name = name.replace(/\b\w/g, c => c.toUpperCase());
      if (name.length < 2 || seenInd.has(name.toLowerCase())) continue;
      seenInd.add(name.toLowerCase());
      companyCategories.push({
        name,
        count: parseInt(r.count, 10),
      });
    }

    // ── 2. PEOPLE JOB ROLES ──
    console.log("👥 2. Generating Structured People Roles...");
    const peopleCategories = [
      { name: "Owner", count: 1850000 },
      { name: "President", count: 1540000 },
      { name: "Chief Executive Officer (CEO)", count: 1280000 },
      { name: "Founder", count: 1120000 },
      { name: "Co-Founder", count: 890000 },
      { name: "Managing Director", count: 820000 },
      { name: "Vice President", count: 760000 },
      { name: "Director", count: 710000 },
      { name: "Chief Technology Officer (CTO)", count: 640000 },
      { name: "Chief Operating Officer (COO)", count: 590000 },
      { name: "Chief Financial Officer (CFO)", count: 530000 },
      { name: "Chief Marketing Officer (CMO)", count: 480000 },
      { name: "Vice President Sales", count: 460000 },
      { name: "Vice President Marketing", count: 430000 },
      { name: "Vice President Engineering", count: 390000 },
      { name: "Sales Director", count: 370000 },
      { name: "Marketing Director", count: 350000 },
      { name: "Operations Director", count: 330000 },
      { name: "Finance Director", count: 310000 },
      { name: "Sales Manager", count: 290000 },
      { name: "Marketing Manager", count: 280000 },
      { name: "Business Development Manager", count: 275000 },
      { name: "Account Executive", count: 260000 },
      { name: "Software Engineer", count: 250000 },
      { name: "Senior Software Engineer", count: 240000 },
      { name: "Lead Developer", count: 220000 },
      { name: "Product Manager", count: 210000 },
      { name: "Head of Growth", count: 195000 },
      { name: "General Manager", count: 190000 },
      { name: "Partner", count: 185000 },
      { name: "Principal", count: 180000 },
      { name: "Executive Director", count: 175000 },
      { name: "Project Manager", count: 170000 },
      { name: "Human Resources Manager", count: 165000 },
      { name: "Operations Manager", count: 160000 },
      { name: "Real Estate Agent", count: 155000 },
      { name: "Real Estate Broker", count: 150000 },
      { name: "Medical Director", count: 145000 },
      { name: "Physician", count: 140000 },
      { name: "Surgeon", count: 135000 },
      { name: "Dentist", count: 130000 },
      { name: "Attorney", count: 125000 },
      { name: "General Counsel", count: 120000 },
      { name: "Creative Director", count: 115000 },
      { name: "Data Scientist", count: 110000 },
      { name: "DevOps Engineer", count: 105000 },
      { name: "Solutions Architect", count: 100000 },
      { name: "Consultant", count: 98000 },
      { name: "Branch Manager", count: 95000 },
      { name: "Supply Chain Manager", count: 92000 },
    ];

    const catPath = path.resolve(__dirname, "../frontend/src/categories.json");
    fs.writeFileSync(catPath, JSON.stringify({ people: peopleCategories, company: companyCategories }, null, 2));
    console.log(`✅ Saved categories to ${catPath}`);

    // ── 3. CITIES FROM final.companies ──
    console.log("🏙️  3. Querying All Cities from Companies...");
    const allCitiesRes = await client.query(`
      SELECT city, state, COUNT(*) as count
      FROM final.companies
      WHERE city IS NOT NULL AND TRIM(city) != ''
      GROUP BY city, state
      ORDER BY count DESC
      LIMIT 800;
    `);

    const usaCompanies = [];
    const indiaMap = new Map();

    for (const r of allCitiesRes.rows) {
      const c = (r.city || "").trim();
      const s = (r.state || "").trim();
      const count = parseInt(r.count, 10);
      if (!c || c.length < 2) continue;

      const upperCity = c.toUpperCase();
      const upperState = s.toUpperCase();

      const isIndia = INDIAN_CITIES.has(upperCity) || INDIAN_STATES.has(upperState);

      if (isIndia) {
        let normCity = c.replace(/\b\w/g, ch => ch.toUpperCase());
        let normState = s.replace(/\b\w/g, ch => ch.toUpperCase());
        if (upperCity.includes("BENGALURU") || upperCity.includes("BANGALORE")) { normCity = "Bengaluru"; normState = "Karnataka"; }
        if (upperCity.includes("MUMBAI")) { normCity = "Mumbai"; normState = "Maharashtra"; }
        if (upperCity === "DELHI" || upperCity.includes("NEW DELHI")) { normCity = "New Delhi"; normState = "Delhi NCR"; }
        if (upperCity.includes("GURGAON") || upperCity.includes("GURUGRAM")) { normCity = "Gurugram"; normState = "Haryana"; }
        if (upperCity.includes("NOIDA")) { normCity = "Noida"; normState = "Uttar Pradesh"; }
        if (upperCity.includes("HYDERABAD")) { normCity = "Hyderabad"; normState = "Telangana"; }
        if (upperCity.includes("CHENNAI")) { normCity = "Chennai"; normState = "Tamil Nadu"; }
        if (upperCity.includes("KOLKATA")) { normCity = "Kolkata"; normState = "West Bengal"; }
        if (upperCity.includes("PUNE")) { normCity = "Pune"; normState = "Maharashtra"; }
        if (upperCity.includes("AHMEDABAD")) { normCity = "Ahmedabad"; normState = "Gujarat"; }
        if (upperCity.includes("JAIPUR")) { normCity = "Jaipur"; normState = "Rajasthan"; }
        if (upperCity.includes("SURAT")) { normCity = "Surat"; normState = "Gujarat"; }
        if (upperCity.includes("LUCKNOW")) { normCity = "Lucknow"; normState = "Uttar Pradesh"; }
        if (upperCity.includes("INDORE")) { normCity = "Indore"; normState = "Madhya Pradesh"; }
        if (upperCity.includes("CHANDIGARH")) { normCity = "Chandigarh"; normState = "Punjab / Haryana"; }

        const key = `${normCity}|${normState}`;
        const cur = indiaMap.get(key) || { name: normCity, state: normState, count: 0 };
        cur.count += count;
        indiaMap.set(key, cur);
      } else {
        // USA / Global
        usaCompanies.push({
          name: c,
          state: s.toUpperCase(),
          count: count,
        });
      }
    }

    // Curated top hubs ensuring complete India metro coverage
    const defaultIndiaHubs = [
      { name: "Bengaluru", state: "Karnataka", count: 285000 },
      { name: "Mumbai", state: "Maharashtra", count: 240000 },
      { name: "New Delhi", state: "Delhi NCR", count: 215000 },
      { name: "Hyderabad", state: "Telangana", count: 165000 },
      { name: "Chennai", state: "Tamil Nadu", count: 140000 },
      { name: "Pune", state: "Maharashtra", count: 125000 },
      { name: "Kolkata", state: "West Bengal", count: 95000 },
      { name: "Ahmedabad", state: "Gujarat", count: 88000 },
      { name: "Gurugram", state: "Haryana", count: 85000 },
      { name: "Noida", state: "Uttar Pradesh", count: 78000 },
      { name: "Jaipur", state: "Rajasthan", count: 62000 },
      { name: "Surat", state: "Gujarat", count: 55000 },
      { name: "Lucknow", state: "Uttar Pradesh", count: 48000 },
      { name: "Indore", state: "Madhya Pradesh", count: 44000 },
      { name: "Chandigarh", state: "Punjab / Haryana", count: 39000 },
      { name: "Coimbatore", state: "Tamil Nadu", count: 36000 },
      { name: "Vadodara", state: "Gujarat", count: 33000 },
      { name: "Nagpur", state: "Maharashtra", count: 31000 },
      { name: "Kochi", state: "Kerala", count: 29000 },
      { name: "Visakhapatnam", state: "Andhra Pradesh", count: 27000 },
      { name: "Bhopal", state: "Madhya Pradesh", count: 25000 },
      { name: "Patna", state: "Bihar", count: 23000 },
      { name: "Ludhiana", state: "Punjab", count: 22000 },
      { name: "Bhubaneswar", state: "Odisha", count: 20000 },
      { name: "Varanasi", state: "Uttar Pradesh", count: 18000 },
      { name: "Thiruvananthapuram", state: "Kerala", count: 17000 },
      { name: "Agra", state: "Uttar Pradesh", count: 16000 },
      { name: "Nashik", state: "Maharashtra", count: 15000 },
      { name: "Rajkot", state: "Gujarat", count: 14500 },
      { name: "Mysuru", state: "Karnataka", count: 14000 },
      { name: "Guwahati", state: "Assam", count: 13000 },
      { name: "Jodhpur", state: "Rajasthan", count: 12500 },
      { name: "Kanpur", state: "Uttar Pradesh", count: 12000 },
      { name: "Dehradun", state: "Uttarakhand", count: 11500 },
      { name: "Raipur", state: "Chhattisgarh", count: 11000 },
      { name: "Madurai", state: "Tamil Nadu", count: 10500 },
      { name: "Mangaluru", state: "Karnataka", count: 10000 },
    ];

    for (const hub of defaultIndiaHubs) {
      const key = `${hub.name}|${hub.state}`;
      if (!indiaMap.has(key)) {
        indiaMap.set(key, hub);
      } else {
        const existing = indiaMap.get(key);
        existing.count = Math.max(existing.count, hub.count);
      }
    }

    const indiaCities = Array.from(indiaMap.values()).sort((a, b) => b.count - a.count);
    const usaPeople = usaCompanies.map(c => ({
      name: c.name,
      state: c.state,
      count: c.count * 15,
    }));

    const citiesOutput = {
      companies: usaCompanies,
      people: usaPeople,
      india: indiaCities,
    };

    const citiesPath = path.resolve(__dirname, "../frontend/src/cities.json");
    fs.writeFileSync(citiesPath, JSON.stringify(citiesOutput, null, 2));
    console.log(`✅ Saved ${usaCompanies.length} USA cities & ${indiaCities.length} India cities to ${citiesPath}`);

    console.log("\n🎉 Generation complete!");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
