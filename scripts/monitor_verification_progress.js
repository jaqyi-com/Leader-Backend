"use strict";

/**
 * scripts/monitor_verification_progress.js
 * 
 * Instant Real-Time Email Verification Monitoring Command
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
    // Fast count from email_verifications table
    const cacheStats = await client.query(`
      SELECT 
        COUNT(*) AS total_cached,
        COUNT(*) FILTER (WHERE state = 'deliverable') AS deliverable,
        COUNT(*) FILTER (WHERE state = 'undeliverable') AS undeliverable,
        COUNT(*) FILTER (WHERE state = 'risky') AS risky,
        COUNT(*) FILTER (WHERE state = 'unknown') AS unknown
      FROM final.email_verifications;
    `);

    const pEst = await client.query(`
      SELECT reltuples::bigint AS total_people_est
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'final' AND c.relname = 'people';
    `);

    const cEst = await client.query(`
      SELECT reltuples::bigint AS total_companies_est
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'final' AND c.relname = 'companies';
    `);

    const s = cacheStats.rows[0];
    const pTotal = Number(pEst.rows[0]?.total_people_est || 45059532);
    const cTotal = Number(cEst.rows[0]?.total_companies_est || 1553381);

    console.log("=================================================");
    console.log("📊 DOOTT REAL-TIME EMAIL VERIFICATION MONITOR");
    console.log("=================================================");
    console.log(`Timestamp: ${new Date().toLocaleString()}\n`);

    console.log("📧 VERIFICATION CACHE (final.email_verifications):");
    console.log(`   • Total Verified & Cached: ${Number(s.total_cached).toLocaleString()}`);
    console.log(`   • Deliverable (✅):       ${Number(s.deliverable).toLocaleString()}`);
    console.log(`   • Undeliverable(❌):      ${Number(s.undeliverable).toLocaleString()}`);
    console.log(`   • Risky (⚠️):              ${Number(s.risky).toLocaleString()}`);
    console.log(`   • Unknown (❓):            ${Number(s.unknown).toLocaleString()}\n`);

    console.log("🗄️ DATABASE CAPACITY:");
    console.log(`   • People Table (final.people):    ${pTotal.toLocaleString()} rows`);
    console.log(`   • Companies Table (final.companies): ${cTotal.toLocaleString()} rows\n`);

    console.log("=================================================");
    console.log("Run this command anytime for sub-second verification statistics!");
  } finally {
    client.release();
    await pool.end();
  }
}

runMonitor().catch(err => {
  console.error("Monitor Error:", err.message);
  process.exit(1);
});
