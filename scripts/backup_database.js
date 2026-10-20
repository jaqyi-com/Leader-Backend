"use strict";

/**
 * ==============================================================================
 * DOOTT — NEON POSTGRESQL LIVE BACKUP MONITOR
 * ==============================================================================
 * Features:
 *   - Backs up 100% of all schemas (neon_auth, final, staging, public)
 *   - Backs up all vector embeddings, HNSW indexes, constraints, and tables
 *   - Live Terminal Dashboard (Speed MB/s, Elapsed Time, File Size, ETA)
 *   - Output is a portable PostgreSQL Custom Archive (.dump)
 *   - Generates instant 1-command restore script for ANY PostgreSQL database
 *
 * Usage:
 *   node scripts/backup_database.js
 *   node scripts/backup_database.js --full
 *   node scripts/backup_database.js --schema=neon_auth
 *   node scripts/backup_database.js --schema=final
 *   node scripts/backup_database.js --fast (excludes 45M people table for quick 5-min backup)
 * ==============================================================================
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Configuration
const NEON_URL = process.env.NEON_DIRECT_URL || process.env.NEON_DATABASE_URL;

if (!NEON_URL) {
  console.error("\x1b[31m[ERROR] NEON_DATABASE_URL or NEON_DIRECT_URL not found in .env\x1b[0m");
  process.exit(1);
}

// Parse CLI Arguments
const args = process.argv.slice(2);
const isFast = args.includes("--fast");
const schemaArg = args.find((a) => a.startsWith("--schema="))?.split("=")[1];

// Determine backup directory and filename
const BACKUP_DIR = path.resolve(process.cwd(), "backups");
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
let backupFileName = `neondb_full_${timestamp}.dump`;
if (isFast) backupFileName = `neondb_fast_no_people_${timestamp}.dump`;
if (schemaArg) backupFileName = `neondb_schema_${schemaArg}_${timestamp}.dump`;

const backupFilePath = path.join(BACKUP_DIR, backupFileName);

// Prepare pg_dump arguments
const pgDumpArgs = [
  "--dbname=" + NEON_URL,
  "--format=custom",
  "--compress=6",
  "--no-owner",
  "--no-privileges",
  "--verbose",
  "--file=" + backupFilePath,
];

if (isFast) {
  pgDumpArgs.push("--exclude-table=final.people");
} else if (schemaArg) {
  pgDumpArgs.push(`--schema=${schemaArg}`);
} else {
  // Full backup includes custom schemas
  pgDumpArgs.push("--schema=neon_auth");
  pgDumpArgs.push("--schema=final");
  pgDumpArgs.push("--schema=staging");
  pgDumpArgs.push("--schema=public");
}

console.clear();
console.log("\x1b[1m\x1b[36m========================================================================\x1b[0m");
console.log("\x1b[1m\x1b[32m           DOOTT NEON POSTGRESQL LIVE BACKUP ENGINE            \x1b[0m");
console.log("\x1b[1m\x1b[36m========================================================================\x1b[0m");
console.log(`\x1b[90mTarget File : \x1b[37m${backupFilePath}\x1b[0m`);
console.log(`\x1b[90mMode        : \x1b[33m${isFast ? "Fast Backup (Excludes 45M People)" : schemaArg ? `Schema: ${schemaArg}` : "Full 100% Database (All Schemas + Auth + Tables + Vectors)"}\x1b[0m`);
console.log(`\x1b[90mFormat      : \x1b[32mPostgreSQL Custom Archive (.dump) [Compressed + Portable]\x1b[0m`);
console.log("\x1b[1m\x1b[36m------------------------------------------------------------------------\x1b[0m");
console.log("\x1b[33mStarting dump process...\x1b[0m\n");

const startTime = Date.now();
let lastBytes = 0;
let lastTime = Date.now();
let currentSpeedMBs = 0;
let currentActivity = "Initializing connection to Neon compute...";

// Find pg_dump path
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

const child = spawn(pgDumpBinary, pgDumpArgs, {
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});

// Format Helper
function formatBytes(bytes) {
  if (bytes === 0) return "0.00 MB";
  if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const remMins = minutes % 60;
    return `${hours}h ${remMins}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

// Read stderr from pg_dump for live table activities
child.stderr.on("data", (data) => {
  const line = data.toString().trim();
  if (line.includes("dumping contents of table")) {
    const match = line.match(/dumping contents of table "([^"]+)"\."([^"]+)"/);
    if (match) {
      currentActivity = `Dumping table: \x1b[1m\x1b[32m${match[1]}.${match[2]}\x1b[0m`;
    }
  } else if (line.includes("saving") || line.includes("reading") || line.includes("creating")) {
    currentActivity = line.slice(line.indexOf(":") + 1).trim();
  }
});

// Live Terminal UI Interval
const monitorInterval = setInterval(() => {
  let fileSize = 0;
  try {
    if (fs.existsSync(backupFilePath)) {
      fileSize = fs.statSync(backupFilePath).size;
    }
  } catch (_e) {}

  const now = Date.now();
  const timeDiff = (now - lastTime) / 1000;
  if (timeDiff >= 1) {
    currentSpeedMBs = ((fileSize - lastBytes) / (1024 * 1024)) / timeDiff;
    lastBytes = fileSize;
    lastTime = now;
  }

  const elapsed = now - startTime;

  // Move cursor up & redraw
  process.stdout.write("\x1b[s"); // Save cursor position
  process.stdout.write(`
\x1b[1m\x1b[34m[STATUS MONITOR]\x1b[0m
  ⏱️  \x1b[1mElapsed Time   :\x1b[0m \x1b[36m${formatDuration(elapsed)}\x1b[0m
  💾 \x1b[1mDownloaded Size:\x1b[0m \x1b[32m\x1b[1m${formatBytes(fileSize)}\x1b[0m
  ⚡ \x1b[1mTransfer Speed :\x1b[0m \x1b[33m${currentSpeedMBs.toFixed(2)} MB/s\x1b[0m
  🔍 \x1b[1mCurrent Action :\x1b[0m ${currentActivity}
  📁 \x1b[1mOutput File    :\x1b[0m \x1b[90m${backupFileName}\x1b[0m
\x1b[90m------------------------------------------------------------------------\x1b[0m
  \x1b[90mPress Ctrl+C anytime to cancel.\x1b[0m
`);
  process.stdout.write("\x1b[u"); // Restore cursor position
}, 800);

// Handle Process Completion
child.on("close", (code) => {
  clearInterval(monitorInterval);
  const totalElapsed = Date.now() - startTime;
  let finalSize = 0;
  try {
    if (fs.existsSync(backupFilePath)) {
      finalSize = fs.statSync(backupFilePath).size;
    }
  } catch (_e) {}

  console.clear();
  if (code === 0) {
    console.log("\x1b[1m\x1b[32m========================================================================\x1b[0m");
    console.log("\x1b[1m\x1b[32m              🎉 BACKUP COMPLETED SUCCESSFULLY!                         \x1b[0m");
    console.log("\x1b[1m\x1b[32m========================================================================\x1b[0m");
    console.log(`\x1b[1m📁 Backup File     :\x1b[0m \x1b[37m${backupFilePath}\x1b[0m`);
    console.log(`\x1b[1m💾 Total Dump Size :\x1b[0m \x1b[32m${formatBytes(finalSize)}\x1b[0m`);
    console.log(`\x1b[1m⏱️ Total Time Taken:\x1b[0m \x1b[36m${formatDuration(totalElapsed)}\x1b[0m`);
    console.log("\x1b[1m\x1b[36m------------------------------------------------------------------------\x1b[0m");
    
    // Create companion restore script
    const restoreScriptPath = path.join(BACKUP_DIR, `restore_${timestamp}.sh`);
    const restoreScriptContent = `#!/bin/bash
# ==============================================================================
# RESTORE SCRIPT FOR: ${backupFileName}
# ==============================================================================
# Usage:
#   ./restore_${timestamp}.sh "TARGET_POSTGRESQL_CONNECTION_STRING"
# ==============================================================================

TARGET_DB="$1"

if [ -z "$TARGET_DB" ]; then
  echo "Error: Please provide target PostgreSQL connection string."
  echo "Usage: ./restore_${timestamp}.sh \"postgres://user:pass@host:5432/dbname\""
  exit 1
fi

echo "=================================================================="
echo "Restoring database backup into target database..."
echo "Backup File: ${backupFilePath}"
echo "=================================================================="

# 1. Enable Vector & UUID extensions in target DB
psql "$TARGET_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql "$TARGET_DB" -c "CREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\";"

# 2. Parallel restore
pg_restore \\
  --dbname="$TARGET_DB" \\
  --clean \\
  --if-exists \\
  --no-owner \\
  --no-privileges \\
  --jobs=4 \\
  "${backupFilePath}"

echo "=================================================================="
echo "Restore completed!"
echo "=================================================================="
`;
    fs.writeFileSync(restoreScriptPath, restoreScriptContent, { mode: 0o755 });

    console.log("\n\x1b[1m\x1b[33m🚀 HOW TO RESTORE THIS BACKUP TO ANY OTHER POSTGRESQL DATABASE:\x1b[0m");
    console.log("\x1b[37mOption 1: Using the generated 1-click restore script:\x1b[0m");
    console.log(`  \x1b[36m${restoreScriptPath} "YOUR_NEW_POSTGRES_URL"\x1b[0m\n`);
    console.log("\x1b[37mOption 2: Direct pg_restore command:\x1b[0m");
    console.log(`  \x1b[36mpg_restore --dbname="YOUR_NEW_POSTGRES_URL" --clean --if-exists --no-owner --no-privileges --jobs=4 "${backupFilePath}"\x1b[0m\n`);
    console.log("\x1b[1m\x1b[32m========================================================================\x1b[0m\n");
  } else {
    console.log("\x1b[1m\x1b[31m========================================================================\x1b[0m");
    console.log(`\x1b[1m\x1b[31m❌ Backup failed with exit code ${code}\x1b[0m`);
    console.log("\x1b[1m\x1b[31m========================================================================\x1b[0m");
  }
});

child.on("error", (err) => {
  clearInterval(monitorInterval);
  console.error(`\x1b[31m[ERROR] Failed to start pg_dump: ${err.message}\x1b[0m`);
});
