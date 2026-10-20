"use strict";

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const US_STATES = [
  "CA", "NY", "TX", "FL", "IL", "PA", "OH", "GA", "NC", "MI",
  "NJ", "VA", "WA", "AZ", "MA", "TN", "IN", "MO", "MD", "WI",
  "CO", "MN", "SC", "AL", "LA", "KY", "OR", "OK", "CT", "UT",
  "IA", "NV", "AR", "MS", "KS", "NM", "NE", "ID", "WV", "HI",
  "NH", "ME", "MT", "RI", "DE", "SD", "ND", "AK", "VT", "WY", "DC"
];

// Negative filters to strictly exclude staff, faculty, campus administrators, executives
const EXCLUDE_REGEX = /(director|dean|pastor|coordinator|specialist|manager|administrator|admin|counselor|counsellor|officer|advisor|adviser|technician|nurse|teacher|professor|faculty|lecturer|instructor|account|billing|finance|loan|superintendent|principal|chaplain|vice chancellor|chancellor|vice president|vp|coo|ceo|president of|librarian|mentor|recruiter|safety|supervisor)/i;

// Positive indicators for degree-seeking students
const INCLUDE_REGEX = /(graduate student|ph\.?d\.? candidate|ph\.?d\.? student|doctoral candidate|doctoral student|doctoral researcher|undergraduate|master'?s student|master student|mba candidate|mba student|law student|medical student|college student|university student|student intern|student researcher|student engineer|student assistant|graduate research assistant|graduate teaching assistant|graduate assistant|co-op.*student|co-operations student|student employee|\bstudent\b)/i;

function cleanString(val) {
  if (!val) return "";
  let str = String(val).replace(/[{}"']/g, "").trim();
  return str.split(",")[0].trim();
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).trim().replace(/"/g, '""');
  return `"${str}"`;
}

function detectDegreeLevel(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("phd") || t.includes("ph.d") || t.includes("doctoral")) return "PhD / Doctoral Candidate";
  if (t.includes("graduate research") || t.includes("graduate teaching") || t.includes("graduate assistant")) return "Graduate Assistant / Researcher";
  if (t.includes("graduate student") || t.includes("master") || t.includes("mba")) return "Graduate / Master's Student";
  if (t.includes("undergraduate") || t.includes("college student")) return "Undergraduate Student";
  if (t.includes("intern")) return "Student Intern";
  if (t.includes("law")) return "Law Student";
  if (t.includes("medical")) return "Medical Student";
  return "College / University Student";
}

async function export50Students() {
  const client = await pool.connect();
  try {
    console.log("⚡ Fetching USA college/university degree students from database...");
    await client.query("SET statement_timeout = 60000;");

    const query = `
      SELECT 
        uuid,
        company_uuid,
        full_name,
        first_name,
        last_name,
        job_title,
        city,
        state,
        location,
        emails,
        phones,
        linked_url
      FROM final.people
      WHERE state = ANY($1::text[])
        AND job_title ILIKE '%student%'
        AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
      LIMIT 1000;
    `;

    const res = await client.query(query, [US_STATES]);
    console.log(`Fetched ${res.rows.length} candidates with emails.`);

    // Strict filtering
    const validStudents = [];
    for (const row of res.rows) {
      if (!row.job_title) continue;
      const title = row.job_title.trim();
      if (EXCLUDE_REGEX.test(title)) continue;
      if (!INCLUDE_REGEX.test(title)) continue;
      
      const email = cleanString(row.emails);
      if (!email || !email.includes("@")) continue;

      validStudents.push(row);
      if (validStudents.length === 50) break;
    }

    console.log(`Selected exactly ${validStudents.length} verified degree-seeking student profiles.`);

    // Enrich with company / university info
    const compUuids = [...new Set(
      validStudents
        .map(r => r.company_uuid)
        .filter(id => id && id.trim().length > 0 && id !== "{}")
    )];

    const companyMap = {};
    if (compUuids.length > 0) {
      const compRes = await client.query(
        `SELECT uuid, business_name, website, industry FROM final.companies WHERE uuid = ANY($1::uuid[])`,
        [compUuids]
      );
      for (const c of compRes.rows) {
        companyMap[c.uuid] = c;
      }
    }

    // Build CSV
    const headers = [
      "Full Name",
      "First Name",
      "Last Name",
      "Degree / Student Title",
      "Academic Level",
      "University / Organization",
      "Industry",
      "City",
      "State",
      "Country",
      "Primary Email",
      "Phone Number",
      "LinkedIn Profile",
      "Website"
    ];

    const csvRows = [headers.map(h => `"${h}"`).join(",")];

    for (const r of validStudents) {
      const comp = companyMap[r.company_uuid] || {};
      const email = cleanString(r.emails);
      const phone = cleanString(r.phones);
      const linkedin = cleanString(r.linked_url);
      const website = comp.website ? comp.website.trim() : "";
      const academicLevel = detectDegreeLevel(r.job_title);

      csvRows.push([
        escapeCsv(r.full_name),
        escapeCsv(r.first_name),
        escapeCsv(r.last_name),
        escapeCsv(r.job_title),
        escapeCsv(academicLevel),
        escapeCsv(comp.business_name || "Higher Education / Research"),
        escapeCsv(comp.industry || "Education / Research"),
        escapeCsv(r.city),
        escapeCsv(r.state),
        escapeCsv("USA"),
        escapeCsv(email),
        escapeCsv(phone),
        escapeCsv(linkedin),
        escapeCsv(website)
      ].join(","));
    }

    const outputPath = path.join(__dirname, "../USA_Students_50_Sample.csv");
    fs.writeFileSync(outputPath, csvRows.join("\n"), "utf8");

    console.log(`✅ Successfully saved 50 USA student records to: ${outputPath}`);

  } catch (err) {
    console.error("Export Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

export50Students();
