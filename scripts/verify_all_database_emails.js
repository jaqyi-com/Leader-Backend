"use strict";

/**
 * scripts/verify_all_database_emails.js
 * 
 * High-Speed Bulk Email Verification Pipeline Runner
 * Runs Port 25 SMTP verification across all records in final.people and final.companies
 * Updates is_email_valid, email_status, email_score, and email_verified_at columns in real time.
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const { Pool } = require("pg");
const { verifyEmail } = require("../src/services/emailVerification/pipeline");

const BATCH_SIZE = 25;
const PARALLEL_CONCURRENCY = 5;
const DB_URL = process.env.NEON_DATABASE_URL;

if (!DB_URL) {
  console.error("❌ NEON_DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 15,
  idleTimeoutMillis: 30000,
});

function parseEmail(emailVal) {
  if (!emailVal) return null;
  if (Array.isArray(emailVal) && emailVal.length > 0) return emailVal[0];
  if (typeof emailVal === "string") {
    const cleaned = emailVal.replace(/[{}"']/g, "").split(",")[0].trim();
    if (cleaned.includes("@")) return cleaned;
  }
  return null;
}

// Helper for parallel promise concurrency
async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

async function verifyPeopleBatch() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 60000;");
    const res = await client.query(`
      SELECT uuid, emails 
      FROM final.people 
      WHERE is_email_valid IS NULL 
        AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
      LIMIT ${BATCH_SIZE};
    `);

    if (res.rows.length === 0) return 0;

    const updates = await mapConcurrent(res.rows, PARALLEL_CONCURRENCY, async (row) => {
      const targetEmail = parseEmail(row.emails);
      if (!targetEmail) {
        return { uuid: row.uuid, is_valid: false, status: "invalid_syntax", score: 0.0, email: row.emails };
      }

      try {
        const verif = await verifyEmail(targetEmail, { forceRefresh: false, skipSmtp: false });
        const isValid = verif.state === "deliverable";
        return {
          uuid: row.uuid,
          is_valid: isValid,
          status: verif.state,
          score: verif.score,
          email: targetEmail
        };
      } catch (err) {
        return { uuid: row.uuid, is_valid: null, status: "error", score: 0.0, email: targetEmail };
      }
    });

    // Bulk update batch
    for (const u of updates) {
      await client.query(`
        UPDATE final.people 
        SET is_email_valid = $1, email_status = $2, email_score = $3, email_verified_at = NOW()
        WHERE uuid = $4
      `, [u.is_valid, u.status, u.score, u.uuid]);
    }

    return updates;
  } finally {
    client.release();
  }
}

async function verifyCompaniesBatch() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 60000;");
    const res = await client.query(`
      SELECT uuid, emails 
      FROM final.companies 
      WHERE is_email_valid IS NULL 
        AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
      LIMIT ${BATCH_SIZE};
    `);

    if (res.rows.length === 0) return 0;

    const updates = await mapConcurrent(res.rows, PARALLEL_CONCURRENCY, async (row) => {
      const targetEmail = parseEmail(row.emails);
      if (!targetEmail) {
        return { uuid: row.uuid, is_valid: false, status: "invalid_syntax", score: 0.0, email: row.emails };
      }

      try {
        const verif = await verifyEmail(targetEmail, { forceRefresh: false, skipSmtp: false });
        const isValid = verif.state === "deliverable";
        return {
          uuid: row.uuid,
          is_valid: isValid,
          status: verif.state,
          score: verif.score,
          email: targetEmail
        };
      } catch (err) {
        return { uuid: row.uuid, is_valid: null, status: "error", score: 0.0, email: targetEmail };
      }
    });

    // Bulk update batch
    for (const u of updates) {
      await client.query(`
        UPDATE final.companies 
        SET is_email_valid = $1, email_status = $2, email_score = $3, email_verified_at = NOW()
        WHERE uuid = $4
      `, [u.is_valid, u.status, u.score, u.uuid]);
    }

    return updates;
  } finally {
    client.release();
  }
}

async function startPipelineRunner() {
  console.log("=================================================");
  console.log("⚡ DOOTT DATABASE EMAIL VERIFICATION PIPELINE ⚡");
  console.log("=================================================");
  console.log("• Database: Neon PostgreSQL");
  console.log("• Target Tables: final.people & final.companies");
  console.log("• Engine: Port 25 SMTP + MX + Dual Probe Catch-All");
  console.log("• Target Columns: is_email_valid, email_status, email_score\n");

  let totalPeopleVerified = 0;
  let totalCompaniesVerified = 0;
  let running = true;

  process.on("SIGINT", () => {
    console.log("\n⏹️ Stopping pipeline gracefully...");
    running = false;
  });

  while (running) {
    const peopleUpdates = await verifyPeopleBatch().catch(err => {
      console.error("People batch error:", err.message);
      return [];
    });

    const companyUpdates = await verifyCompaniesBatch().catch(err => {
      console.error("Companies batch error:", err.message);
      return [];
    });

    const pCount = Array.isArray(peopleUpdates) ? peopleUpdates.length : 0;
    const cCount = Array.isArray(companyUpdates) ? companyUpdates.length : 0;

    totalPeopleVerified += pCount;
    totalCompaniesVerified += cCount;

    if (pCount > 0 || cCount > 0) {
      const now = new Date().toLocaleTimeString();
      console.log(`[${now}] Verified batch (+${pCount + cCount}) | Total People: ${totalPeopleVerified} | Total Companies: ${totalCompaniesVerified}`);
      if (Array.isArray(peopleUpdates) && peopleUpdates.length > 0) {
        const sample = peopleUpdates[0];
        console.log(`  └─ Sample Person: ${sample.email} → ${sample.status} (score=${sample.score})`);
      }
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] All pending emails verified! Checking again in 15 seconds...`);
      await new Promise(r => setTimeout(r, 15000));
    }
  }

  await pool.end();
  console.log("Pipeline runner stopped.");
}

startPipelineRunner().catch(err => {
  console.error("Fatal Pipeline Runner Error:", err);
  process.exit(1);
});
