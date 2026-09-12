"use strict";
require("dotenv").config();

const {
  verifyEmail,
  validateSyntax,
  suggestDomainCorrection,
  resolveDomainExistence,
  resolveMxRecords,
  isDisposableDomain,
  isRoleAddress,
  startBulkVerification,
  getBatchJob,
  generateResultCsv
} = require("../../src/services/emailVerification");
const { closePool } = require("../../src/db/cloudSql");

async function runTests() {
  console.log("================================================================");
  console.log("   DOOTT EMAIL VERIFICATION ENGINE — END-TO-END TEST SUITE      ");
  console.log("================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, testName, details = "") {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName} ${details ? `(${details})` : ""}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ""}`);
    }
  }

  // -------------------------------------------------------------
  // TEST 1: STAGE 1 SYNTAX & TYPO CORRECTION
  // -------------------------------------------------------------
  console.log("--- 1. Testing Stage 1: Syntax & Levenshtein Typo Correction ---");
  const typo1 = validateSyntax("alex@gmial.com");
  assert(typo1.valid === true, "Valid syntax for alex@gmial.com");
  assert(typo1.typoSuggestion === "alex@gmail.com", "Levenshtein caught gmial.com -> gmail.com", typo1.typoSuggestion);

  const typo2 = validateSyntax("user@outlok.com");
  assert(typo2.typoSuggestion === "user@outlook.com", "Levenshtein caught outlok.com -> outlook.com", typo2.typoSuggestion);

  const typo3 = validateSyntax("user@hotmial.com");
  assert(typo3.typoSuggestion === "user@hotmail.com", "Levenshtein caught hotmial.com -> hotmail.com", typo3.typoSuggestion);

  const invalidSyntax = validateSyntax("invalid..syntax@domain.com");
  assert(invalidSyntax.valid === false, "Consecutive dots rejected in local part");

  const invalidSyntax2 = validateSyntax("missingdomain@");
  assert(invalidSyntax2.valid === false, "Missing domain rejected");

  // -------------------------------------------------------------
  // TEST 2: STAGE 2 DOMAIN RESOLUTION
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing Stage 2: DNS A/AAAA Domain Existence ---");
  const domainGood = await resolveDomainExistence("google.com");
  assert(domainGood.valid === true && domainGood.ips.length > 0, "google.com resolves IPs", `${domainGood.ips.length} IPs`);

  const domainFake = await resolveDomainExistence("thisdomainreallydoesnotexist999238472.com");
  assert(domainFake.valid === false, "Fake domain correctly reported as non-existent");

  // -------------------------------------------------------------
  // TEST 3: STAGE 3 MX LOOKUP
  // -------------------------------------------------------------
  console.log("\n--- 3. Testing Stage 3: MX Records & Priority Sorting ---");
  const mxGood = await resolveMxRecords("stripe.com");
  assert(mxGood.valid === true && mxGood.mxRecords.length > 0, "stripe.com has active MX records", `Primary MX: ${mxGood.primaryMx}`);

  // -------------------------------------------------------------
  // TEST 4: STAGE 4 DISPOSABLE DOMAIN CHECK
  // -------------------------------------------------------------
  console.log("\n--- 4. Testing Stage 4: Disposable Domain Detection ---");
  const disp1 = await isDisposableDomain("mailinator.com");
  assert(disp1 === true, "mailinator.com flagged as disposable");

  const disp2 = await isDisposableDomain("10minutemail.com");
  assert(disp2 === true, "10minutemail.com flagged as disposable");

  const disp3 = await isDisposableDomain("google.com");
  assert(disp3 === false, "google.com NOT flagged as disposable");

  // -------------------------------------------------------------
  // TEST 5: STAGE 5 ROLE ADDRESS DETECTION
  // -------------------------------------------------------------
  console.log("\n--- 5. Testing Stage 5: Role-Address Detection ---");
  assert(isRoleAddress("admin") === true, "admin is role address");
  assert(isRoleAddress("support.team") === true, "support.team is role address");
  assert(isRoleAddress("billing") === true, "billing is role address");
  assert(isRoleAddress("john.smith") === false, "john.smith is NOT role address");

  // -------------------------------------------------------------
  // TEST 6: FULL PIPELINE END-TO-END VERDICT & COMPOSITE SCORING
  // -------------------------------------------------------------
  console.log("\n--- 6. Testing Full Pipeline Verification & Scoring ---");
  
  // A. Valid Business Email
  const resValid = await verifyEmail("press@stripe.com", { forceRefresh: true });
  console.log("Result (press@stripe.com):", JSON.stringify(resValid, null, 2));
  assert(resValid.state === "deliverable", "press@stripe.com is deliverable");
  assert(resValid.score >= 0.70, `Score is high (${resValid.score})`);
  assert(resValid.role_address === true, "press is flagged as role_address");

  // B. Disposable Email
  const resDisp = await verifyEmail("testing123@mailinator.com", { forceRefresh: true });
  assert(resDisp.state === "risky", "mailinator.com is marked risky");
  assert(resDisp.disposable === true, "disposable is true");
  assert(resDisp.score === 0.20, `Score is 0.20 for disposable (${resDisp.score})`);

  // C. Non-existent Domain
  const resBadDomain = await verifyEmail("user@nonexistent9992384792.org", { forceRefresh: true });
  assert(resBadDomain.state === "undeliverable", "nonexistent domain is undeliverable");
  assert(resBadDomain.score === 0.0, "Score is 0.0 for dead domain");

  // D. Invalid Syntax
  const resBadSyntax = await verifyEmail("bad.email@@invalid..com", { forceRefresh: true });
  assert(resBadSyntax.state === "undeliverable", "bad syntax is undeliverable");
  assert(resBadSyntax.syntax_valid === false, "syntax_valid is false");

  // -------------------------------------------------------------
  // TEST 7: BATCH PROCESSING & CSV EXPORT
  // -------------------------------------------------------------
  console.log("\n--- 7. Testing Batch CSV Processing & Export ---");
  const testCsv = `full_name,company,email
John Doe,Stripe,contact@stripe.com
Fake Guy,Trash,throwaway@mailinator.com
Bad Guy,DeadDomain,user@notrealdomain992384.com
Sales Lead,Apple,sales@apple.com`;

  const jobInfo = startBulkVerification(testCsv, { fileName: "test_batch.csv", forceRefresh: true });
  assert(Boolean(jobInfo.jobId), `Batch job created with ID: ${jobInfo.jobId}`);

  // Wait for background job to finish
  let job = getBatchJob(jobInfo.jobId);
  while (job && job.status === "processing" || job.status === "queued") {
    await new Promise(r => setTimeout(r, 200));
    job = getBatchJob(jobInfo.jobId);
  }

  assert(job.status === "completed", "Batch job completed successfully");
  assert(job.processed === 4, "All 4 rows processed");
  console.log("Batch Counts:", job.counts);

  const exportedCsv = generateResultCsv(jobInfo.jobId);
  assert(exportedCsv.includes("verification_state"), "CSV contains verification_state column");
  assert(exportedCsv.includes("verification_score"), "CSV contains verification_score column");

  console.log("\n================================================================");
  console.log(`   TEST SUMMARY: ${passed} / ${total} ASSERTIONS PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log("================================================================\n");

  await closePool();
}

if (require.main === module) {
  runTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}

module.exports = { runTests };
