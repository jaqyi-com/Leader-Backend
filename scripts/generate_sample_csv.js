#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function cleanEmail(raw) {
  if (!raw || raw === '{}' || raw === '') return '';
  return raw.replace(/^\{/, '').replace(/\}$/, '').split(',')[0].trim().replace(/"/g,'');
}
function cleanPhone(raw, fallback) {
  if (raw && raw.trim() !== '') return raw.trim();
  if (fallback && fallback !== '{}' && fallback !== '') {
    return fallback.replace(/^\{/, '').replace(/\}$/, '').split(',')[0].trim().replace(/"/g,'');
  }
  return '';
}
function esc(val) {
  if (val === null || val === undefined) return '';
  return `"${String(val).replace(/"/g, '""')}"`;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Neon DB...");

    // ── Step 1: Check what India/Indore data looks like ───────
    console.log("\n🔍 Checking available states/cities in DB...");
    const stateCheck = await client.query(`
      SELECT state, COUNT(*) as cnt 
      FROM final.companies 
      WHERE state ILIKE '%madhya%' OR state ILIKE '%indore%' OR city ILIKE '%indore%'
      GROUP BY state ORDER BY cnt DESC LIMIT 10;
    `);
    console.log("States with Indore/MP data:", stateCheck.rows);

    const cityCheck = await client.query(`
      SELECT city, state, COUNT(*) as cnt 
      FROM final.companies 
      WHERE city ILIKE '%indore%'
      GROUP BY city, state ORDER BY cnt DESC LIMIT 10;
    `);
    console.log("City=Indore records:", cityCheck.rows);

    // ── Step 2: Try people table for Indore software decision makers ──
    console.log("\n🔍 Searching people table for Indore / MP contacts...");
    const peopleResult = await client.query(`
      SELECT 
        full_name,
        first_name,
        last_name,
        job_title,
        city,
        state,
        emails,
        phones,
        linked_url,
        location
      FROM final.people
      WHERE 
        (
          city ILIKE '%indore%'
          OR state ILIKE '%madhya pradesh%'
          OR state ILIKE '%MP%'
          OR location ILIKE '%indore%'
        )
        AND (
          job_title ILIKE '%CEO%' OR job_title ILIKE '%founder%'
          OR job_title ILIKE '%owner%' OR job_title ILIKE '%director%'
          OR job_title ILIKE '%CTO%' OR job_title ILIKE '%president%'
          OR job_title ILIKE '%manager%' OR job_title ILIKE '%head%'
        )
        AND (
          (emails IS NOT NULL AND emails <> '' AND emails <> '{}')
          OR (phones IS NOT NULL AND phones <> '' AND phones <> '{}')
        )
      LIMIT 100;
    `);
    console.log(`✅ Found ${peopleResult.rows.length} decision-maker contacts in Indore/MP`);

    // ── Step 3: Software companies — India broader search ──────
    console.log("\n🔍 Searching companies for software/IT in India...");
    const compResult = await client.query(`
      SELECT 
        business_name,
        industry,
        city,
        state,
        phone,
        phones,
        emails,
        website,
        address
      FROM final.companies
      WHERE 
        (
          city ILIKE '%indore%'
          OR state ILIKE '%madhya pradesh%'
          OR state ILIKE '%Maharashtra%'
          OR state ILIKE '%Karnataka%'
          OR state ILIKE '%Delhi%'
        )
        AND (
          industry ILIKE '%software%'
          OR industry ILIKE '%IT%'
          OR industry ILIKE '%tech%'
          OR industry ILIKE '%computer%'
          OR industry ILIKE '%digital%'
          OR industry ILIKE '%web%'
        )
        AND business_name IS NOT NULL AND business_name <> ''
      LIMIT 100;
    `);
    console.log(`✅ Found ${compResult.rows.length} software/IT companies`);

    // ── Step 4: Build combined CSV ──────────────────────────────
    const headers = [
      'S.No','Type','Full Name / Company Name','Job Title / Industry',
      'City','State','Email Address','Phone Number','Website / LinkedIn','Location / Address'
    ];

    const rows = [];
    let sno = 1;

    // Add decision makers from people table
    for (const r of peopleResult.rows) {
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.full_name || '';
      rows.push([
        sno++,
        esc('Decision Maker'),
        esc(name),
        esc(r.job_title),
        esc(r.city),
        esc(r.state || r.location),
        esc(cleanEmail(r.emails)),
        esc(cleanPhone('', r.phones)),
        esc(r.linked_url),
        esc(r.location)
      ].join(','));
    }

    // Add companies
    for (const r of compResult.rows) {
      rows.push([
        sno++,
        esc('Company'),
        esc(r.business_name),
        esc(r.industry),
        esc(r.city),
        esc(r.state),
        esc(cleanEmail(r.emails)),
        esc(cleanPhone(r.phone, r.phones)),
        esc(r.website),
        esc(r.address)
      ].join(','));
    }

    if (rows.length === 0) {
      console.log("\n⚠️  No records found in DB matching Indore/MP + Software criteria.");
      console.log("Generating a broader India Software sample instead...");

      // Broadest fallback — any India state software
      const fallback = await client.query(`
        SELECT 
          business_name, industry, city, state, phone, phones, emails, website, address
        FROM final.companies
        WHERE 
          (
            state IN ('Maharashtra','Karnataka','Delhi','Tamil Nadu','Gujarat','Andhra Pradesh')
            OR state ILIKE '%india%'
          )
          AND (
            industry ILIKE '%software%' OR industry ILIKE '%IT%' OR industry ILIKE '%tech%'
          )
          AND business_name IS NOT NULL AND business_name <> ''
          AND (
            (emails IS NOT NULL AND emails <> '' AND emails <> '{}')
            OR (phone IS NOT NULL AND phone <> '')
          )
        LIMIT 100;
      `);

      for (const r of fallback.rows) {
        rows.push([
          sno++,
          esc('Company'),
          esc(r.business_name),
          esc(r.industry),
          esc(r.city),
          esc(r.state),
          esc(cleanEmail(r.emails)),
          esc(cleanPhone(r.phone, r.phones)),
          esc(r.website),
          esc(r.address)
        ].join(','));
      }
      console.log(`✅ Fallback found ${fallback.rows.length} records`);
    }

    const csv = [headers.join(','), ...rows].join('\n');
    const outPath = path.resolve(__dirname, '../sample_software_indore.csv');
    fs.writeFileSync(outPath, csv, 'utf8');

    console.log(`\n🎉 CSV saved to: ${outPath}`);
    console.log(`📊 Total Records in CSV: ${rows.length}`);
    console.log(`   👔 Decision Makers: ${peopleResult.rows.length}`);
    console.log(`   🏢 Companies: ${compResult.rows.length}`);

    // Quick preview
    console.log('\n--- PREVIEW (first 5 rows) ---');
    rows.slice(0, 5).forEach(r => console.log(r));

  } catch(err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
