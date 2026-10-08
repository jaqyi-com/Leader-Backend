"use strict";

/**
 * scripts/verify_all_database_emails.js
 * 
 * Production 50-Worker Continuous Resumable Email Verification Pipeline Engine
 * Specs & Speed:
 *   • Target Speed: ~900 - 1,500 emails / min (54,000 - 90,000 / hour)
 *   • Daily Capacity: ~1.3 - 2.1 Million emails / day
 *   • Time for 20.46M Emails: ~14 - 15 Days
 */

process.env.UV_THREADPOOL_SIZE = "128";

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { verifyEmail } = require("../src/services/emailVerification/pipeline");

// GLOBAL CRASH SHIELD - PREVENTS UNCAUGHT SOCKET DROPS FROM KILLING PROCESS
process.on("uncaughtException", (err) => {
  console.warn(`[Pipeline Crash Shield] ⚠️ Uncaught Exception safely handled: ${err.message}`);
});

process.on("unhandledRejection", (reason) => {
  console.warn(`[Pipeline Crash Shield] ⚠️ Unhandled Rejection safely handled: ${reason?.message || reason}`);
});

const CONCURRENCY = 50;
const FETCH_BATCH_SIZE = 100;
const STATE_FILE = path.join(__dirname, ".verification_progress.json");
const DB_URL = process.env.NEON_DATABASE_URL || process.env.NEON_DIRECT_URL;

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

pool.on("error", (err) => {
  console.warn("[NeonDB Pool] ⚠️ Idle client network warning (auto-reconnecting):", err.message);
});

async function getSafeClient() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const client = await pool.connect();
      if (!client._hasErrorListener) {
        client.on("error", () => {});
        client._hasErrorListener = true;
      }
      return client;
    } catch (err) {
      console.warn(`[DB Client Checkout Retry ${attempt}/5] ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error("Failed to checkout DB client after 5 attempts");
}

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

async function bulkUpdateTable(tableName, updates) {
  if (!updates || updates.length === 0) return;
  const validUpdates = updates.filter(u => u && u.uuid);
  if (validUpdates.length === 0) return;

  // Chunk updates into small batches of 25 items for fast DB locks & execution
  const CHUNK_SIZE = 25;
  for (let i = 0; i < validUpdates.length; i += CHUNK_SIZE) {
    const chunk = validUpdates.slice(i, i + CHUNK_SIZE);
    
    const valueRows = [];
    const params = [];
    let pIdx = 1;

    for (const u of chunk) {
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

    for (let attempt = 1; attempt <= 3; attempt++) {
      let client = null;
      try {
        client = await getSafeClient();
        await client.query("SET statement_timeout = 0;");
        await client.query(sql, params);
        break; // Chunk update succeeded
      } catch (err) {
        if (attempt === 3) {
          // Fallback to row-by-row for this chunk
          for (const u of chunk) {
            let singleClient = null;
            try {
              singleClient = await getSafeClient();
              await singleClient.query("SET statement_timeout = 0;");
              await singleClient.query(
                `UPDATE final.${tableName} SET is_email_valid = $1, email_status = $2, email_score = $3, email_verified_at = NOW() WHERE uuid = $4;`,
                [u.is_valid, u.status, u.score, u.uuid]
              );
            } catch (_) {}
            finally {
              if (singleClient) try { singleClient.release(); } catch (_) {}
            }
          }
        } else {
          await new Promise(r => setTimeout(r, 500));
        }
      } finally {
        if (client) try { client.release(); } catch (_) {}
      }
    }
  }
}

async function fetchNextBatch(tableName, lastUuid) {
  let client = null;
  try {
    client = await getSafeClient();
    await client.query("SET statement_timeout = 60000;");
    const res = await client.query(`
      SELECT uuid, emails 
      FROM final.${tableName} 
      WHERE uuid > $1 
        AND is_email_valid IS NULL 
        AND emails IS NOT NULL AND emails <> '{}' AND emails <> ''
      ORDER BY uuid ASC 
      LIMIT ${FETCH_BATCH_SIZE};
    `, [lastUuid]);
    return res.rows;
  } catch (err) {
    printLine(`[Fetch Batch Warning] ${err.message}`);
    return [];
  } finally {
    if (client) try { client.release(); } catch (_) {}
  }
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
    process.exit(0);
  });

  const startTime = Date.now();
  let verifiedInSession = 0;

  async function processTable(tableName, cursorKey, totalStateKey) {
    printLine(`\n🚀 Starting verification for table [final.${tableName}]...`);

    while (running) {
      const items = await fetchNextBatch(tableName, state[cursorKey]);

      if (items.length === 0) {
        await new Promise(r => setTimeout(r, 3000));
        const retryItems = await fetchNextBatch(tableName, state[cursorKey]);
        if (retryItems.length === 0) {
          printLine(`[${new Date().toLocaleTimeString()}] ✅ Table [final.${tableName}] verification 100% complete!`);
          break;
        }
        continue;
      }

      let queueIndex = 0;
      const pendingUpdates = [];

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

      const workerPromises = [];
      for (let w = 1; w <= CONCURRENCY; w++) {
        workerPromises.push(workerTask(w));
      }

      await Promise.all(workerPromises);

      // Bulk update database in small 25-item chunks
      if (pendingUpdates.length > 0) {
        await bulkUpdateTable(tableName, pendingUpdates);
      }

      // Advance cursor & save state checkpoint
      state[cursorKey] = items[items.length - 1].uuid;
      state[totalStateKey] += items.length;
      saveState(state);

      // Telemetry calculation
      const elapsedSec = (Date.now() - startTime) / 1000;
      const ratePerMin = elapsedSec > 0 ? Math.round((verifiedInSession / elapsedSec) * 60) : 0;
      const ratePerHour = ratePerMin * 60;
      const totalVerif = state.total_people_verified + state.total_companies_verified;

      printLine(`─── 📊 Rate: ${ratePerMin} emails/min (${ratePerHour.toLocaleString()}/hr) | Verified Total: ${totalVerif.toLocaleString()} (✅ Deliverable: ${state.deliverable_count.toLocaleString()}) ───\n`);
    }
  }

  // 1. Run Companies table verification FIRST
  await processTable("companies", "companies_last_uuid", "total_companies_verified");

  // 2. Run People table verification SECOND
  if (running) {
    await processTable("people", "people_last_uuid", "total_people_verified");
  }

  await pool.end();
  printLine("⚡ Email verification pipeline completed cleanly.");
}

async function mainLoop() {
  while (true) {
    try {
      await runPipeline();
      break;
    } catch (err) {
      printLine(`\n⚠️ [Pipeline Self-Healing] Recovering from error: ${err.message}`);
      printLine(`🔄 Resuming verification engine in 3 seconds...\n`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

mainLoop();
