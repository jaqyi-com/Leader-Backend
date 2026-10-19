"use strict";
require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const fs = require("fs");
const path = require("path");
const { getPool, closePool } = require("../src/db/cloudSql");

const OUT_CSV = path.join("/Volumes/akshat/LeadGenerator", "Global_HR_Profiles_125K.csv");

const HR_TITLES = [
  "Human Resources Executive",
  "Director of Human Resources",
  "Manager of Human Resources",
  "Human Resources Manager",
  "Human Resources",
  "Recruiter",
  "Senior Recruiter",
  "Corporate Recruiter",
  "Technical Recruiter",
  "IT Recruiter",
  "Senior IT Recruiter",
  "Senior Technical Recruiter",
  "Talent Acquisition Specialist",
  "Talent Acquisition Manager",
  "Talent Acquisition Executive",
  "Talent Acquisition Lead",
  "Talent Acquisition Partner",
  "Talent Acquisition Consultant",
  "Talent Partner",
  "Talent Sourcer",
  "Human Resources Generalist",
  "Human Resources Director",
  "Human Resources Coordinator",
  "Human Resources Specialist",
  "Human Resources Officer",
  "Human Resources Consultant",
  "Human Resources Associate",
  "Human Resources Assistant",
  "Human Resources Administrator",
  "VP of Human Resources",
  "Vice President Human Resources",
  "Vice President - Human Resources",
  "Head of Human Resources",
  "Head - Human Resources",
  "Head HR",
  "Head - HR",
  "Chief Human Resources Officer",
  "Recruitment Consultant",
  "Recruitment Specialist",
  "Recruitment Manager",
  "Recruitment Executive",
  "Recruitment Lead",
  "Recruitment Officer",
  "Recruitment Coordinator",
  "Recruitment",
  "HR Recruiter",
  "HR Executive",
  "Senior HR Executive",
  "Sr. HR Executive",
  "HR Manager",
  "Senior HR Manager",
  "Sr. HR Manager",
  "Assistant Manager - HR",
  "Deputy Manager - HR",
  "Manager - HR",
  "Senior Manager - HR",
  "HR Generalist",
  "HR Business Partner",
  "HRBP",
  "HR Consultant",
  "HR Officer",
  "HR Associate",
  "HR Assistant",
  "HR Coordinator",
  "HR Specialist",
  "HR Lead",
  "HR Head",
  "HR Trainee",
  "HR Operations",
  "HR & Admin",
  "HR and Admin",
  "HR EXECUTIVE/RECRUITER",
  "Junior Talent Acquisition Consultant",
  "Recruitment/Placement Agencies",
  "People Operations Manager",
  "People Operations Specialist"
];

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY",
  "LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND",
  "OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
]);

const INDIAN_CITIES = new Set([
  "bangalore", "bengaluru", "mumbai", "delhi", "new delhi", "hyderabad", "pune", "chennai",
  "gurgaon", "gurugram", "noida", "kolkata", "ahmedabad", "jaipur", "chandigarh", "lucknow",
  "kochi", "cochin", "indore", "bhopal", "patna", "surat", "vadodara", "bhubaneswar",
  "secunderabad", "tirupati", "chittoor", "faridabad", "ghaziabad", "navi mumbai", "nagpur"
]);

function cleanEmail(raw) {
  if (!raw) return "";
  const cleaned = raw.replace(/^\{|\}$/g, "").split(",");
  for (let e of cleaned) {
    e = e.trim().toLowerCase();
    if (e.includes("@") && e.split("@")[1]?.includes(".") && e.length >= 6) {
      return e;
    }
  }
  return "";
}

function cleanPhone(raw) {
  if (!raw) return "";
  const cleaned = raw.replace(/^\{|\}$/g, "").split(",");
  for (let p of cleaned) {
    p = p.trim();
    const digits = p.replace(/[^0-9]/g, "");
    if (digits.startsWith("91") && digits.length === 12) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    } else if (digits.length === 10 && ["6","7","8","9"].includes(digits[0])) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    } else if (p.length >= 10) {
      return p;
    }
  }
  return "";
}

