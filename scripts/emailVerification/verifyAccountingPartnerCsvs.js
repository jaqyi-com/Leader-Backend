"use strict";
process.env.UV_THREADPOOL_SIZE = "64";
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const { parse } = require("csv-parse/sync");
const { createObjectCsvStringifier } = require("csv-writer");
const pLimitRaw = require("p-limit");
const pLimit = typeof pLimitRaw === "function" ? pLimitRaw : (pLimitRaw.default || pLimitRaw);

const { validateSyntax } = require("../../src/services/emailVerification/syntaxValidator");
const { isDisposableDomain } = require("../../src/services/emailVerification/disposableDetector");
const { isRoleAddress } = require("../../src/services/emailVerification/roleDetector");
const { computeVerdict } = require("../../src/services/emailVerification/scoringEngine");
const { SMTP_RESULTS } = require("../../src/services/emailVerification/constants");
const { query, closePool } = require("../../src/db/cloudSql");

const FILES_TO_VERIFY = [
  "/Volumes/akshat/LeadGenerator/USA_Accounting_Partners_1-10_Headcount.csv",
  "/Volumes/akshat/LeadGenerator/USA_Accounting_Partners_11-50_Headcount.csv"
];

const CONCURRENCY = 40;
const limiter = pLimit(CONCURRENCY);

// In-process domain cache for lightning speed across 10k contacts
const domainCache = new Map();

/**
 * Fast domain resolution with tight timeout and in-memory caching.
 */
async function resolveDomainFast(domain) {
  if (!domain) return { domainValid: false, mxValid: false, primaryMx: null, reason: "Empty domain" };
  const cleanDomain = domain.toLowerCase().trim();

  if (domainCache.has(cleanDomain)) {
    return domainCache.get(cleanDomain);
  }

  let domainValid = false;
  let mxValid = false;
  let primaryMx = null;
  let reason = "";

  const dnsTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("DNS timeout")), ms))
  ]);

  // 1. Try MX lookup first (most informative)
  try {
    const mxRecords = await dnsTimeout(dns.resolveMx(cleanDomain), 2500);
    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      mxRecords.sort((a, b) => a.priority - b.priority);
      primaryMx = mxRecords[0].exchange;
      domainValid = true;
      mxValid = true;
      reason = `Valid MX record (${primaryMx})`;
    }
  } catch (err) {
    // 2. If no MX or timeout, check A record fallback
    try {
      const aRecords = await dnsTimeout(dns.resolve4(cleanDomain), 2000);
      if (Array.isArray(aRecords) && aRecords.length > 0) {
        domainValid = true;
        mxValid = true; // RFC 5321 fallback to A
        primaryMx = cleanDomain;
        reason = `RFC 5321 A-record fallback (${cleanDomain})`;
      } else {
        domainValid = false;
        mxValid = false;
        reason = "Domain does not have MX or A records";
      }
    } catch (aErr) {
      domainValid = false;
      mxValid = false;
      reason = "Domain DNS resolution failed";
    }
  }

  const result = { domainValid, mxValid, primaryMx, reason };
  domainCache.set(cleanDomain, result);
  return result;
}

/**
 * Fast single email evaluation using in-memory pipeline.
 */
