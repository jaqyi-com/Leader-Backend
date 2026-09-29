"use strict";

/**
 * scripts/verify_all_database_emails.js
 * 
 * Bulk Background Email Verification Pipeline Runner
 * Runs Port 25 SMTP verification across all records in final.people and final.companies
 * Updates is_email_valid, email_status, email_score, and email_verified_at columns.
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const { Pool } = require("pg");
const { verifyEmail } = require("../src/services/emailVerification/pipeline");

const BATCH_SIZE = 50;
const CONCURRENCY = 10;
const DB_URL = process.env.NEON_DATABASE_URL;

if (!DB_URL) {
  console.error("❌ NEON_DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
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

async function verifyPeopleBatch() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT uuid, emails 
      FROM final.people 
      WHERE (email_status IS NULL OR email_status = 'pending')
        AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED;
    `);

    if (res.rows.length === 0) return 0;

    const updates = [];
    for (const row of res.rows) {
      const targetEmail = parseEmail(row.emails);
      if (!targetEmail) {
        updates.push({ uuid: row.uuid, is_valid: false, status: "invalid_syntax", score: 0.0 });
        continue;
      }

      try {
        const verif = await verifyEmail(targetEmail, { forceRefresh: false, skipSmtp: false });
        const isValid = verif.state === "deliverable";
        updates.push({
          uuid: row.uuid,
          is_valid: isValid,
          status: verif.state,
          score: verif.score
        });
      } catch (err) {
        updates.push({ uuid: row.uuid, is_valid: null, status: "error", score: 0.0 });
      }
    }

    // Bulk update batch
    for (const u of updates) {
      await client.query(`
        UPDATE final.people 
        SET is_email_valid = $1, email_status = $2, email_score = $3, email_verified_at = NOW()
        WHERE uuid = $4
      `, [u.is_valid, u.status, u.score, u.uuid]);
    }

    return res.rows.length;
  } finally {
    client.release();
  }
}

async function verifyCompaniesBatch() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT uuid, emails 
      FROM final.companies 
      WHERE (email_status IS NULL OR email_status = 'pending')
        AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED;
    `);

    if (res.rows.length === 0) return 0;

    const updates = [];
    for (const row of res.rows) {
      const targetEmail = parseEmail(row.emails);
      if (!targetEmail) {
        updates.push({ uuid: row.uuid, is_valid: false, status: "invalid_syntax", score: 0.0 });
        continue;
      }

      try {
        const verif = await verifyEmail(targetEmail, { forceRefresh: false, skipSmtp: false });
        const isValid = verif.state === "deliverable";
        updates.push({
          uuid: row.uuid,
          is_valid: isValid,
          status: verif.state,
          score: verif.score
        });
      } catch (err) {
        updates.push({ uuid: row.uuid, is_valid: null, status: "error", score: 0.0 });
      }
    }

    // Bulk update batch
    for (const u of updates) {
      await client.query(`
        UPDATE final.companies 
        SET is_email_valid = $1, email_status = $2, email_score = $3, email_verified_at = NOW()
        WHERE uuid = $4
      `, [u.is_valid, u.status, u.score, u.uuid]);
    }

    return res.rows.length;
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
  console.log("• Verification Engine: Port 25 SMTP + MX + Dual Probe Catch-All");
  console.log("• Target Columns: is_email_valid, email_status, email_score\n");

  let totalPeopleVerified = 0;
  let totalCompaniesVerified = 0;
  let running = true;

  process.on("SIGINT", () => {
    console.log("\n⏹️ Stopping pipeline gracefully...");
    running = false;
  });

  while (running) {
    const peopleCount = await verifyPeopleBatch().catch(err => {
      console.error("People batch error:", err.message);
      return 0;
    });

    const companyCount = await verifyCompaniesBatch().catch(err => {
      console.error("Companies batch error:", err.message);
      return 0;
    });

    totalPeopleVerified += peopleCount;
    totalCompaniesVerified += companyCount;

    if (peopleCount > 0 || companyCount > 0) {
      console.log(`[${new Date().toISOString()}] Verified batch | People: ${totalPeopleVerified} | Companies: ${totalCompaniesVerified}`);
    } else {
      console.log(`[${new Date().toISOString()}] All pending emails verified! Waiting 30s for new records...`);
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  await pool.end();
  console.log("Pipeline runner stopped.");
}

startPipelineRunner().catch(err => {
  console.error("Fatal Pipeline Runner Error:", err);
  process.exit(1);
});
