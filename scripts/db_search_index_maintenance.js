#!/usr/bin/env node
"use strict";
/**
 * Search-performance maintenance for the Neon `final` schema.
 *
 * Fixes the production timeouts found by the audit:
 *   • idx_people_job_title_trgm is INVALID (0 bytes, a failed CREATE INDEX CONCURRENTLY)
 *       → job-title searches (CTO, CFO, Founder …) cannot use an index and time out
 *   • people.email_status / is_email_valid have no usable index and no planner statistics
 *       → filtering by deliverable / undeliverable / risky / unknown times out
 *   • planner statistics for final.people are ~6 weeks old (last analyze 2026-09-09)
 *
 * Usage:
 *   node scripts/db_search_index_maintenance.js              # DRY RUN: read-only checks, prints the plan
 *   node scripts/db_search_index_maintenance.js --execute    # applies the plan
 *   node scripts/db_search_index_maintenance.js --execute --skip-trgm   # skip the big job-title index
 *
 * Safety:
 *   • every index is built CONCURRENTLY (reads and writes on the table keep working)
 *   • uses NEON_DIRECT_URL (not the pooler: PgBouncer cancels long statements)
 *   • idempotent: re-running cleans up any INVALID leftovers and skips what already exists
 *   • never touches row data; only indexes and planner statistics
 *   • to abort: Ctrl+C. A half-built concurrent index is left INVALID; re-running removes it.
 */

require("dotenv").config();
const { Client } = require("pg");

const EXECUTE = process.argv.includes("--execute");
const SKIP_TRGM = process.argv.includes("--skip-trgm");