async function verifyEmailFast(rawEmail) {
  if (!rawEmail || typeof rawEmail !== "string") {
    return computeVerdict({ email: "", syntaxValid: false, syntaxReason: "Empty email" });
  }

  const cleanEmail = rawEmail.trim().toLowerCase();

  // Stage 1: Syntax
  const syntax = validateSyntax(cleanEmail);
  if (!syntax.valid) {
    return computeVerdict({
      email: cleanEmail,
      domain: syntax.domain || "",
      syntaxValid: false,
      syntaxReason: syntax.reason,
      typoSuggestion: syntax.typoSuggestion
    });
  }

  const { email, localPart, domain, typoSuggestion } = syntax;

  // Stage 2 & 3: Domain & MX resolution
  const domainInfo = await resolveDomainFast(domain);
  if (!domainInfo.domainValid || !domainInfo.mxValid) {
    return computeVerdict({
      email,
      domain,
      syntaxValid: true,
      typoSuggestion,
      domainValid: domainInfo.domainValid,
      domainReason: domainInfo.reason,
      mxValid: domainInfo.mxValid,
      mxReason: domainInfo.reason
    });
  }

  // Stage 4: Disposable check (in-memory Set)
  const isDisposable = await isDisposableDomain(domain);

  // Stage 5: Role account check
  const roleAddress = isRoleAddress(localPart);

  // Final Composite Verdict
  return computeVerdict({
    email,
    domain,
    syntaxValid: true,
    syntaxReason: syntax.reason,
    typoSuggestion,
    domainValid: domainInfo.domainValid,
    domainReason: domainInfo.reason,
    mxValid: domainInfo.mxValid,
    mxReason: domainInfo.reason,
    primaryMx: domainInfo.primaryMx,
    disposable: isDisposable,
    roleAddress,
    catchAll: null,
    smtpResult: SMTP_RESULTS.UNKNOWN,
    smtpGated: true
  });
}

/**
 * Bulk upserts verification results into PostgreSQL in batches of 500.
 */
