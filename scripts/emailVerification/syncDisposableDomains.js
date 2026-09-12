"use strict";
require("dotenv").config();
const { syncDisposableDomainsFromGitHub } = require("../../src/services/emailVerification/disposableDetector");
const { closePool } = require("../../src/db/cloudSql");

async function main() {
  console.log("==================================================");
  console.log("   SYNCING DISPOSABLE EMAIL DOMAINS FROM GITHUB   ");
  console.log("==================================================");

  try {
    const result = await syncDisposableDomainsFromGitHub();
    console.log("[Sync] Result:", result);
  } catch (err) {
    console.error("[Sync] ❌ Failed to sync disposable domains:", err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
