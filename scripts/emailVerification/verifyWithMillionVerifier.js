"use strict";
require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { createObjectCsvStringifier } = require("csv-writer");
const pLimitRaw = require("p-limit");
const pLimit = typeof pLimitRaw === "function" ? pLimitRaw : (pLimitRaw.default || pLimitRaw);

const { verifyEmail, getCredits } = require("../../src/services/emailVerification/millionVerifier");

const FILE_1 = "/Volumes/akshat/LeadGenerator/USA_Accounting_Partners_1-10_Headcount.csv";
const FILE_2 = "/Volumes/akshat/LeadGenerator/USA_Accounting_Partners_11-50_Headcount.csv";
const OUTPUT_FILE = "/Volumes/akshat/LeadGenerator/USA_Accounting_Partners_100pct_MillionVerified.csv";

const limiter = pLimit(10); // 10 parallel requests to MillionVerifier

async function main() {
  console.log("=========================================================================");
  console.log(" 🚀 MILLIONVERIFIER DEEP VERIFICATION FOR USA ACCOUNTING PARTNERS        ");
  console.log("=========================================================================");

  // 1. Check Available Credits
  const creditInfo = await getCredits();
  const availableCredits = creditInfo.credits || 0;
  console.log(`[MillionVerifier] Available Credits: ${availableCredits}`);

  if (availableCredits <= 0) {
    console.error("❌ No credits remaining on MillionVerifier account.");
    return;
  }

  // Load records from Sheet 1 and Sheet 2
  const r1 = parse(fs.readFileSync(FILE_1, "utf8"), { columns: true, skip_empty_lines: true, trim: true });
  const r2 = parse(fs.readFileSync(FILE_2, "utf8"), { columns: true, skip_empty_lines: true, trim: true });

  console.log(`[Loaded] Sheet 1 (1-10): ${r1.length} records | Sheet 2 (11-50): ${r2.length} records`);

  // We will test up to available credits (divided equally between both sheets)
  const perSheet = Math.floor(availableCredits / 2);
  const selected1 = r1.slice(0, perSheet);
  const selected2 = r2.slice(0, availableCredits - perSheet);

  const testQueue = [
    ...selected1.map(r => ({ ...r, source_tier: "1-10" })),
    ...selected2.map(r => ({ ...r, source_tier: "11-50" }))
  ];

  console.log(`\n🔍 Verifying ${testQueue.length} top leads with MillionVerifier real-time API...`);

  const results = {
    ok: 0,
    invalid: 0,
    catch_all: 0,
    disposable: 0,
    unknown: 0
  };

  const verifiedLeads = [];
  let processed = 0;

  const tasks = testQueue.map(record => {
    return limiter(async () => {
      const email = record["Verified Email"] || record.email || "";
      const res = await verifyEmail(email);

      processed++;
      const resType = res.result || "unknown";
      if (results[resType] !== undefined) {
        results[resType]++;
      } else {
        results.unknown++;
      }

      record["mv_result"] = res.result || "";
      record["mv_quality"] = res.quality || "";
      record["mv_subresult"] = res.subresult || "";
      record["mv_is_valid"] = res.isValid ? "true" : "false";

      if (res.isValid) {
        verifiedLeads.push(record);
      }

      if (processed % 25 === 0 || processed === testQueue.length) {
        console.log(`[Progress] ${processed}/${testQueue.length} (${((processed / testQueue.length) * 100).toFixed(0)}%) | Valid (OK): ${results.ok} | Catch-All: ${results.catch_all} | Invalid: ${results.invalid}`);
      }
    });
  });

  await Promise.all(tasks);

  console.log("\n=========================================================================");
  console.log("                      VERIFICATION BREAKDOWN                             ");
  console.log("=========================================================================");
  console.log(`  • Total Tested : ${testQueue.length}`);
  console.log(`  • ✅ Valid (OK / Deliverable) : ${results.ok} (${((results.ok / testQueue.length) * 100).toFixed(1)}%)`);
  console.log(`  • ⚠️ Catch-All (Risky)        : ${results.catch_all} (${((results.catch_all / testQueue.length) * 100).toFixed(1)}%)`);
  console.log(`  • ❌ Invalid (No Mailbox)      : ${results.invalid} (${((results.invalid / testQueue.length) * 100).toFixed(1)}%)`);
  console.log(`  • ❓ Unknown / Other          : ${results.unknown + results.disposable}`);

  // Save 100% OK verified leads to new dedicated CSV
  if (verifiedLeads.length > 0) {
    const headers = Object.keys(verifiedLeads[0]);
    const stringifier = createObjectCsvStringifier({ header: headers.map(h => ({ id: h, title: h })) });
    fs.writeFileSync(OUTPUT_FILE, stringifier.getHeaderString() + stringifier.stringifyRecords(verifiedLeads), "utf8");
    console.log(`\n🎉 Saved 100% MillionVerifier-Approved Leads to: ${OUTPUT_FILE} (${verifiedLeads.length} pristine leads)`);
  }

  const remaining = await getCredits();
  console.log(`[MillionVerifier] Remaining Credits: ${remaining.credits}`);
  console.log("=========================================================================");
}

main().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