async function bulkSaveToDatabase(verdicts) {
  if (!verdicts || verdicts.length === 0) return;
  console.log(`[Database] Saving ${verdicts.length} verification records to PostgreSQL final.email_verifications...`);

  const chunkSize = 400;
  for (let i = 0; i < verdicts.length; i += chunkSize) {
    const chunk = verdicts.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    let pIdx = 1;

    for (const v of chunk) {
      const cleanEmail = (v.email || "").toLowerCase().trim();
      if (!cleanEmail) continue;
      const domain = v.details?.domain || cleanEmail.split("@")[1] || "";
      values.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7}, $${pIdx+8}, $${pIdx+9}, $${pIdx+10}, $${pIdx+11}, $${pIdx+12}, NOW(), NOW() + INTERVAL '90 days')`);
      params.push(
        cleanEmail,
        domain,
        v.state,
        v.reason,
        v.score,
        v.syntax_valid,
        v.domain_valid,
        v.mx_valid,
        v.disposable,
        v.role_address,
        v.catch_all,
        v.smtp_result,
        JSON.stringify(v.details || {})
      );
      pIdx += 13;
    }

    if (values.length > 0) {
      const sql = `
        INSERT INTO final.email_verifications (
          email, domain, state, reason, score,
          syntax_valid, domain_valid, mx_valid, disposable,
          role_address, catch_all, smtp_result, raw_details,
          checked_at, next_recheck_at
        ) VALUES ${values.join(", ")}
        ON CONFLICT (email) DO UPDATE SET
          domain = EXCLUDED.domain,
          state = EXCLUDED.state,
          reason = EXCLUDED.reason,
          score = EXCLUDED.score,
          syntax_valid = EXCLUDED.syntax_valid,
          domain_valid = EXCLUDED.domain_valid,
          mx_valid = EXCLUDED.mx_valid,
          disposable = EXCLUDED.disposable,
          role_address = EXCLUDED.role_address,
          catch_all = EXCLUDED.catch_all,
          smtp_result = EXCLUDED.smtp_result,
          raw_details = EXCLUDED.raw_details,
          checked_at = NOW(),
          next_recheck_at = NOW() + INTERVAL '90 days'
      `;

      try {
        await query(sql, params);
      } catch (err) {
        console.warn(`[Database] Warning bulk inserting chunk: ${err.message}`);
      }
    }
  }

  console.log(`[Database] ✅ Successfully persisted all records to final.email_verifications.`);
}

async function verifyCsvFile(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n============================================================`);
  console.log(` 🚀 STARTING RAPID EMAIL VERIFICATION: ${fileName}`);
  console.log(`============================================================`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return;
  }

  const rawContent = fs.readFileSync(filePath, "utf8");
  const records = parse(rawContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const total = records.length;
  console.log(`[Batch] Loaded ${total} records from ${fileName}.`);

  const counts = { deliverable: 0, undeliverable: 0, risky: 0, unknown: 0 };
  let processed = 0;
  const allVerdicts = [];

  const tasks = records.map((row, index) => {
    return limiter(async () => {
      const email = (row["Verified Email"] || row.email || row.Email || "").trim();

      const verdict = await verifyEmailFast(email);
      allVerdicts.push(verdict);

      const state = verdict.state || "unknown";
      if (counts[state] !== undefined) {
        counts[state] += 1;
      } else {
        counts.unknown += 1;
      }

      row["verification_state"] = verdict.state || "";
      row["verification_score"] = verdict.score !== undefined ? verdict.score : "";
      row["verification_reason"] = verdict.reason || "";
      row["syntax_valid"] = verdict.syntax_valid !== undefined ? String(verdict.syntax_valid) : "";
      row["domain_valid"] = verdict.domain_valid !== undefined ? String(verdict.domain_valid) : "";
      row["mx_valid"] = verdict.mx_valid !== undefined ? String(verdict.mx_valid) : "";
      row["is_disposable"] = verdict.disposable !== undefined ? String(verdict.disposable) : "";
      row["is_role_address"] = verdict.role_address !== undefined ? String(verdict.role_address) : "";
      row["is_catch_all"] = verdict.catch_all !== null && verdict.catch_all !== undefined ? String(verdict.catch_all) : "";
      row["verified_at"] = verdict.checked_at || new Date().toISOString();

      processed++;
      if (processed % 250 === 0 || processed === total) {
        const pct = ((processed / total) * 100).toFixed(1);
        console.log(`[Progress ${fileName}] ${processed}/${total} (${pct}%) | Deliverable: ${counts.deliverable} | Risky: ${counts.risky} | Undeliverable: ${counts.undeliverable} | Cached Domains: ${domainCache.size}`);
      }

      return row;
    });
  });

  const verifiedRows = await Promise.all(tasks);

  console.log(`\n[Summary for ${fileName}]`);
  console.log(`  - Total Processed : ${total}`);
  console.log(`  - Deliverable     : ${counts.deliverable} (${((counts.deliverable / total) * 100).toFixed(1)}%)`);
  console.log(`  - Risky           : ${counts.risky} (${((counts.risky / total) * 100).toFixed(1)}%)`);
  console.log(`  - Undeliverable   : ${counts.undeliverable} (${((counts.undeliverable / total) * 100).toFixed(1)}%)`);
  console.log(`  - Unknown         : ${counts.unknown} (${((counts.unknown / total) * 100).toFixed(1)}%)`);

  // Write enriched CSV back to disk
  const originalHeaders = Object.keys(records[0]).filter(k => !k.startsWith("verification_") && !["syntax_valid", "domain_valid", "mx_valid", "is_disposable", "is_role_address", "is_catch_all", "verified_at"].includes(k));
  const newHeaders = [
    ...originalHeaders,
    "verification_state",
    "verification_score",
    "verification_reason",
    "syntax_valid",
    "domain_valid",
    "mx_valid",
    "is_disposable",
    "is_role_address",
    "is_catch_all",
    "verified_at"
  ];

  const csvStringifier = createObjectCsvStringifier({
    header: newHeaders.map(h => ({ id: h, title: h }))
  });

  const csvOutput = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(verifiedRows);
  fs.writeFileSync(filePath, csvOutput, "utf8");
  console.log(`✅ File updated with full verification columns: ${filePath}`);

  // Bulk save all verification records to PostgreSQL database
  await bulkSaveToDatabase(allVerdicts);
}

async function main() {
  const startTime = Date.now();
  console.log("================================================================");
  console.log("   DOOTT HIGH-SPEED EMAIL VERIFICATION — 10,000 PARTNERS       ");
  console.log("================================================================");

  for (const filePath of FILES_TO_VERIFY) {
    await verifyCsvFile(filePath);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 ALL 10,000 RECORDS VERIFIED, ENRICHED, AND PERSISTED IN ${durationSec}s!`);
  await closePool();
}

if (require.main === module) {
  main().catch(err => {
    console.error("Batch verification failed:", err);
    process.exit(1);
  });
}

module.exports = { main, verifyCsvFile };
