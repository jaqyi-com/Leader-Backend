"use strict";

/**
 * scripts/monitor_verification_progress.js
 * 
 * Live Real-Time Email Verification Monitoring Command
 * Run: node scripts/monitor_verification_progress.js
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMonitor() {
  const client = await pool.connect();
  try {
    const peopleStats = await client.query(`
      SELECT 
        COUNT(*) AS verified_count,
        COUNT(*) FILTER (WHERE is_email_valid IS TRUE) AS deliverable,
        COUNT(*) FILTER (WHERE is_email_valid IS FALSE) AS undeliverable,
        COUNT(*) FILTER (WHERE email_status = 'risky') AS risky,
        COUNT(*) FILTER (WHERE email_status = 'unknown') AS unknown
      FROM final.people
      WHERE email_status IS NOT NULL AND email_status <> 'pending';
    `);

    const companyStats = await client.query(`
      SELECT 
        COUNT(*) AS verified_count,
        COUNT(*) FILTER (WHERE is_email_valid IS TRUE) AS deliverable,
        COUNT(*) FILTER (WHERE is_email_valid IS FALSE) AS undeliverable,
        COUNT(*) FILTER (WHERE email_status = 'risky') AS risky,
        COUNT(*) FILTER (WHERE email_status = 'unknown') AS unknown
      FROM final.companies
      WHERE email_status IS NOT NULL AND email_status <> 'pending';
    `);

    const p = peopleStats.rows[0];
    const c = companyStats.rows[0];

    console.clear();
    console.log("=================================================");
    console.log("📊 DOOTT REAL-TIME EMAIL VERIFICATION MONITOR");
    console.log("=================================================");
    console.log(`Timestamp: ${new Date().toLocaleString()}\n`);

    console.log("👥 PEOPLE CONTACTS (final.people):");
    console.log(`   • Total Verified:   ${Number(p.verified_count).toLocaleString()}`);
    console.log(`   • Deliverable (✅): ${Number(p.deliverable).toLocaleString()}`);
    console.log(`   • Undeliverable(❌):${Number(p.undeliverable).toLocaleString()}`);
    console.log(`   • Risky (⚠️):        ${Number(p.risky).toLocaleString()}`);
    console.log(`   • Unknown (❓):      ${Number(p.unknown).toLocaleString()}\n`);

    console.log("🏢 COMPANIES (final.companies):");
    console.log(`   • Total Verified:   ${Number(c.verified_count).toLocaleString()}`);
    console.log(`   • Deliverable (✅): ${Number(c.deliverable).toLocaleString()}`);
    console.log(`   • Undeliverable(❌):${Number(c.undeliverable).toLocaleString()}`);
    console.log(`   • Risky (⚠️):        ${Number(c.risky).toLocaleString()}`);
    console.log(`   • Unknown (❓):      ${Number(c.unknown).toLocaleString()}\n`);

    console.log("=================================================");
    console.log("Tip: Run this command anytime to refresh statistics!");
  } finally {
    client.release();
    await pool.end();
  }
}

runMonitor().catch(err => {
  console.error("Monitor Error:", err.message);
  process.exit(1);
});
