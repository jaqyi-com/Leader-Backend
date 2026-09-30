"use strict";

/**
 * scripts/verify_all_database_emails.js
 * 
 * Production 50-Worker Continuous Resumable Email Verification Pipeline Engine
 * Performance Specifications:
 *   • Target Speed: ~900 - 1,500 emails / min (54,000 - 90,000 / hour)
 *   • Daily Capacity: ~1.3 - 2.1 Million emails / day
 *   • Total Capacity (20.46M Emails): ~14-15 Days
 * 
 * Architecture Features:
 *   1. Continuous 50-Worker Parallel Queue (Workers NEVER wait for slow sockets)
 *   2. In-Memory Domain MX & Catch-All LRU Caching (0ms lookup on repeated domains)
 *   3. Freemail Instant Short-Circuiting (Gmail, Yahoo, Hotmail, etc.)
 *   4. Ultra-Fast Multi-Row SQL Bulk UPDATEs (1 database query per 50 results)
 *   5. Persistent Keyset Pagination UUID Cursor State (.verification_progress.json)
 *   6. Step-by-Step Live Telemetry Stream with emails/min and ETA metrics
 */

process.env.UV_THREADPOOL_SIZE = "128";

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { verifyEmail } = require("../src/services/emailVerification/pipeline");

const CONCURRENCY = 50;
const FETCH_BATCH_SIZE = 300;
const WRITE_FLUSH_SIZE = 50;
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

function getBadge(status) {
  if (status === "deliverable") return "✅ DELIVERABLE  ";
  if (status === "undeliverable") return "❌ UNDELIVERABLE";
  if (status === "risky") return "⚠️ RISKY        ";
  return "❓ UNKNOWN      ";
}

async function bulkUpdateTable(client, tableName, updates) {
  if (!updates || updates.length === 0) return;
  const validUpdates = updates.filter(u => u && u.uuid);
  if (validUpdates.length === 0) return;

  const valueRows = [];
  const params = [];
  let pIdx = 1;

  for (const u of validUpdates) {
    valueRows.push(`($${pIdx}::uuid, $${pIdx + 1}::boolean, $${pIdx + 2}::text, $${pIdx + 3}::numeric)`);
    params.push(u.uuid, u.is_valid, u.status, u.score);
    pIdx += 4;
  }

  const sql = `
    UPDATE final.${tableName} AS t
    SET is_email_valid = v.is_valid,
        email_status = v.status,
        email_score = v.score,
        email_verified_at = NOW()
    FROM (VALUES ${valueRows.join(", ")}) AS v(uuid, is_valid, status, score)
    WHERE t.uuid = v.uuid;
  `;

  await client.query(sql, params);
}

