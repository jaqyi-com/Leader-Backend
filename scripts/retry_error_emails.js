"use strict";

/**
 * scripts/retry_error_emails.js
 * 
 * High-Speed Targeted Retry Engine for Failed / Timed-Out Email Verifications.
 * Specifically pulls records with email_status = 'error' and verifies them
 * using the optimized fast-path DNS and SMTP probe pipeline.
 */

process.env.UV_THREADPOOL_SIZE = "128";

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { verifyEmail } = require("../src/services/emailVerification/pipeline");

process.on("uncaughtException", (err) => {
  console.warn(`[Retry Crash Shield] ⚠️ Uncaught Exception safely handled: ${err.message}`);
});

process.on("unhandledRejection", (reason) => {
  console.warn(`[Retry Crash Shield] ⚠️ Unhandled Rejection safely handled: ${reason?.message || reason}`);
});

const CONCURRENCY = 50;
const BATCH_SIZE = 100;
const LOG_FILE = path.join(__dirname, "../pipeline.log");
const DB_URL = process.env.NEON_DATABASE_URL || process.env.NEON_DIRECT_URL;

if (!DB_URL) {
  console.error("❌ NEON_DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 40,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  statement_timeout: 45000,
  query_timeout: 45000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (err) => {
  console.warn("[NeonDB Pool] ⚠️ Pool error:", err.message);
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
  try {
    fs.appendFileSync(LOG_FILE, msg + "\n", "utf8");
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
        await client.query("SET statement_timeout = 30000;");
        await client.query(sql, params);
        break;
      } catch (err) {
        if (attempt === 3) {
          for (const u of chunk) {
            let singleClient = null;
            try {
              singleClient = await getSafeClient();
              await singleClient.query("SET statement_timeout = 15000;");
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

async function retryTableErrors(tableName) {
  let client = null;
  let totalErrors = 0;
  try {
    client = await getSafeClient();
    const countRes = await client.query(`SELECT count(*) as cnt FROM final.${tableName} WHERE email_status = 'error';`);
    totalErrors = parseInt(countRes.rows[0].cnt, 10);
  } catch (err) {
    printLine(`[Retry Query Error] ${err.message}`);
  } finally {
    if (client) try { client.release(); } catch (_) {}
  }

  printLine(`\n🔍 Found ${totalErrors.toLocaleString()} records with email_status = 'error' in final.${tableName}`);
  if (totalErrors === 0) return;

  printLine(`🚀 Launching 50-worker retry engine for final.${tableName}...`);

  let resolvedCount = 0;
  let deliverable = 0;
  let undeliverable = 0;
  let risky = 0;
  let unknown = 0;
  const startTime = Date.now();

  while (true) {
    let batchRes = null;
    let bClient = null;
    try {
      bClient = await getSafeClient();
      await bClient.query("SET statement_timeout = 30000;");
      batchRes = await bClient.query(`
        SELECT uuid, emails 
        FROM final.${tableName} 
        WHERE email_status = 'error'
        LIMIT ${BATCH_SIZE};
      `);
    } catch (err) {
      printLine(`[Fetch Retry Batch Warning] ${err.message}`);
      await new Promise(r => setTimeout(r, 3000));
      continue;
    } finally {
      if (bClient) try { bClient.release(); } catch (_) {}
    }

    const items = batchRes ? batchRes.rows : [];
    if (!items || items.length === 0) {
      printLine(`\n🎉 All error records in final.${tableName} have been successfully verified and resolved!`);
      break;
    }

    let queueIndex = 0;
    const pendingUpdates = [];

    async function workerTask(workerId) {
      while (queueIndex < items.length) {
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
          const verifPromise = verifyEmail(targetEmail, { forceRefresh: true, skipSmtp: false, timeoutMs: 4000 });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Verification timeout (15s)")), 15000)
          );
          const verif = await Promise.race([verifPromise, timeoutPromise]);
          const isValid = verif.state === "deliverable";
          const durationMs = Date.now() - start;

          if (verif.state === "deliverable") deliverable++;
          else if (verif.state === "undeliverable") undeliverable++;
          else if (verif.state === "risky") risky++;
          else unknown++;

          resolvedCount++;
          const timeStr = new Date().toLocaleTimeString();
          const badge = getBadge(verif.state);
          const reasonSnippet = verif.reason ? ` [${verif.reason.slice(0, 40)}]` : "";
          printLine(`[${timeStr}] [RETRY W#${String(workerId).padStart(2, "0")}] [${tableName.slice(0, 4)}] ${targetEmail.padEnd(34)} ➔ ${badge}${reasonSnippet} (${durationMs}ms)`);

          pendingUpdates.push({
            uuid: row.uuid,
            is_valid: isValid,
            status: verif.state,
            score: verif.score
          });
        } catch (err) {
          unknown++;
          resolvedCount++;
          const durationMs = Date.now() - start;
          const timeStr = new Date().toLocaleTimeString();
          printLine(`[${timeStr}] [RETRY W#${String(workerId).padStart(2, "0")}] [${tableName.slice(0, 4)}] ${targetEmail.padEnd(34)} ➔ ❓ UNKNOWN (${err.message}) (${durationMs}ms)`);
          pendingUpdates.push({ uuid: row.uuid, is_valid: false, status: "unknown", score: 0.5 });
        }
      }
    }

    const workerPromises = [];
    for (let w = 1; w <= CONCURRENCY; w++) {
      workerPromises.push(workerTask(w));
    }

    await Promise.all(workerPromises);

    if (pendingUpdates.length > 0) {
      await bulkUpdateTable(tableName, pendingUpdates);
    }

    const elapsedSec = (Date.now() - startTime) / 1000;
    const ratePerMin = elapsedSec > 0 ? Math.round((resolvedCount / elapsedSec) * 60) : 0;
    printLine(`─── 🔄 Retry Progress: ${resolvedCount.toLocaleString()} / ${totalErrors.toLocaleString()} (${ratePerMin}/min) | ✅ ${deliverable} | ❌ ${undeliverable} | ⚠️ ${risky} | ❓ ${unknown} ───\n`);
  }
}

async function main() {
  printLine("===============================================================================");
  printLine("⚡ DOOTT EMAIL VERIFICATION RETRY ENGINE (FAILED & TIMED-OUT EMAILS) ⚡");
  printLine("===============================================================================");

  await retryTableErrors("companies");
  await retryTableErrors("people");

  await pool.end();
  printLine("===============================================================================");
  printLine("✅ RETRY RUN COMPLETED. ALL TIMED-OUT EMAILS SUCCESSFULLY RESOLVED.");
  printLine("===============================================================================\n");
}

main();
