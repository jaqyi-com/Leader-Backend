/**
 * fast_import_bhubaneswar.js
 * High-speed import of Bhubaneswar company and people records into Neon DB.
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

function parseCSVLine(text) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected to Neon DB");
  await client.query("SET statement_timeout = 0;");

  try {
    // 1. Standardize existing DB records
    console.log("🛠️  1. Standardizing existing Bhubaneswar records in DB...");
    const stdCompRes = await client.query(`
      UPDATE final.companies
      SET city = 'Bhubaneswar', state = 'Odisha'
      WHERE (city ILIKE '%bhubaneswar%' OR address ILIKE '%bhubaneswar%') AND (city != 'Bhubaneswar' OR state != 'Odisha');
    `);
    console.log(`   Updated ${stdCompRes.rowCount} company rows.`);

    const stdPeopleRes = await client.query(`
      UPDATE final.people
      SET city = 'Bhubaneswar', state = 'Odisha'
      WHERE (city ILIKE '%bhubaneswar%' OR location ILIKE '%bhubaneswar%') AND (city != 'Bhubaneswar' OR state != 'Odisha');
    `);
    console.log(`   Updated ${stdPeopleRes.rowCount} people rows.`);

    // 2. Extract Bhubaneswar lines from companies_v2.csv using grep
    console.log("\n📦 2. Fast extracting Bhubaneswar company records from CSVs...");
    const compV2Path = "/Volumes/akshat/LeadGenerator/final_data/companies_v2.csv";
    const compLines = execSync(`grep -i "bhubaneswar" "${compV2Path}"`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }).split("\n");

    const newCompanies = [];
    const seenCompanyKeys = new Set();

    const dbCompRes = await client.query(`SELECT LOWER(business_name) as name FROM final.companies WHERE city ILIKE '%bhubaneswar%'`);
    for (const r of dbCompRes.rows) {
      if (r.name) seenCompanyKeys.add(r.name.trim());
    }

    for (const line of compLines) {
      if (!line.trim()) continue;
      const cols = parseCSVLine(line);
      const name = (cols[0] || cols[1] || "").replace(/^,/, "").trim();
      const contact = (cols[1] || "").trim();
      const mobile = (cols[2] || "").trim();
      const mobile2 = (cols[3] || "").trim();
      const email = (cols[4] || "").trim();
      const address = (cols[7] || "").trim();
      const pincode = (cols[10] || "").trim();
      const website = (cols[11] || "").trim();
      const category = (cols[12] || "").trim();

      if (!name || name.length < 2) continue;
      const key = name.toLowerCase();
      if (seenCompanyKeys.has(key)) continue;
      seenCompanyKeys.add(key);

      let domain = "";
      if (website && website.startsWith("http")) {
        try { domain = new URL(website).hostname.replace(/^www\./, ""); } catch (e) {}
      }

      const phonesArr = [mobile, mobile2].filter(p => p && p.length > 5);
      const emailsArr = email && email.includes("@") ? [email] : [];

      newCompanies.push({
        business_name: name,
        website: website || null,
        domain: domain || null,
        address: address || "Bhubaneswar, Odisha",
        city: "Bhubaneswar",
        state: "Odisha",
        pincode: pincode || "751001",
        phone: mobile || null,
        industry: category || "Business Services",
        emails: emailsArr.length ? `{${emailsArr.join(",")}}` : null,
        phones: phonesArr.length ? `{${phonesArr.join(",")}}` : null,
        geo_source: "csv_v2_import"
      });
    }

    // Insert companies in bulk
    console.log(`   Inserting ${newCompanies.length} new Bhubaneswar companies into DB...`);
    let insertedComp = 0;
    for (let i = 0; i < newCompanies.length; i += 100) {
      const chunk = newCompanies.slice(i, i + 100);
      const values = [];
      const valueClauses = [];
      let pIdx = 1;

      for (const c of chunk) {
        valueClauses.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW())`);
        values.push(
          c.business_name, c.website, c.domain, c.address, c.city, c.state,
          c.pincode, c.phone, c.industry, c.emails, c.phones, c.geo_source
        );
      }

      const res = await client.query(`
        INSERT INTO final.companies (
          business_name, website, domain, address, city, state,
          pincode, phone, industry, emails, phones, geo_source, created_at
        ) VALUES ${valueClauses.join(", ")}
        ON CONFLICT DO NOTHING;
      `, values);
      insertedComp += res.rowCount;
    }
    console.log(`   ✅ Inserted ${insertedComp} new companies.`);

    // 3. Extract Bhubaneswar people from people_v2.csv using grep
    console.log("\n👥 3. Fast extracting Bhubaneswar people records from CSVs...");
    const peopleV2Path = "/Volumes/akshat/LeadGenerator/final_data/people_v2.csv";
    const peopleLines = execSync(`grep -i "bhubaneswar" "${peopleV2Path}"`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }).split("\n");

    const newPeople = [];
    const seenPeopleKeys = new Set();

    const dbPeopleRes = await client.query(`SELECT LOWER(full_name) as name FROM final.people WHERE city ILIKE '%bhubaneswar%'`);
    for (const r of dbPeopleRes.rows) {
      if (r.name) seenPeopleKeys.add(r.name.trim());
    }

    for (const line of peopleLines) {
      if (!line.trim()) continue;
      const cols = parseCSVLine(line);
      const name = (cols[0] || "").replace(/^,/, "").trim();
      const mobile = (cols[1] || "").trim();
      const mobile2 = (cols[2] || "").trim();
      const email = (cols[3] || "").trim();
      const pincode = (cols[9] || "").trim();
      const category = (cols[10] || "").trim();
      const jobTitle = (cols[13] || "").trim();
      const linkedinUrl = (cols[14] || "").trim();

      if (!name || name.length < 2) continue;
      const key = `${name.toLowerCase()}|${email.toLowerCase()}`;
      if (seenPeopleKeys.has(key)) continue;
      seenPeopleKeys.add(key);

      const nameParts = name.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const phonesArr = [mobile, mobile2].filter(p => p && p.length > 5);
      const emailsArr = email && email.includes("@") ? [email] : [];

      newPeople.push({
        full_name: name,
        first_name: firstName,
        last_name: lastName,
        job_title: jobTitle || category || "Executive / Founder",
        linked_url: linkedinUrl || null,
        location: "Bhubaneswar, Odisha",
        city: "Bhubaneswar",
        state: "Odisha",
        pincode: pincode || "751001",
        emails: emailsArr.length ? `{${emailsArr.join(",")}}` : null,
        phones: phonesArr.length ? `{${phonesArr.join(",")}}` : null,
        geo_source: "csv_people_v2_import"
      });
    }

    console.log(`   Inserting ${newPeople.length} new Bhubaneswar people into DB...`);
    let insertedPeople = 0;
    for (let i = 0; i < newPeople.length; i += 100) {
      const chunk = newPeople.slice(i, i + 100);
      const values = [];
      const valueClauses = [];
      let pIdx = 1;

      for (const p of chunk) {
        valueClauses.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW())`);
        values.push(
          p.full_name, p.first_name, p.last_name, p.job_title, p.linked_url,
          p.location, p.city, p.state, p.pincode, p.emails, p.phones, p.geo_source
        );
      }

      const res = await client.query(`
        INSERT INTO final.people (
          full_name, first_name, last_name, job_title, linked_url,
          location, city, state, pincode, emails, phones, geo_source, created_at
        ) VALUES ${valueClauses.join(", ")}
        ON CONFLICT DO NOTHING;
      `, values);
      insertedPeople += res.rowCount;
    }
    console.log(`   ✅ Inserted ${insertedPeople} new people.`);

    // 4. Verify Final Counts in DB
    const finalCompCount = await client.query(`SELECT COUNT(*) FROM final.companies WHERE city ILIKE '%bhubaneswar%' OR address ILIKE '%bhubaneswar%'`);
    const finalPeopleCount = await client.query(`SELECT COUNT(*) FROM final.people WHERE city ILIKE '%bhubaneswar%' OR location ILIKE '%bhubaneswar%'`);
    const countComp = parseInt(finalCompCount.rows[0].count, 10);
    const countPeople = parseInt(finalPeopleCount.rows[0].count, 10);

    console.log("\n📊 4. FINAL VERIFIED DATABASE COUNTS FOR BHUBANESWAR:");
    console.log(`   Total Companies in DB: ${countComp}`);
    console.log(`   Total People in DB:    ${countPeople}`);

    // 5. Update cities.json
    console.log("\n🌆 5. Updating frontend/src/cities.json with exact count...");
    const citiesPath = path.resolve(__dirname, "../frontend/src/cities.json");
    if (fs.existsSync(citiesPath)) {
      const citiesData = JSON.parse(fs.readFileSync(citiesPath, "utf-8"));
      if (citiesData.india && Array.isArray(citiesData.india)) {
        let found = false;
        for (const hub of citiesData.india) {
          if (hub.name.toLowerCase() === "bhubaneswar") {
            hub.count = countComp;
            found = true;
          }
        }
        if (!found) {
          citiesData.india.push({ name: "Bhubaneswar", state: "Odisha", count: countComp });
        }
        fs.writeFileSync(citiesPath, JSON.stringify(citiesData, null, 2));
        console.log(`   ✅ Updated Bhubaneswar count to ${countComp} in ${citiesPath}`);
      }
    }

  } finally {
    client.release();
    pool.end();
  }
}

run().catch(err => {
  console.error("❌ Error running fast import:", err);
  process.exit(1);
});
