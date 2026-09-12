"use strict";

const express = require("express");
const multer = require("multer");
const {
  verifyEmail,
  startBulkVerification,
  getBatchJob,
  generateResultCsv,
  syncDisposableDomainsFromGitHub,
  addManualDisposableDomain
} = require("../services/emailVerification");
const { query } = require("../db/cloudSql");

const router = express.Router();
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

/**
 * POST /api/verify-email
 * On-demand single email verification for the product UI / ETL ingestion.
 * Backed by 90-day cache (Redis + Postgres).
 */
router.post("/", async (req, res) => {
  try {
    const { email, force_refresh = false, skip_smtp = false } = req.body || {};

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        error: "Missing required parameter 'email' (must be a valid string)"
      });
    }

    const result = await verifyEmail(email, {
      forceRefresh: Boolean(force_refresh),
      skipSmtp: Boolean(skip_smtp)
    });

    return res.json(result);
  } catch (err) {
    console.error("[EmailVerification] Error verifying single email:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/verify-email/batch
 * Bulk verification via CSV upload or JSON list of emails.
 */
router.post("/batch", upload.single("file"), async (req, res) => {
  try {
    let input = null;
    let fileName = "batch_verification.csv";

    // 1. Multipart CSV file upload
    if (req.file && req.file.buffer) {
      input = req.file.buffer;
      fileName = req.file.originalname || fileName;
    }
    // 2. Raw CSV in body or JSON array
    else if (req.body?.emails && Array.isArray(req.body.emails)) {
      input = req.body.emails;
    } else if (req.body?.csv && typeof req.body.csv === "string") {
      input = req.body.csv;
    } else {
      return res.status(400).json({
        error: "Missing batch input. Provide a CSV file (form-data 'file') or a JSON list of 'emails'."
      });
    }

    const job = startBulkVerification(input, {
      fileName,
      forceRefresh: req.body?.force_refresh === true || req.body?.force_refresh === "true"
    });

    return res.status(202).json({
      success: true,
      jobId: job.jobId,
      status: job.status,
      total: job.total,
      pollUrl: `/api/verify-email/batch/${job.jobId}`,
      downloadUrl: `/api/verify-email/batch/${job.jobId}/download`
    });
  } catch (err) {
    console.error("[EmailVerification] Error starting batch verification:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/verify-email/batch/:jobId
 * Polls the live progress and metrics of a batch verification job.
 */
router.get("/batch/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = getBatchJob(jobId);

  if (!job) {
    return res.status(404).json({ error: `Batch job '${jobId}' not found.` });
  }

  const progressPercent = job.total > 0 ? Number(((job.processed / job.total) * 100).toFixed(1)) : 0;

  return res.json({
    jobId: job.jobId,
    status: job.status,
    total: job.total,
    processed: job.processed,
    progressPercent,
    counts: job.counts,
    metadata: job.metadata,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error || null
  });
});

/**
 * GET /api/verify-email/batch/:jobId/download
 * Streams the completed enriched CSV file with verification signals.
 */
router.get("/batch/:jobId/download", (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getBatchJob(jobId);

    if (!job) {
      return res.status(404).json({ error: `Batch job '${jobId}' not found.` });
    }

    if (job.status !== "completed" && job.results.length === 0) {
      return res.status(400).json({
        error: `Job is currently '${job.status}'. Please wait until processing completes.`
      });
    }

    const csvData = generateResultCsv(jobId);
    const downloadName = `verified_${job.metadata?.fileName || `${jobId}.csv`}`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    return res.send(csvData);
  } catch (err) {
    console.error("[EmailVerification] Error generating CSV download:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/verify-email/sync-disposable
 * Admin / Cron trigger to sync disposable domains from upstream GitHub blocklist.
 */
router.post("/sync-disposable", async (req, res) => {
  try {
    const syncResult = await syncDisposableDomainsFromGitHub();
    return res.json({
      success: true,
      message: "Successfully synchronized disposable domains from upstream repository",
      details: syncResult
    });
  } catch (err) {
    console.error("[EmailVerification] Error syncing disposable domains:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/verify-email/disposable-domains
 * Manually append a disposable domain.
 */
router.post("/disposable-domains", async (req, res) => {
  try {
    const { domain, source = "manual_api" } = req.body || {};
    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ error: "Missing required 'domain' parameter" });
    }

    await addManualDisposableDomain(domain, source);
    return res.json({ success: true, message: `Domain '${domain}' added to disposable list` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/verify-email/stats
 * Overview statistics of verified emails and domain cache.
 */
router.get("/stats", async (req, res) => {
  try {
    const [countsRes, disposableCountRes, domainCacheRes] = await Promise.all([
      query(`
        SELECT state, COUNT(*) as count, AVG(score) as avg_score
        FROM final.email_verifications
        GROUP BY state
      `),
      query("SELECT COUNT(*) as count FROM final.disposable_domains"),
      query("SELECT COUNT(*) as count FROM final.domain_cache")
    ]);

    const stateBreakdown = {};
    let totalVerified = 0;

    countsRes.rows.forEach(r => {
      const count = parseInt(r.count, 10);
      totalVerified += count;
      stateBreakdown[r.state] = {
        count,
        avgScore: r.avg_score ? parseFloat(Number(r.avg_score).toFixed(2)) : 0
      };
    });

    return res.json({
      totalVerifiedEmails: totalVerified,
      stateBreakdown,
      totalDisposableDomains: parseInt(disposableCountRes.rows[0]?.count || 0, 10),
      totalCachedDomains: parseInt(domainCacheRes.rows[0]?.count || 0, 10)
    });
  } catch (err) {
    console.error("[EmailVerification] Error fetching stats:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
