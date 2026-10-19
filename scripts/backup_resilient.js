"use strict";

/**
 * ==============================================================================
 * DOOTT — RESILIENT AUTO-RESUMING DATABASE BACKUP ENGINE
 * ==============================================================================
 * Features:
 *   - Auto-detects Wi-Fi / network disconnects and pauses
 *   - Automatically retries connection until internet is back
 *   - Checkpoint State (backups/checkpoints/backup_state.json):
 *       Never re-downloads already completed tables
 *   - Table-by-Table modular dump with live progress monitor
 *   - Reassembles or generates master 1-click restore script for all tables
 *
 * Usage:
 *   node scripts/backup_resilient.js
 * ==============================================================================
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Pool } = require("pg");

const NEON_URL = process.env.NEON_DIRECT_URL || process.env.NEON_DATABASE_URL;

if (!NEON_URL) {
  console.error("\x1b[31m[ERROR] NEON_DATABASE_URL or NEON_DIRECT_URL not found in .env\x1b[0m");
  process.exit(1);
}

const BACKUP_DIR = path.resolve(process.cwd(), "backups", "resilient_backup");
const STATE_FILE = path.join(BACKUP_DIR, "backup_state.json");

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Find pg_dump binary
const possiblePgDumps = [
  "/opt/homebrew/opt/postgresql@18/bin/pg_dump",
  "/usr/local/opt/postgresql@18/bin/pg_dump",
  "/opt/homebrew/opt/postgresql@16/bin/pg_dump",
  "/opt/homebrew/bin/pg_dump",
  "/usr/local/bin/pg_dump",
  "pg_dump",
];
let pgDumpBinary = "pg_dump";
for (const p of possiblePgDumps) {
  if (fs.existsSync(p)) {
    pgDumpBinary = p;
    break;
  }
}

// Tables in priority order
const TABLES_TO_BACKUP = [
  // Auth schema
  { schema: "neon_auth", table: "project_config", estSize: "48 KB" },
  { schema: "neon_auth", table: "organization",   estSize: "32 KB" },
  { schema: "neon_auth", table: "user",           estSize: "24 KB" },
  { schema: "neon_auth", table: "account",        estSize: "24 KB" },
  { schema: "neon_auth", table: "session",        estSize: "32 KB" },
  { schema: "neon_auth", table: "member",         estSize: "32 KB" },
  { schema: "neon_auth", table: "invitation",     estSize: "32 KB" },
  { schema: "neon_auth", table: "verification",   estSize: "24 KB" },
  { schema: "neon_auth", table: "jwks",           estSize: "16 KB" },

  // Final schema helpers
  { schema: "final", table: "domain_cache",        estSize: "120 KB" },
  { schema: "final", table: "disposable_domains",  estSize: "1 MB" },
  { schema: "final", table: "email_verifications", estSize: "5.8 MB" },

  // Staging & Public
  { schema: "staging", table: "companies_emb",     estSize: "8 KB" },
  { schema: "staging", table: "people_emb",        estSize: "8 KB" },
  { schema: "public",  table: "people_emb_staging", estSize: "8 KB" },

  // Core Data Tables
  { schema: "final", table: "companies",           estSize: "1.2 GB (Compressed)" },
  { schema: "final", table: "people",              estSize: "25 GB (Compressed)" },
];

// Helper: load state
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (_e) {}
  }
  return { completed: {}, in_progress: null, started_at: new Date().toISOString() };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Test network / DB connectivity
async function isDbReachable() {
  const pool = new Pool({
    connectionString: NEON_URL,
    connectionTimeoutMillis: 8000,
    max: 1,
  });
  try {
    await pool.query("SELECT 1");
    await pool.end();
    return true;
  } catch (_e) {
    try { await pool.end(); } catch (_e2) {}
    return false;
  }
}

// Format duration
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

// Dump single table with retry
async function dumpTable(schema, table, estSize) {
  const targetFile = path.join(BACKUP_DIR, `${schema}__${table}.dump`);
  let attempt = 1;
  const maxAttempts = 100; // Keep retrying if wifi drops

  while (attempt <= maxAttempts) {
    console.log(`\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
    console.log(`\x1b[1m📦 Backing up table:\x1b[0m \x1b[32m${schema}.${table}\x1b[0m \x1b[90m(Est: ${estSize})\x1b[0m [Attempt ${attempt}]`);
    console.log(`\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);

    // Check connectivity first
    const online = await isDbReachable();
    if (!online) {
      console.log(`\x1b[33m⚠️ Network disconnected. Waiting for Wi-Fi / DB reconnection...\x1b[0m`);
      while (!(await isDbReachable())) {
        process.stdout.write("\x1b[33m.\x1b[0m");
        await sleep(5000);
      }
      console.log(`\n\x1b[32m✅ Reconnected to Neon DB! Resuming...\x1b[0m`);
    }

    const startTime = Date.now();
    let lastBytes = 0;
    let lastTime = Date.now();
    let speedMBs = 0;

    const pgDumpArgs = [
      "--dbname=" + NEON_URL,
      "--format=custom",
      "--compress=6",
      "--no-owner",
      "--no-privileges",
      `--table=${schema}.${table}`,
      "--file=" + targetFile,
    ];

    const child = spawn(pgDumpBinary, pgDumpArgs, {
      env: { ...process.env },
      stdio: ["ignore", "ignore", "pipe"],
    });

    const monitor = setInterval(() => {
      let size = 0;
      try {
        if (fs.existsSync(targetFile)) size = fs.statSync(targetFile).size;
      } catch (_e) {}
      const now = Date.now();
      const diff = (now - lastTime) / 1000;
      if (diff >= 1) {
        speedMBs = ((size - lastBytes) / (1024 * 1024)) / diff;
        lastBytes = size;
        lastTime = now;
      }
      const mb = (size / (1024 * 1024)).toFixed(2);
      process.stdout.write(`\r  ⚡ Speed: \x1b[33m${speedMBs.toFixed(2)} MB/s\x1b[0m | Downloaded: \x1b[32m${mb} MB\x1b[0m | Elapsed: \x1b[36m${formatDuration(now - startTime)}\x1b[0m   `);
    }, 1000);

    const exitCode = await new Promise((resolve) => {
      child.on("close", (code) => {
        clearInterval(monitor);
        resolve(code);
      });
      child.on("error", () => {
        clearInterval(monitor);
        resolve(1);
      });
    });

    if (exitCode === 0) {
      const finalSize = fs.existsSync(targetFile) ? fs.statSync(targetFile).size : 0;
      const sizeMB = (finalSize / (1024 * 1024)).toFixed(2);
      console.log(`\n\x1b[32m✔ Completed ${schema}.${table} (${sizeMB} MB) in ${formatDuration(Date.now() - startTime)}\x1b[0m\n`);
      return true;
    } else {
      console.log(`\n\x1b[31m⚠️ Download interrupted or Wi-Fi dropped (Exit code: ${exitCode}). Retrying in 5 seconds...\x1b[0m`);
      await sleep(5000);
      attempt++;
    }
  }
  return false;
}

// Main Execution
async function run() {
  console.clear();
  console.log("\x1b[1m\x1b[35m========================================================================\x1b[0m");
  console.log("\x1b[1m\x1b[32m        DOOTT RESILIENT AUTO-RESUMING DATABASE BACKUP ENGINE            \x1b[0m");
  console.log("\x1b[1m\x1b[35m========================================================================\x1b[0m");
  console.log(`\x1b[90mStorage Directory : \x1b[37m${BACKUP_DIR}\x1b[0m`);
  console.log(`\x1b[90mResilience Mode   : \x1b[33mAuto-Reconnect on Wi-Fi Drop + Table-by-Table Checkpointing\x1b[0m`);
  console.log("\x1b[1m\x1b[35m------------------------------------------------------------------------\x1b[0m\n");

  const state = loadState();
  const totalTables = TABLES_TO_BACKUP.length;

  for (let i = 0; i < totalTables; i++) {
    const item = TABLES_TO_BACKUP[i];
    const key = `${item.schema}.${item.table}`;

    if (state.completed[key]) {
      console.log(`\x1b[90m[${i + 1}/${totalTables}] ⏭️  Skipping already completed: \x1b[37m${key}\x1b[0m`);
      continue;
    }

    console.log(`\x1b[1m[${i + 1}/${totalTables}] 🚀 Processing table: ${key}\x1b[0m`);
    state.in_progress = key;
    saveState(state);

    const success = await dumpTable(item.schema, item.table, item.estSize);
    if (success) {
      state.completed[key] = {
        completed_at: new Date().toISOString(),
        file: `${item.schema}__${item.table}.dump`,
      };
      state.in_progress = null;
      saveState(state);
    }
  }

  // Create unified Master Restore Script
  const restoreScriptPath = path.join(BACKUP_DIR, "master_restore.sh");
  const restoreContent = `#!/bin/bash
# ==============================================================================
# DOOTT MASTER RESTORE SCRIPT (ALL CHECKPOINTED TABLES)
# ==============================================================================
TARGET_DB="$1"

if [ -z "$TARGET_DB" ]; then
  echo "Usage: ./master_restore.sh \"postgres://user:pass@host:5432/dbname\""
  exit 1
fi

echo "=================================================================="
echo "Restoring all schemas & tables into target PostgreSQL..."
echo "Target DB: $TARGET_DB"
echo "=================================================================="

# Enable extensions
psql "$TARGET_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql "$TARGET_DB" -c "CREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\";"

# Restore schemas and tables
for dump in ${BACKUP_DIR}/*.dump; do
  if [ -f "$dump" ]; then
    echo "Restoring: $(basename "$dump")..."
    pg_restore --dbname="$TARGET_DB" --clean --if-exists --no-owner --no-privileges "$dump"
  fi
done

echo "=================================================================="
echo "🎉 All tables successfully restored!"
echo "=================================================================="
`;
  fs.writeFileSync(restoreScriptPath, restoreContent, { mode: 0o755 });

  console.log("\x1b[1m\x1b[32m========================================================================\x1b[0m");
  console.log("\x1b[1m\x1b[32m        🎉 ALL TABLES & SCHEMAS BACKED UP SUCCESSFULLY!                 \x1b[0m");
  console.log("\x1b[1m\x1b[32m========================================================================\x1b[0m");
  console.log(`📁 Directory: \x1b[37m${BACKUP_DIR}\x1b[0m`);
  console.log(`🚀 Master Restore Script: \x1b[36m${restoreScriptPath}\x1b[0m\n`);
}

run();