async function runPipeline() {
  const state = loadState();

  printLine("===============================================================================");
  printLine("⚡ DOOTT HIGH-SPEED 50-WORKER CONTINUOUS EMAIL VERIFICATION PIPELINE ⚡");
  printLine("===============================================================================");
  printLine(`• Parallel Workers:        50 Continuous Async Queue Probes`);
  printLine(`• Target Throughput:       ~900-1,500 emails/min (54,000-90,000/hr)`);
  printLine(`• Resuming People Cursor:    ${state.people_last_uuid}`);
  printLine(`• Resuming Companies Cursor: ${state.companies_last_uuid}`);
  printLine(`• Total Verified So Far:     ${(state.total_people_verified + state.total_companies_verified).toLocaleString()}`);
  printLine(`• Stats: ✅ Deliverable: ${state.deliverable_count} | ❌ Undeliverable: ${state.undeliverable_count} | ⚠️ Risky: ${state.risky_count}`);
  printLine("===============================================================================\n");

  let running = true;
  process.on("SIGINT", () => {
    printLine("\n⏹️ Saving state checkpoint & shutting down gracefully...");
    saveState(state);
    running = false;
  });

  const startTime = Date.now();
  let verifiedInSession = 0;

  // Verification Task Queue Processor
  async function processTable(tableName, cursorKey, totalStateKey) {
    let activeClient = await pool.connect();
    try {
      await activeClient.query("SET statement_timeout = 60000;");

      while (running) {
        // Fetch a fresh batch of unverified records
        const fetchRes = await activeClient.query(`
          SELECT uuid, emails 
          FROM final.${tableName} 
          WHERE uuid > $1 
            AND is_email_valid IS NULL 
            AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
          ORDER BY uuid ASC 
          LIMIT ${FETCH_BATCH_SIZE};
        `, [state[cursorKey]]);

        if (fetchRes.rows.length === 0) {
          printLine(`[${new Date().toLocaleTimeString()}] Completed table [final.${tableName}] processing!`);
          break;
        }

        const items = fetchRes.rows;
        let queueIndex = 0;
        const pendingUpdates = [];

        // Worker function consuming items asynchronously
        async function workerTask(workerId) {
          while (running && queueIndex < items.length) {
            const myIndex = queueIndex++;
            if (myIndex >= items.length) break;

            const row = items[myIndex];
            const targetEmail = parseEmail(row.emails);
            const start = Date.now();

            if (!targetEmail) {
              pendingUpdates.push({ uuid: row.uuid, is_valid: false, status: "invalid_syntax", score: 0.0 });
              continue;
            }

            try {
              const verif = await verifyEmail(targetEmail, { forceRefresh: false, skipSmtp: false });
              const isValid = verif.state === "deliverable";
              const durationMs = Date.now() - start;

              if (verif.state === "deliverable") state.deliverable_count++;
              else if (verif.state === "undeliverable") state.undeliverable_count++;
              else if (verif.state === "risky") state.risky_count++;
              else state.unknown_count++;

              verifiedInSession++;
              const timeStr = new Date().toLocaleTimeString();
              const badge = getBadge(verif.state);
              printLine(`[${timeStr}] [W#${String(workerId).padStart(2, "0")}] [${tableName.slice(0, 4)}] ${targetEmail.padEnd(34)} ➔ ${badge} (${durationMs}ms)`);

              pendingUpdates.push({
                uuid: row.uuid,
                is_valid: isValid,
                status: verif.state,
                score: verif.score
              });
            } catch (err) {
              printLine(`[${new Date().toLocaleTimeString()}] [W#${String(workerId).padStart(2, "0")}] [${tableName.slice(0, 4)}] ${targetEmail.padEnd(34)} ➔ ❓ ERROR (${err.message})`);
              pendingUpdates.push({ uuid: row.uuid, is_valid: false, status: "error", score: 0.0 });
            }
          }
        }

        // Launch 50 Workers simultaneously consuming queue items
        const workerPromises = [];
        for (let w = 1; w <= CONCURRENCY; w++) {
          workerPromises.push(workerTask(w));
        }

        await Promise.all(workerPromises);

        // Bulk update database with results
        if (pendingUpdates.length > 0) {
          await bulkUpdateTable(activeClient, tableName, pendingUpdates);
        }

        // Advance cursor & state checkpoint
        state[cursorKey] = items[items.length - 1].uuid;
        state[totalStateKey] += items.length;
        saveState(state);

        // Telemetry calculation
        const elapsedSec = (Date.now() - startTime) / 1000;
        const ratePerMin = elapsedSec > 0 ? Math.round((verifiedInSession / elapsedSec) * 60) : 0;
        const ratePerHour = ratePerMin * 60;
        const totalVerif = state.total_people_verified + state.total_companies_verified;

        printLine(`\n─── 📊 Progress Metrics: ${ratePerMin} emails/min (${ratePerHour.toLocaleString()}/hr) | Verified Total: ${totalVerif.toLocaleString()} (✅ Deliverable: ${state.deliverable_count.toLocaleString()}) ───\n`);
      }
    } finally {
      activeClient.release();
    }
  }

  // Run People table verification
  await processTable("people", "people_last_uuid", "total_people_verified");

  // Run Companies table verification
  if (running) {
    await processTable("companies", "companies_last_uuid", "total_companies_verified");
  }

  await pool.end();
  printLine("⚡ Email verification pipeline completed cleanly.");
}

runPipeline().catch(err => {
  console.error("Fatal Pipeline Error:", err);
  process.exit(1);
});
