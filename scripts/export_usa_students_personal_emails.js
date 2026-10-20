"use strict";

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const EXCLUDE_REGEX = /(director|dean|pastor|manager|administrator|admin|counselor|counsellor|officer|advisor|adviser|technician|nurse supervisor|teacher|professor|faculty|lecturer|instructor|accountant|auditor|internal audit|billing|finance officer|superintendent|principal|vice president|vp|coo|ceo|president of|librarian|safety manager|supervisor)/i;

const INCLUDE_REGEX = /(student|undergraduate|graduate student|graduate research|graduate assistant|doctoral|ph\.?d|intern|summer intern|student intern|student researcher|student assistant|research assistant|teaching assistant|fellow)/i;

const PERSONAL_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", 
  "aol.com", "icloud.com", "msn.com", "comcast.net", 
  "att.net", "sbcglobal.net", "live.com", "me.com"
];

function extractPersonalEmail(rawEmails) {
  if (!rawEmails) return null;
  let str = String(rawEmails).replace(/[{}"']/g, "");
  const list = str.split(",").map(e => e.trim().toLowerCase());
  for (const email of list) {
    for (const domain of PERSONAL_DOMAINS) {
      if (email.endsWith("@" + domain)) {
        return email;
      }
    }
  }
  return null;
}

function extractAllPersonalEmails(rawEmails) {
  if (!rawEmails) return [];
  let str = String(rawEmails).replace(/[{}"']/g, "");
  const list = str.split(",").map(e => e.trim());
  const matched = [];
  for (const email of list) {
    const low = email.toLowerCase();
    for (const domain of PERSONAL_DOMAINS) {
      if (low.endsWith("@" + domain)) {
        matched.push(email);
        break;
      }
    }
  }
  return [...new Set(matched)];
}

function cleanPhone(raw) {
  if (!raw) return "";
  let str = String(raw).replace(/[{}"']/g, "");
  return str.split(",")[0].trim();
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).trim().replace(/"/g, '""');
  return `"${str}"`;
}

async function run() {
  const client = await pool.connect();
  try {
    console.log("⚡ Fetching USA Students with personal emails...");
    await client.query("SET statement_timeout = 60000;");

    const ranges = [
      ['Student', 'Studentz'],
      ['Graduate Student', 'Graduate Studentz'],
      ['Graduate Research', 'Graduate Researchz'],
      ['Graduate Assistant', 'Graduate Assistantz'],
      ['Undergraduate', 'Undergraduatez'],
      ['Doctoral', 'Doctoralz'],
      ['Ph.D', 'Ph.Dz'],
      ['PhD', 'PhDz'],
      ['Medical Student', 'Medical Studentz'],
      ['Law Student', 'Law Studentz'],
      ['Intern', 'Internz'],
      ['Summer Intern', 'Summer Internz'],
      ['Research Assistant', 'Research Assistantz'],
      ['Teaching Assistant', 'Teaching Assistantz']
    ];

    let allPeople = [];
    for (const [min, max] of ranges) {
      const res = await client.query(`
        SELECT 
          uuid, company_uuid, full_name, first_name, last_name, job_title,
          city, state, location, emails, phones, linked_url
        FROM final.people
        WHERE job_title >= $1 AND job_title < $2
          AND (
            emails ILIKE '%@gmail.com%'
            OR emails ILIKE '%@yahoo.com%'
            OR emails ILIKE '%@hotmail.com%'
            OR emails ILIKE '%@outlook.com%'
            OR emails ILIKE '%@aol.com%'
            OR emails ILIKE '%@icloud.com%'
            OR emails ILIKE '%@comcast.net%'
            OR emails ILIKE '%@msn.com%'
          )
        LIMIT 100;
      `, [min, max]);
      allPeople.push(...res.rows);
    }

    // Deduplicate
    const seenUuids = new Set();
    const unique = [];
    for (const p of allPeople) {
      if (!seenUuids.has(p.uuid)) {
        seenUuids.add(p.uuid);
        unique.push(p);
      }
    }

    const US_STATES = new Set([
      'CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI',
      'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI',
      'CO', 'MN', 'SC', 'AL', 'LA', 'KY', 'OR', 'OK', 'CT', 'UT',
      'IA', 'NV', 'AR', 'MS', 'KS', 'NM', 'NE', 'ID', 'WV', 'HI',
      'NH', 'ME', 'MT', 'RI', 'DE', 'SD', 'ND', 'AK', 'VT', 'WY', 'DC'
    ]);

    // Filter strictly for USA location, valid student titles, and personal emails
    const qualifiedStudents = [];
    for (const r of unique) {
      if (!r.job_title) continue;
      const title = r.job_title.trim();
      if (EXCLUDE_REGEX.test(title)) continue;
      if (!INCLUDE_REGEX.test(title)) continue;

      const loc = ((r.location || "") + " " + (r.state || "") + " " + (r.city || "")).trim();
      const isUsa = /united states|usa/i.test(loc) || 
                    (r.state && US_STATES.has(r.state.trim())) ||
                    [...US_STATES].some(st => loc.includes(', ' + st));
      if (!isUsa) continue;

      const personalEmail = extractPersonalEmail(r.emails);
      if (!personalEmail) continue;

      qualifiedStudents.push({
        ...r,
        primary_personal_email: personalEmail,
        all_personal_emails: extractAllPersonalEmails(r.emails).join("; ")
      });

      if (qualifiedStudents.length === 50) break;
    }

    console.log(`✅ Selected exactly ${qualifiedStudents.length} USA degree-seeking students with personal emails.`);

    // Enrich with company / institution name
    const compUuids = [...new Set(
      qualifiedStudents
        .map(s => s.company_uuid)
        .filter(id => id && id.length > 10 && id !== "{}")
    )];

    const companyMap = {};
    if (compUuids.length > 0) {
      const compRes = await client.query(
        `SELECT uuid, business_name, website, industry FROM final.companies WHERE uuid = ANY($1::uuid[])`,
        [compUuids]
      );
      compRes.rows.forEach(c => {
        companyMap[c.uuid] = c;
      });
    }

    const finalRecords = qualifiedStudents.map(s => {
      const comp = companyMap[s.company_uuid] || {};
      return {
        ...s,
        institution_or_org: comp.business_name || "",
        website: comp.website || "",
        industry: comp.industry || ""
      };
    });

    // Write CSV
    const headers = [
      "Full Name",
      "First Name",
      "Last Name",
      "Student / Degree Title",
      "Institution / Organization",
      "City",
      "State",
      "Location",
      "Country",
      "Personal Email (Gmail/Hotmail/etc)",
      "All Personal Emails",
      "Phone Number",
      "LinkedIn Profile",
      "Website"
    ];

    let csv = headers.map(h => escapeCsv(h)).join(",") + "\n";
    for (const r of finalRecords) {
      csv += [
        escapeCsv(r.full_name),
        escapeCsv(r.first_name),
        escapeCsv(r.last_name),
        escapeCsv(r.job_title),
        escapeCsv(r.institution_or_org),
        escapeCsv(r.city),
        escapeCsv(r.state),
        escapeCsv(r.location),
        escapeCsv("USA"),
        escapeCsv(r.primary_personal_email),
        escapeCsv(r.all_personal_emails),
        escapeCsv(cleanPhone(r.phones)),
        escapeCsv(r.linked_url),
        escapeCsv(r.website)
      ].join(",") + "\n";
    }

    const outDir = path.join("/Volumes/akshat/LeadGenerator", "exports");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "USA_Students_50_Personal_Emails.csv");
    fs.writeFileSync(outPath, csv, "utf8");

    console.log(`📁 File successfully exported to: ${outPath}`);

  } catch(e) {
    console.error("Execution error:", e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
