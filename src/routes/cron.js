"use strict";
// ============================================================
// CRON — scheduled work run by our own API (Vercel Cron, see vercel.json "crons")
// ============================================================
//   GET /api/cron/refresh-counts          start (or continue) today's count job   (src/counts/job.js)
//   GET /api/cron/refresh-counts/status   the last runs and their progress
// Vercel Cron calls the first one once a day with "Authorization: Bearer $CRON_SECRET". Each call
// answers at once (202), works for one slice in the background (waitUntil), then calls this route
// again to continue, until the run is done. Query: ?force=1 start a new run now, ?full=1|0 include /
// skip the weekly India / USA recount.
// ============================================================

const crypto = require("crypto");
const express = require("express");
const { Client } = require("pg");
const { waitUntil } = require("@vercel/functions");
const { getPool } = require("../db/cloudSql");
const job = require("../counts/job");
const logger = require("../utils/logger");

const router = express.Router();
const BUDGET_MS = Number(process.env.COUNT_JOB_BUDGET_MS || 200000);

/**
 * The job's own connection: one block range takes up to about a minute on the full tables, longer
 * than the app pool's 30 s query limit. Its limit stays below the function's 5 minutes.
 */
async function jobConnection() {
  const db = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    statement_timeout: 240000, query_timeout: 245000, connectionTimeoutMillis: 15000,
    application_name: "leader-backend-count-job",
  });
  await db.connect();
  return db;
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const got = String(req.headers.authorization || "");
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

function guard(req, res, next) {
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: "CRON_SECRET is not configured" });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

/** Start the next slice with a new request (its own time limit); resolves once it is accepted. */
async function continueLater(req) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0];
  const url = `${proto}://${req.headers.host}${req.baseUrl}/refresh-counts?continue=1`;
  try {
    const r = await fetch(url, { headers: { authorization: req.headers.authorization }, signal: AbortSignal.timeout(20000) });
    if (r.status !== 202 && r.status !== 200) logger.warn(`[cron] continue call answered ${r.status}`);
  } catch (err) {
    logger.warn(`[cron] continue call failed: ${err.message} (tomorrow's run carries on)`);
  }
}

const summary = (row) => row && ({
  id: Number(row.id), status: row.status, fullRun: row.full_run, slices: row.slices,
  step: row.state && row.state.steps ? row.state.steps[row.state.i] || null : null,
  progress: row.state && row.state.steps ? `${Math.min(row.state.i, row.state.steps.length)}/${row.state.steps.length}` : null,
  startedAt: row.started_at, finishedAt: row.finished_at, error: row.error,
});

router.get("/refresh-counts", guard, async (req, res) => {
  let db;
  let started;
  try {
    db = await jobConnection();
    started = await job.startOrResume(db, {
      force: req.query.force === "1",
      full: req.query.full === "1" ? true : req.query.full === "0" ? false : null,
    });
  } catch (err) {
    logger.error(`[cron] refresh-counts: ${err.message}`);
    if (db) db.end().catch(() => {});
    return res.status(500).json({ error: "Could not start the count job" });
  }
  const { job: row, created } = started;
  if (row.status !== "running") {
    db.end().catch(() => {});
    return res.json({ status: "up_to_date", job: summary(row) });
  }
  res.status(202).json({ status: created ? "started" : "continuing", job: summary(row) });

  const work = (async () => {
    const r = await job.runSlice(db, row.id, { budgetMs: BUDGET_MS, log: (l) => logger.info(`[cron] ${l}`) });
    await db.end().catch(() => {});
    if (!r.done && !r.busy) await continueLater(req);
  })().catch((err) => { db.end().catch(() => {}); logger.error(`[cron] slice failed: ${err.message}`); });
  waitUntil(work);
});

router.get("/refresh-counts/status", guard, async (req, res) => {
  try {
    await job.ensureTables(getPool());
    const { rows } = await getPool().query("SELECT * FROM app.count_jobs ORDER BY id DESC LIMIT 5");
    res.json({ runs: rows.map(summary), log: rows[0] ? (rows[0].state.log || []).slice(-30) : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
