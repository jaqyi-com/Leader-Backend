"use strict";

/**
 * scripts/verify_all_database_emails.js
 * 
 * High-Throughput 50-Parallel Worker Resumable Email Verification Pipeline
 * Features:
 *   - 50 Parallel Workers (54,000+ emails/hour throughput target)
 *   - Resumable state file (.verification_progress.json) with UUID keyset pagination
 *   - Port 25 SMTP + MX + Dual Probe Catch-All Verification Engine
 *   - Fast 4s TCP Socket timeouts to prevent hanging on slow servers
 *   - Real-time unbuffered terminal streaming
 *   - Updates is_email_valid, email_status, email_score, and email_verified_at in PostgreSQL
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { verifyEmail } = require("../src/services/emailVerification/pipeline");

const BATCH_SIZE = 50;
const PARALLEL_CONCURRENCY = 50;
const STATE_FILE = path.join(__dirname, ".verification_progress.json");
const DB_URL = process.env.NEON_DATABASE_URL;

if (!DB_URL) {
  console.error("❌ NEON_DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 60,
  idleTimeoutMillis: 30000,
});

// Immediate unbuffered output function for step-by-step live streaming
function printLine(msg) {
  process.stdout.write(msg + "\n");
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      return {
        people_last_uuid: data.people_last_uuid || "00000000-0000-0000-0000-000000000000",
        companies_last_uuid: data.companies_last_uuid || "00000000-0000-0000-0000-000000000000",
        total_people_verified: data.total_people_verified || 0,
        total_companies_verified: data.total_companies_verified || 0,
        deliverable_count: data.deliverable_count || 0,
        undeliverable_count: data.undeliverable_count || 0,
        risky_count: data.risky_count || 0,
        unknown_count: data.unknown_count || 0,
        started_at: data.started_at || new Date().toISOString()
      };
    }
  } catch (_) {}

  return {
    people_last_uuid: "00000000-0000-0000-0000-000000000000",
    companies_last_uuid: "00000000-0000-0000-0000-000000000000",
    total_people_verified: 0,
    total_companies_verified: 0,
    deliverable_count: 0,
    undeliverable_count: 0,
    risky_count: 0,
    unknown_count: 0,
    started_at: new Date().toISOString()
  };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (_) {}
}

function parseEmail(emailVal) {
  if (!emailVal) return null;
  if (Array.isArray(emailVal) && emailVal.length > 0) return emailVal[0];
  if (typeof emailVal === "string") {
    const cleaned = emailVal.replace(/[{}"']/g, "").split(",")[0].trim();
    if (cleaned.includes("@")) return cleaned;
  }
  return null;
}

async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

function getBadge(status) {
  if (status === "deliverable") return "✅ DELIVERABLE  ";
  if (status === "undeliverable") return "❌ UNDELIVERABLE";
  if (status === "risky") return "⚠️ RISKY        ";
  return "❓ UNKNOWN      ";
}

async function verifyPeopleBatch(state) {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 60000;");
    const res = await client.query(`
      SELECT uuid, emails 
      FROM final.people 
      WHERE uuid > $1 
        AND is_email_valid IS NULL 
        AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
      ORDER BY uuid ASC 
      LIMIT ${BATCH_SIZE};
    `, [state.people_last_uuid]);

    if (res.rows.length === 0) return [];

    const updates = await mapConcurrent(res.rows, PARALLEL_CONCURRENCY, async (row) => {
      const start = Date.now();
      const targetEmail = parseEmail(row.emails);
      if (!targetEmail) {
        return { uuid: row.uuid, is_valid: false, status: "invalid_syntax", score: 0.0, email: row.emails, durationMs: 0, reason: "Invalid syntax" };
      }

      try {
        const verif = await verifyEmail(targetEmail, { forceRefresh: false, skipSmtp: false });
        const isValid = verif.state === "deliverable";
        const durationMs = Date.now() - start;

        if (verif.state === "deliverable") state.deliverable_count++;
        else if (verif.state === "undeliverable") state.undeliverable_count++;
        else if (verif.state === "risky") state.risky_count++;
        else state.unknown_count++;

        const timeStr = new Date().toLocaleTimeString();
        const badge = getBadge(verif.state);
        printLine(`[${timeStr}] [Person]  ${targetEmail.padEnd(36)} ➔ ${badge} (${durationMs}ms)`);

        return {
          uuid: row.uuid,
          is_valid: isValid,
          status: verif.state,
          score: verif.score,
          email: targetEmail,
          durationMs,
          reason: verif.reason
        };
      } catch (err) {
        printLine(`[${new Date().toLocaleTimeString()}] [Person]  ${targetEmail.padEnd(36)} ➔ ❓ ERROR (${err.message})`);
        return { uuid: row.uuid, is_valid: null, status: "error", score: 0.0, email: targetEmail, durationMs: 0, reason: err.message };
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

    // Advance cursor
    state.people_last_uuid = res.rows[res.rows.length - 1].uuid;
    state.total_people_verified += updates.length;
    saveState(state);

    return updates;
  } finally {
    client.release();
  }
}

async function verifyCompaniesBatch(state) {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 60000;");
    const res = await client.query(`
      SELECT uuid, emails 
      FROM final.companies 
      WHERE uuid > $1 
        AND is_email_valid IS NULL 
        AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
      ORDER BY uuid ASC 
      LIMIT ${BATCH_SIZE};
    `, [state.companies_last_uuid]);

    if (res.rows.length === 0) return [];

    const updates = await mapConcurrent(res.rows, PARALLEL_CONCURRENCY, async (row) => {
      const start = Date.now();
      const targetEmail = parseEmail(row.emails);
      if (!targetEmail) {
        return { uuid: row.uuid, is_valid: false, status: "invalid_syntax", score: 0.0, email: row.emails, durationMs: 0, reason: "Invalid syntax" };
      }

      try {
        const verif = await verifyEmail(targetEmail, { forceRefresh: false, skipSmtp: false });
        const isValid = verif.state === "deliverable";
        const durationMs = Date.now() - start;

        if (verif.state === "deliverable") state.deliverable_count++;
        else if (verif.state === "undeliverable") state.undeliverable_count++;
        else if (verif.state === "risky") state.risky_count++;
        else state.unknown_count++;

        const timeStr = new Date().toLocaleTimeString();
        const badge = getBadge(verif.state);
        printLine(`[${timeStr}] [Company] ${targetEmail.padEnd(36)} ➔ ${badge} (${durationMs}ms)`);

        return {
          uuid: row.uuid,
          is_valid: isValid,
          status: verif.state,
          score: verif.score,
          email: targetEmail,
          durationMs,
          reason: verif.reason
        };
      } catch (err) {
        printLine(`[${new Date().toLocaleTimeString()}] [Company] ${targetEmail.padEnd(36)} ➔ ❓ ERROR (${err.message})`);
        return { uuid: row.uuid, is_valid: null, status: "error", score: 0.0, email: targetEmail, durationMs: 0, reason: err.message };
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

    // Advance cursor
    state.companies_last_uuid = res.rows[res.rows.length - 1].uuid;
    state.total_companies_verified += updates.length;
    saveState(state);

    return updates;
  } finally {
    client.release();
  }
}

async function startPipelineRunner() {
  const state = loadState();

  printLine("===============================================================================");
  printLine("⚡ DOOTT HIGH-SPEED 50-WORKER RESUMABLE EMAIL VERIFICATION PIPELINE ⚡");
  printLine("===============================================================================");
  printLine(`• Concurrency Workers:      50 Parallel Socket Probes`);
  printLine(`• Target Processing Speed:  ~900 emails/min (54,000 emails/hour)`);
  printLine(`• Resuming People Cursor:    ${state.people_last_uuid}`);
  printLine(`• Resuming Companies Cursor: ${state.companies_last_uuid}`);
  printLine(`• Total Verified So Far:     ${state.total_people_verified + state.total_companies_verified}`);
  printLine(`• Deliverable: ${state.deliverable_count} | Undeliverable: ${state.undeliverable_count} | Risky: ${state.risky_count}`);
  printLine("===============================================================================\n");

  let running = true;
  process.on("SIGINT", () => {
    printLine("\n⏹️ Saving state checkpoint & shutting down gracefully...");
    saveState(state);
    running = false;
  });

  while (running) {
    const pUpdates = await verifyPeopleBatch(state).catch(err => {
      printLine(`People batch error: ${err.message}`);
      return [];
    });

    const cUpdates = await verifyCompaniesBatch(state).catch(err => {
      printLine(`Companies batch error: ${err.message}`);
      return [];
    });

    const pCount = Array.isArray(pUpdates) ? pUpdates.length : 0;
    const cCount = Array.isArray(cUpdates) ? cUpdates.length : 0;

    if (pCount > 0 || cCount > 0) {
      const totalVerif = state.total_people_verified + state.total_companies_verified;
      printLine(`─── 📊 Progress Summary: ${totalVerif.toLocaleString()} verified (People: ${state.total_people_verified} | Companies: ${state.total_companies_verified} | Deliverable: ${state.deliverable_count}) ───\n`);
    } else {
      printLine(`[${new Date().toLocaleTimeString()}] All pending emails verified! Checking again in 15 seconds...`);
      await new Promise(r => setTimeout(r, 15000));
    }
  }

  await pool.end();
  printLine("Pipeline runner stopped cleanly.");
}

startPipelineRunner().catch(err => {
  console.error("Fatal Pipeline Error:", err);
  process.exit(1);
});
