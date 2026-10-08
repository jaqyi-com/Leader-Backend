"use strict";

/**
 * scripts/monitor_verification_live.js
 * 
 * Interactive Live Real-Time Dashboard for Doott Email Verification Pipeline
 * Run: node scripts/monitor_verification_live.js
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { cacheGet } = require("../src/db/redis");

const STATE_FILE = path.join(__dirname, ".verification_progress.json");
const DB_URL = process.env.NEON_DATABASE_URL;

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  // Silent catch pool network reconnects
});

function loadStateFile() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch (_) {}
  return null;
}

function renderProgressBar(percent, length = 30) {
  const filled = Math.round((percent / 100) * length);
  const empty  = length - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percent.toFixed(1)}%`;
}

async function renderDashboard() {
  const client = await pool.connect();
  try {
    // 1. Fetch Redis live telemetry
    let telemetry = null;
    try {
      telemetry = await cacheGet("doott:verifier:live_telemetry");
    } catch (_) {}

    // 2. Fetch Postgres cache counts
    const cacheRes = await client.query(`
      SELECT 
        COUNT(*) AS total_cached,
        COUNT(*) FILTER (WHERE state = 'deliverable') AS deliverable,
        COUNT(*) FILTER (WHERE state = 'undeliverable') AS undeliverable,
        COUNT(*) FILTER (WHERE state = 'risky') AS risky,
        COUNT(*) FILTER (WHERE state = 'unknown') AS unknown
      FROM final.email_verifications;
    `);

    const s = cacheRes.rows[0];
    const total = Number(s.total_cached) || 1;
    const deliverable = Number(s.deliverable);
    const undeliverable = Number(s.undeliverable);
    const risky = Number(s.risky);
    const unknown = Number(s.unknown);

    const delivPct = (deliverable / total) * 100;
    const undelivPct = (undeliverable / total) * 100;
    const riskyPct = (risky / total) * 100;

    const state = loadStateFile();
    const recentLogs = telemetry?.recentLogs || [];

    console.clear();
    console.log("===============================================================================");
    console.log(" ⚡ DOOTT LIVE REAL-TIME EMAIL VERIFICATION DASHBOARD ⚡");
    console.log("===============================================================================");
    console.log(` Status: RUNNING (Resumable Pipeline Active)  |  Time: ${new Date().toLocaleTimeString()}`);
    console.log(` Database: Neon PostgreSQL                    |  Redis Stream: Active`);
    console.log("===============================================================================\n");

    console.log("📊 DELIVERABILITY BREAKDOWN (final.email_verifications):");
    console.log(` • Total Verified & Cached:  ${total.toLocaleString()}`);
    console.log(` • Deliverable (✅):        ${deliverable.toLocaleString().padStart(8)}  ${renderProgressBar(delivPct)}`);
    console.log(` • Undeliverable (❌):       ${undeliverable.toLocaleString().padStart(8)}  ${renderProgressBar(undelivPct)}`);
    console.log(` • Risky / Catch-All (⚠️):   ${risky.toLocaleString().padStart(8)}  ${renderProgressBar(riskyPct)}`);
    console.log(` • Unknown / Timeout (❓):   ${unknown.toLocaleString().padStart(8)}\n`);

    if (state) {
      console.log("📌 RESUME CHECKPOINT CURSORS:");
      console.log(` • People Last UUID:        ${state.people_last_uuid}`);
      console.log(` • Companies Last UUID:     ${state.companies_last_uuid}`);
      console.log(` • Total People Verified:   ${Number(state.total_people_verified).toLocaleString()}`);
      console.log(` • Total Companies Verified:${Number(state.total_companies_verified).toLocaleString()}\n`);
    }

    console.log("===============================================================================");
    console.log("📡 LIVE VERIFICATION STREAM (Recent 8 Probes):");
    console.log("===============================================================================");

    if (recentLogs.length === 0) {
      console.log("  Waiting for active stream packets...\n");
    } else {
      for (const log of recentLogs.slice(0, 8)) {
        const badge = log.status === "deliverable" ? "✅ DELIVERABLE"
                    : log.status === "undeliverable" ? "❌ UNDELIVERABLE"
                    : log.status === "risky" ? "⚠️ RISKY" : "❓ UNKNOWN";
        
        console.log(` [${log.timestamp}] [${log.type.padEnd(7)}] ${log.email.padEnd(38)} ${badge.padEnd(16)} (score=${log.score}, ${log.durationMs}ms)`);
      }
      console.log("");
    }

    console.log("===============================================================================");
    console.log("Press Ctrl+C to exit monitor. Pipeline will continue running in background.");

  } finally {
    client.release();
  }
}

async function startDashboardLoop() {
  while (true) {
    await renderDashboard().catch(err => console.error("Dashboard error:", err.message));
    await new Promise(r => setTimeout(r, 1000));
  }
}

startDashboardLoop().catch(err => {
  console.error("Fatal Dashboard Error:", err);
  process.exit(1);
});