function cleanName(rawFull, rawFirst, rawLast, email) {
  let full = (rawFull || "").trim();
  let first = (rawFirst || "").trim();
  let last = (rawLast || "").trim();

  if ((!full || full.toLowerCase() === "none" || full.toLowerCase() === "null") && email && email.includes("@")) {
    const user = email.split("@")[0].replace(/\d+$/, "");
    const parts = user.split(/[\.\-_]/).filter(p => /^[a-zA-Z]{2,}$/.test(p));
    if (parts.length >= 2) {
      first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
      last = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
      full = `${first} ${last}`;
    } else if (parts.length === 1) {
      first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
      full = first;
    }
  }

  if (full && (!first || !last)) {
    const parts = full.split(/\s+/);
    first = first || parts[0] || "";
    last = last || parts.slice(1).join(" ") || "";
  }

  if (full) {
    full = full.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    if (first) first = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    if (last) last = last.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  return { full, first, last };
}

function deriveCountry(city, state, location, phones, emails) {
  const loc = (location || "").toLowerCase();
  const c = (city || "").toLowerCase();
  const s = (state || "").trim();
  const p = (phones || "").trim();
  const e = (emails || "").toLowerCase();

  if (p.includes("+91") || p.startsWith("91") || e.endsWith(".in") || e.endsWith(".co.in") || INDIAN_CITIES.has(c) || INDIAN_CITIES.has(loc) || loc.includes("india") || ["ANDHRA PRADESH", "BIHAR"].includes(s.toUpperCase())) {
    return "India";
  }
  if (p.startsWith("+1") || p.startsWith("{+1") || US_STATES.has(s) || loc.includes("united states") || loc.includes(", us") || loc.includes("usa")) {
    return "United States";
  }
  if (loc.includes("united kingdom") || loc.includes(", uk") || loc.includes("london") || p.startsWith("+44")) {
    return "United Kingdom";
  }
  if (loc.includes("canada") || p.startsWith("+1") && ["ON","BC","QC","AB"].includes(s)) {
    return "Canada";
  }
  if (loc.includes("australia") || p.startsWith("+61")) {
    return "Australia";
  }
  if (s) return s;
  return "Global";
}

async function exportGlobalHR() {
  console.log("🚀 Starting Global HR Dataset Export (~125,000+ Profiles)...");

  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log("⚙️  Setting statement timeout to 5 minutes...");
    await client.query("SET statement_timeout = 300000;");

    console.log("📥 Querying all HR professionals from final.people...");
    const titleListStr = HR_TITLES.map(t => "'" + t + "'").join(", ");

    const sql = `
      SELECT 
        uuid, company_uuid, full_name, first_name, last_name, job_title, 
        linked_url, location, city, state, pincode, emails, phones
      FROM final.people 
      WHERE job_title IN (${titleListStr});
    `;

    console.time("fetch_people");
    const peopleRes = await client.query(sql);
    console.timeEnd("fetch_people");
    console.log(`✅ Retrieved ${peopleRes.rows.length} corporate HR profiles.`);

    // Also fetch the state-indexed HR profiles (e.g. Bihar, Andhra Pradesh compound titles)
    console.log("📥 Querying Indian regional HR profiles...");
    const stateRes = await client.query(`
      SELECT uuid, company_uuid, full_name, first_name, last_name, job_title, 
             linked_url, location, city, state, pincode, emails, phones
      FROM final.people 
      WHERE state IN ('BIHAR', 'ANDHRA PRADESH')
        AND (
          job_title ILIKE '%human resource%' 
          OR job_title ILIKE '%talent acquisition%' 
          OR job_title ILIKE '%hr%'
          OR job_title ILIKE '%recruiter%' 
          OR job_title ILIKE '%recruitment%' 
          OR job_title ILIKE '%staffing%'
        );
    `);
    console.log(`✅ Retrieved ${stateRes.rows.length} regional HR profiles.`);

    // Deduplicate into Map
    const allPeopleMap = new Map();
    peopleRes.rows.forEach(r => { if (r.uuid) allPeopleMap.set(r.uuid, r); });
    stateRes.rows.forEach(r => { if (r.uuid) allPeopleMap.set(r.uuid, r); });

    const totalProfiles = allPeopleMap.size;
    console.log(`🎯 Total Unique Global HR Profiles: ${totalProfiles}`);

    // Collect Company UUIDs
    const companyUuids = Array.from(new Set(Array.from(allPeopleMap.values()).map(r => r.company_uuid).filter(Boolean)));
    console.log(`🏢 Fetching details for ${companyUuids.length} companies...`);

    const companyMap = new Map();
    const BATCH_SIZE = 1000;
    for (let i = 0; i < companyUuids.length; i += BATCH_SIZE) {
      const chunk = companyUuids.slice(i, i + BATCH_SIZE);
      try {
        const cRes = await client.query(`
          SELECT uuid::text, business_name, website, domain, industry, city, state
          FROM final.companies 
          WHERE uuid = ANY($1::uuid[])
        `, [chunk]);
        cRes.rows.forEach(c => companyMap.set(c.uuid, c));
      } catch (err) {
        console.warn(`Notice on company batch ${i}: ${err.message}`);
      }
      if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= companyUuids.length) {
        console.log(`   Mapped ${companyMap.size} / ${companyUuids.length} companies...`);
      }
    }
    console.log(`✅ Successfully mapped ${companyMap.size} companies.`);

    // -------------------------------------------------------------
    // Stream writing to CSV
    // -------------------------------------------------------------
    console.log(`💾 Streaming records to CSV: ${OUT_CSV}...`);
    const writeStream = fs.createWriteStream(OUT_CSV, { encoding: "utf8" });

    const headers = [
      "Full Name",
      "First Name",
      "Last Name",
      "Job Title",
      "Email",
      "Phone Number",
      "Company Name",
      "Company Website",
      "Company Industry",
      "City",
      "State",
      "Country",
      "Location",
      "LinkedIn URL"
    ];

    writeStream.write(headers.join(",") + "\n");

    const escapeCsv = (str) => {
      if (!str) return "";
      const s = String(str).trim();
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    let writtenCount = 0;
    let withEmail = 0;
    let withPhone = 0;

    for (const row of allPeopleMap.values()) {
      const email = cleanEmail(row.emails);
      const phone = cleanPhone(row.phones);
      const { full, first, last } = cleanName(row.full_name, row.first_name, row.last_name, email);
      const comp = companyMap.get(row.company_uuid) || {};

      if (email) withEmail++;
      if (phone) withPhone++;

      let companyName = comp.business_name || "";
      if (!companyName && email && email.includes("@")) {
        const domain = email.split("@")[1].toLowerCase();
        if (!["gmail.com", "yahoo.com", "yahoo.co.in", "hotmail.com", "outlook.com", "rediffmail.com", "zoho.com"].includes(domain)) {
          companyName = domain.split(".")[0].toUpperCase() + " Inc";
        }
      }

      const city = (row.city || comp.city || "").trim();
      const state = (row.state || comp.state || "").trim();
      const location = (row.location || `${city}, ${state}`).trim();
      const country = deriveCountry(city, state, location, row.phones, row.emails);

      const line = [
        escapeCsv(full),
        escapeCsv(first),
        escapeCsv(last),
        escapeCsv(row.job_title),
        escapeCsv(email),
        escapeCsv(phone),
        escapeCsv(companyName),
        escapeCsv(comp.website || (email.includes("@") ? email.split("@")[1] : "")),
        escapeCsv(comp.industry || "Human Resources"),
        escapeCsv(city),
        escapeCsv(state),
        escapeCsv(country),
        escapeCsv(location),
        escapeCsv(row.linked_url || "")
      ].join(",");

      writeStream.write(line + "\n");
      writtenCount++;

      if (writtenCount % 25000 === 0) {
        console.log(`   Written ${writtenCount.toLocaleString()} / ${totalProfiles.toLocaleString()} records...`);
      }
    }

    writeStream.end();

    await new Promise((resolve) => writeStream.on("finish", resolve));

    const stats = fs.statSync(OUT_CSV);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n🎉 Global HR Export Completed Successfully!`);
    console.log(`📁 File Path: ${OUT_CSV}`);
    console.log(`📊 Final Dataset Statistics:`);
    console.log(`   - Total Exported Records: ${writtenCount.toLocaleString()}`);
    console.log(`   - With Clean Email: ${withEmail.toLocaleString()} (${((withEmail / writtenCount) * 100).toFixed(1)}%)`);
    console.log(`   - With Clean Phone: ${withPhone.toLocaleString()} (${((withPhone / writtenCount) * 100).toFixed(1)}%)`);
    console.log(`   - File Size: ${sizeMb} MB`);

  } finally {
    client.release();
    await closePool();
  }
}

exportGlobalHR().catch(err => {
  console.error("❌ Export failure:", err);
  process.exit(1);
});
