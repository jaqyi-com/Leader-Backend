"use strict";
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { query, closePool } = require("../../src/db/cloudSql");

async function runMigration() {
  console.log("==================================================");
  console.log("   RUNNING EMAIL VERIFICATION ENGINE MIGRATION    ");
  console.log("==================================================");

  try {
    const sqlPath = path.join(__dirname, "../../src/db/migrations/create_email_verification_tables.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    console.log("[Migration] Executing SQL against Postgres...");
    await query(sql);
    console.log("[Migration] ✅ Successfully created/verified tables in schema 'final':");
    console.log("  - final.email_verifications");
    console.log("  - final.disposable_domains");
    console.log("  - final.domain_cache");
  } catch (err) {
    console.error("[Migration] ❌ Error executing migration:", err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
