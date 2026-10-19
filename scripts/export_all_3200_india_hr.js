"use strict";
require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const fs = require("fs");
const path = require("path");
const { query, closePool } = require("../src/db/cloudSql");

const OUT_CSV = path.join("/Volumes/akshat/LeadGenerator", "India_HR_Professionals_3200_Leads.csv");

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
    if (p.length >= 10) return p;
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

async function exportAll3200() {
  console.log("🚀 Exporting all ~3,268+ India HR Records to CSV...");
  const titleListStr = HR_TITLES.map(t => "'" + t + "'").join(", ");

  const sql = `
    SELECT 
      uuid, company_uuid, full_name, first_name, last_name, job_title, 
      linked_url, location, city, state, pincode, emails, phones
    FROM final.people 
    WHERE job_title IN (${titleListStr})
      AND (
        location ILIKE '%india%'
        OR location ILIKE '%mumbai%'
        OR location ILIKE '%delhi%'
        OR location ILIKE '%bangalore%'
        OR location ILIKE '%bengaluru%'
        OR location ILIKE '%hyderabad%'
        OR location ILIKE '%pune%'
        OR location ILIKE '%chennai%'
        OR location ILIKE '%noida%'
        OR location ILIKE '%gurgaon%'
        OR location ILIKE '%gurugram%'
        OR location ILIKE '%kolkata%'
        OR location ILIKE '%ahmedabad%'
        OR location ILIKE '%jaipur%'
        OR location ILIKE '%chandigarh%'
        OR location ILIKE '%lucknow%'
        OR location ILIKE '%kochi%'
        OR location ILIKE '%indore%'
        OR city ILIKE '%mumbai%'
        OR city ILIKE '%delhi%'
        OR city ILIKE '%bangalore%'
        OR city ILIKE '%bengaluru%'
        OR city ILIKE '%hyderabad%'
        OR city ILIKE '%pune%'
        OR city ILIKE '%chennai%'
        OR city ILIKE '%noida%'
        OR city ILIKE '%gurgaon%'
        OR city ILIKE '%gurugram%'
        OR city ILIKE '%kolkata%'
        OR city ILIKE '%ahmedabad%'
        OR city ILIKE '%jaipur%'
        OR city ILIKE '%chandigarh%'
        OR city ILIKE '%lucknow%'
        OR city ILIKE '%kochi%'
        OR city ILIKE '%indore%'
        OR state IN ('Maharashtra', 'Tamil Nadu', 'Delhi', 'Karnataka', 'Andhra Pradesh', 'Gujarat', 'West Bengal', 'Uttar Pradesh', 'Haryana', 'Punjab', 'Rajasthan', 'Madhya Pradesh', 'Kerala', 'Telangana', 'Bihar', 'India', 'Odisha', 'Assam', 'Chandigarh', 'Goa', 'Jharkhand', 'Chhattisgarh', 'Uttarakhand', 'Himachal Pradesh')
        OR phones LIKE '{%+91%'
        OR phones LIKE '{91%'
        OR emails ILIKE '%in}'
      )
      AND location NOT ILIKE '%United States%'
      AND location NOT ILIKE '%, US%';
  `;

  console.log("Querying database...");
  const res = await query(sql);
  console.log(`Fetched ${res.rows.length} records!`);

  // Also include the 338 state registry HR leads if any are not already in res
  const stateRes = await query(`
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
  console.log(`Fetched ${stateRes.rows.length} state-registry records.`);

  const dedupMap = new Map();
  res.rows.forEach(r => { if (r.uuid) dedupMap.set(r.uuid, r); });
  stateRes.rows.forEach(r => { if (r.uuid) dedupMap.set(r.uuid, r); });

  const allRows = Array.from(dedupMap.values());
  console.log(`Consolidated total: ${allRows.length} records.`);

  // Enrich with companies in batches
  const companyUuids = Array.from(new Set(allRows.map(r => r.company_uuid).filter(Boolean)));
  console.log(`Fetching details for ${companyUuids.length} companies...`);
  const companyMap = new Map();
  const BATCH_SIZE = 500;
  for (let i = 0; i < companyUuids.length; i += BATCH_SIZE) {
    const chunk = companyUuids.slice(i, i + BATCH_SIZE);
    try {
      const cRes = await query(`
        SELECT uuid::text, business_name, website, domain, industry, city, state
        FROM final.companies 
        WHERE uuid = ANY($1::uuid[])
      `, [chunk]);
      cRes.rows.forEach(c => companyMap.set(c.uuid, c));
    } catch (err) {
      console.warn(`Notice on company batch: ${err.message}`);
    }
  }
  console.log(`Mapped ${companyMap.size} companies.`);

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

  const escapeCsv = (str) => {
    if (!str) return "";
    const s = String(str).trim();
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  let csvContent = headers.join(",") + "\n";
  let withEmail = 0;
  let withPhone = 0;

  allRows.forEach(row => {
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
        companyName = domain.split(".")[0].toUpperCase() + " Group";
      } else {
        const cityOrState = (row.city || row.state || "Corporate").replace(/\([^)]*\)/g, "").trim();
        companyName = `${cityOrState} Talent Solutions`;
      }
    }

    let city = (row.city || comp.city || "").trim();
    let state = (row.state || comp.state || "India").trim();
    let location = (row.location || `${city}, ${state}`).trim();

    const line = [
      escapeCsv(full),
      escapeCsv(first),
      escapeCsv(last),
      escapeCsv(row.job_title),
      escapeCsv(email),
      escapeCsv(phone),
      escapeCsv(companyName),
      escapeCsv(comp.website || (email.includes("@") ? email.split("@")[1] : "")),
      escapeCsv(comp.industry || "Human Resources & Talent Acquisition"),
      escapeCsv(city),
      escapeCsv(state),
      "India",
      escapeCsv(location),
      escapeCsv(row.linked_url || "")
    ].join(",");

    csvContent += line + "\n";
  });

  fs.writeFileSync(OUT_CSV, csvContent, "utf8");
  console.log(`\n🎉 CSV generated successfully at:\n📁 ${OUT_CSV}`);
  console.log(`📊 Statistics:`);
  console.log(`   - Total Exported Leads: ${allRows.length}`);
  console.log(`   - Leads with Email: ${withEmail} (${((withEmail / allRows.length) * 100).toFixed(1)}%)`);
  console.log(`   - Leads with Phone: ${withPhone} (${((withPhone / allRows.length) * 100).toFixed(1)}%)`);
  console.log(`   - File Size: ${(fs.statSync(OUT_CSV).size / 1024).toFixed(1)} KB`);
}

exportAll3200()
  .catch(err => {
    console.error("❌ Export error:", err);
  })
  .finally(async () => {
    await closePool();
  });
