"use strict";

const { parse } = require("csv-parse/sync");
const { createObjectCsvStringifier } = require("csv-writer");
const { normalizeEmail } = require("./syntaxValidator");
const { createBatchJob, processBatchJob, getBatchJob } = require("./queue");

/**
 * Detects the email column name in a parsed CSV record.
 */
function detectEmailColumn(row) {
  if (!row || typeof row !== "object") return null;
  const keys = Object.keys(row);
  
  // Exact name matches first
  const exactCandidates = ["email", "e-mail", "work_email", "email_address", "contact_email", "business_email", "personal_email"];
  for (const candidate of exactCandidates) {
    const found = keys.find(k => k.trim().toLowerCase() === candidate);
    if (found && row[found]) return found;
  }

  // Partial match
  const partialFound = keys.find(k => k.toLowerCase().includes("email"));
  if (partialFound && row[partialFound]) return partialFound;

  // Check if any column value contains an '@' sign
  for (const k of keys) {
    const val = String(row[k] || "").trim();
    if (val.includes("@") && val.includes(".")) {
      return k;
    }
  }

  return null;
}

/**
 * Prepares and starts a batch verification job from CSV buffer or JSON email array.
 * 
 * @param {Buffer|string|Array} input   CSV text/buffer OR array of string/object
 * @param {Object} [options]
 * @returns {Object} Job info with jobId
 */
function startBulkVerification(input, options = {}) {
  let rows = [];

  if (Buffer.isBuffer(input) || typeof input === "string") {
    const csvContent = Buffer.isBuffer(input) ? input.toString("utf8") : input;
    try {
      rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (err) {
      throw new Error(`Failed to parse CSV: ${err.message}`);
    }
  } else if (Array.isArray(input)) {
    rows = input.map(item => {
      if (typeof item === "string") return { email: item };
      return item;
    });
  } else {
    throw new Error("Invalid input format. Expected CSV buffer or array of emails.");
  }

  if (rows.length === 0) {
    throw new Error("No rows found to verify in provided input.");
  }

  // Deduplicate and normalize
  const seenCanonical = new Map(); // canonical -> first item
  const batchItems = [];

  rows.forEach((row, idx) => {
    const emailCol = detectEmailColumn(row);
    const rawEmail = emailCol ? String(row[emailCol] || "").trim() : (row.email || "");

    const norm = normalizeEmail(rawEmail);
    const canonicalKey = norm.valid ? norm.canonicalEmail : rawEmail.toLowerCase();

    const item = {
      index: idx,
      email: norm.valid ? norm.email : rawEmail,
      originalEmail: rawEmail,
      emailColumn: emailCol,
      originalRow: row,
      forceRefresh: options.forceRefresh || false
    };

    batchItems.push(item);
  });

  const job = createBatchJob(batchItems.length, {
    totalRows: rows.length,
    fileName: options.fileName || "batch_verification.csv"
  });

  // Start background processing without blocking request
  processBatchJob(job.jobId, batchItems).catch(err => {
    console.error(`[BatchProcessor] Job ${job.jobId} error:`, err);
  });

  return {
    jobId: job.jobId,
    status: job.status,
    total: job.total,
    message: "Batch verification job started asynchronously"
  };
}

/**
 * Generates an enriched CSV string from completed job results.
 */
function generateResultCsv(jobId) {
  const job = getBatchJob(jobId);
  if (!job) throw new Error("Job not found");

  if (!job.results || job.results.length === 0) {
    throw new Error("Job has no completed results to export");
  }

  // Collect original headers
  const sampleOriginal = job.results[0]?.originalRow || {};
  const originalHeaders = Object.keys(sampleOriginal).map(k => ({ id: k, title: k }));

  // Verification result headers
  const verificationHeaders = [
    { id: "verification_state", title: "verification_state" },
    { id: "verification_score", title: "verification_score" },
    { id: "verification_reason", title: "verification_reason" },
    { id: "syntax_valid", title: "syntax_valid" },
    { id: "domain_valid", title: "domain_valid" },
    { id: "mx_valid", title: "mx_valid" },
    { id: "is_disposable", title: "is_disposable" },
    { id: "is_role_address", title: "is_role_address" },
    { id: "is_catch_all", title: "is_catch_all" },
    { id: "smtp_result", title: "smtp_result" },
    { id: "typo_suggestion", title: "typo_suggestion" },
    { id: "verified_at", title: "verified_at" }
  ];

  const csvStringifier = createObjectCsvStringifier({
    header: [...originalHeaders, ...verificationHeaders]
  });

  // Sort by original index
  const sorted = [...job.results].sort((a, b) => a.index - b.index);

  const records = sorted.map(item => {
    const verdict = item.verdict || {};
    return {
      ...(item.originalRow || { email: item.email }),
      verification_state: verdict.state || "unknown",
      verification_score: verdict.score !== undefined ? verdict.score : "",
      verification_reason: verdict.reason || "",
      syntax_valid: verdict.syntax_valid !== undefined ? verdict.syntax_valid : "",
      domain_valid: verdict.domain_valid !== undefined ? verdict.domain_valid : "",
      mx_valid: verdict.mx_valid !== undefined ? verdict.mx_valid : "",
      is_disposable: verdict.disposable !== undefined ? verdict.disposable : "",
      is_role_address: verdict.role_address !== undefined ? verdict.role_address : "",
      is_catch_all: verdict.catch_all !== undefined ? verdict.catch_all : "",
      smtp_result: verdict.smtp_result || "",
      typo_suggestion: verdict.details?.typo_suggestion || "",
      verified_at: verdict.checked_at || ""
    };
  });

  return csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
}

module.exports = {
  startBulkVerification,
  generateResultCsv,
  detectEmailColumn
};