const url = process.env.NEON_DIRECT_URL || (process.env.NEON_DATABASE_URL || "").replace("-pooler.", ".");
if (!url) {
  console.error("Set NEON_DIRECT_URL (or NEON_DATABASE_URL) in .env");
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function connect(label) {
  const c = new Client({ connectionString: url, application_name: `index-maintenance-${label}` });
  await c.connect();
  // long-running maintenance session settings
  await c.query("SET statement_timeout = 0");
  await c.query("SET lock_timeout = '10s'");
  await c.query("SET idle_in_transaction_session_timeout = 0");
  await c.query("SET maintenance_work_mem = '1GB'").catch(() => {});
  return c;
}

const INDEXES = [
  {
    name: "idx_people_email_valid",
    why: "is_email_valid = true/false filters (tiny: only verified rows are indexed)",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_email_valid
            ON final.people (is_email_valid) WHERE is_email_valid IS NOT NULL`,
  },
  {
    name: "idx_people_email_status",
    why: "email_status IN ('deliverable', …) / IS NULL filters (deliverable, undeliverable, risky, unknown)",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_email_status
            ON final.people (email_status)`,
  },
  {
    name: "idx_people_city_trgm",
    why: "city ILIKE '%Los Angeles%': the btree on city cannot serve contains-searches, so every rare city scanned the whole 87 GB table",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_city_trgm
            ON final.people USING gin (city gin_trgm_ops) WHERE city IS NOT NULL`,
  },
  {
    name: "idx_people_state_trgm",
    why: "state ILIKE '%Goa%' (3+ character state names; 2-letter codes are dense and fast anyway)",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_state_trgm
            ON final.people USING gin (state gin_trgm_ops) WHERE state IS NOT NULL`,
  },
  {
    name: "idx_people_job_title_trgm",
    why: "job-title ILIKE '%x%' and whole-word regex (CTO, CFO, Founder …)",
    skip: SKIP_TRGM,
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_job_title_trgm
            ON final.people USING gin (job_title gin_trgm_ops) WHERE job_title IS NOT NULL`,
  },
];

async function state(c) {
  const wanted = [...INDEXES.map((x) => x.name), "idx_companies_emb_null", "idx_companies_embedding_null"];
  const all = await c.query(`
    SELECT i.indexrelid::regclass::text AS name, i.indisvalid, i.indisready,
           pg_size_pretty(pg_relation_size(i.indexrelid)) AS size
      FROM pg_index i
     WHERE i.indrelid IN ('final.people'::regclass, 'final.companies'::regclass)`);
  const idx = { rows: all.rows.filter((r) => wanted.some((w) => r.name.endsWith(w))) };
  const st = await c.query(`
    SELECT relname, n_live_tup, n_dead_tup, last_analyze, last_autoanalyze, last_vacuum, last_autovacuum
      FROM pg_stat_user_tables WHERE schemaname = 'final' AND relname IN ('people','companies')`);
  const act = await c.query(`
    SELECT count(*) FILTER (WHERE state = 'active') AS active,
           count(*) FILTER (WHERE state = 'active' AND now() - query_start > interval '60 seconds') AS long_running
      FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`);
  const size = await c.query("SELECT pg_size_pretty(pg_database_size(current_database())) AS db");
  return { idx: idx.rows, tables: st.rows, activity: act.rows[0], db: size.rows[0].db };
}

async function watchProgress(stop) {
  const c = await connect("progress");
  try {
    while (!stop.done) {
      await new Promise((r) => setTimeout(r, 30000));
      if (stop.done) break;
      const p = await c.query(`
        SELECT index_relid::regclass::text AS idx, phase, blocks_done, blocks_total, tuples_done, tuples_total
          FROM pg_stat_progress_create_index`);
      for (const r of p.rows) {
        const pct = r.blocks_total > 0 ? ` ${Math.round((100 * r.blocks_done) / r.blocks_total)}% of heap` : "";
        log(`   … ${r.idx}: ${r.phase}${pct}`);
      }
    }
  } finally {
    await c.end().catch(() => {});
  }
}

(async () => {
  const c = await connect("main");
  log(EXECUTE ? "MODE: EXECUTE" : "MODE: dry run (read-only). Add --execute to apply.");
  const before = await state(c);
  log("database size:", before.db, "| active queries:", before.activity.active, "| running > 60s:", before.activity.long_running);
  console.table(before.tables);
  console.table(before.idx);

  const plan = [];
  const trgm = before.idx.find((r) => r.name.endsWith("idx_people_job_title_trgm"));
  if (trgm && !trgm.indisvalid) plan.push({ step: "DROP INDEX CONCURRENTLY final.idx_people_job_title_trgm", why: "invalid leftover from a failed build" });
  const a = before.idx.find((r) => r.name.endsWith("idx_companies_emb_null"));
  const b = before.idx.find((r) => r.name.endsWith("idx_companies_embedding_null"));
  if (a && b) plan.push({ step: "DROP INDEX CONCURRENTLY final.idx_companies_emb_null", why: "exact duplicate of idx_companies_embedding_null" });
  plan.push({ step: "ANALYZE final.people; ANALYZE final.companies", why: "refresh planner statistics (people: last run 2026-09-09; verification columns never analyzed)" });
  for (const ix of INDEXES) {
    const exists = before.idx.find((r) => r.name.endsWith(ix.name) && r.indisvalid);
    if (ix.skip) plan.push({ step: `(skipped) ${ix.name}`, why: "--skip-trgm" });
    else if (!exists) plan.push({ step: `CREATE INDEX CONCURRENTLY ${ix.name}`, why: ix.why });
    else plan.push({ step: `(exists) ${ix.name}`, why: "already valid" });
  }
  plan.push({ step: "ANALYZE final.people (job_title, email_status, is_email_valid, city, state)", why: "statistics for the new indexes" });
  console.log("\nPLAN"); console.table(plan);

  if (!EXECUTE) { await c.end(); return; }

  const stop = { done: false };
  const watcher = watchProgress(stop).catch(() => {});
  const t0 = Date.now();
  const run = async (label, sql) => {
    const s = Date.now();
    log(`▶ ${label}`);
    await c.query(sql);
    log(`✔ ${label} (${Math.round((Date.now() - s) / 1000)}s)`);
  };

  try {
    if (trgm && !trgm.indisvalid) await run("drop invalid idx_people_job_title_trgm", "DROP INDEX CONCURRENTLY IF EXISTS final.idx_people_job_title_trgm");
    if (a && b) await run("drop duplicate idx_companies_emb_null", "DROP INDEX CONCURRENTLY IF EXISTS final.idx_companies_emb_null");
    await run("ANALYZE final.companies", "ANALYZE final.companies");
    await run("ANALYZE final.people", "ANALYZE final.people");
    for (const ix of INDEXES) {
      if (ix.skip) continue;
      await run(`create ${ix.name}`, ix.sql);
      const chk = await c.query(
        `SELECT indisvalid FROM pg_index WHERE indexrelid = ('final.${ix.name}')::regclass`);
      if (!chk.rows[0] || !chk.rows[0].indisvalid) {
        throw new Error(`${ix.name} finished INVALID — re-run the script (it will drop and rebuild it)`);
      }
    }
    await run("ANALYZE final.people (new indexed columns)", "ANALYZE final.people (job_title, email_status, is_email_valid, city, state)");
  } finally {
    stop.done = true;
  }
  await watcher;
  const after = await state(c);
  console.log("\nRESULT"); console.table(after.idx);
  log(`done in ${Math.round((Date.now() - t0) / 60000)} min`);
  await c.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
