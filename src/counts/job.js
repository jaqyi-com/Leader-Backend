"use strict";
// ============================================================
// COUNT JOB — keeps the explorer counts fresh, run by our own API
// ============================================================
// Once a day Vercel Cron calls GET /api/cron/refresh-counts (src/routes/cron.js). A run does:
//   fill            fill empty cities outside India / USA from landline numbers (fillCities.js)
//   world:*         city cards for countries other than India / USA        → "world_cities"
//   countries:*     people / companies per country                          → "countries"
//   explorer:*      (weekly) India / USA category and city cards            → "categories", "cities"
// Results are saved in app.explorer_counts, which the app serves (src/utils/explorerCounts.js).
//
// A serverless call may run for at most a few minutes, so the work is done in slices: each call works
// for up to `budgetMs`, saves its place in app.count_jobs, and the route starts the next call until
// the run is done. Full-table scans are split into block ranges (ctid) small enough for one slice.
// A lease on the job row makes sure only one slice works at a time; a slice that dies leaves the
// lease to expire and the next call carries on from the last saved place.
// ============================================================

const explorerCounts = require("../utils/explorerCounts");
const fill = require("./fillCities");
const world = require("./worldCities");
const country = require("./countryCounts");
const explorer = require("./explorerCards");
const { tablePages, ranges } = require("./cards");

const JOB_DDL = `
CREATE TABLE IF NOT EXISTS app.count_jobs (
  id           bigserial PRIMARY KEY,
  full_run     boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'running',   -- running | done | failed
  state        jsonb NOT NULL DEFAULT '{}'::jsonb,
  slices       integer NOT NULL DEFAULT 0,
  lease_until  timestamptz,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
)`;

const DAILY = ["fill", "world:companies", "world:people", "world:publish", "countries:companies", "countries:people", "countries:publish"];
const WEEKLY = ["explorer:discover:companies", "explorer:count:companies", "explorer:discover:people", "explorer:count:people", "explorer:publish"];
// Block ranges per full scan, sized so one range takes well under a minute.
const CHUNKS = {
  "countries:companies": 2, "countries:people": 24,
  "explorer:discover:companies": 2, "explorer:count:companies": 4,
  "explorer:discover:people": 24, "explorer:count:people": 48,
};
const FULL_EVERY_MS = 6.5 * 24 * 3600 * 1000;   // the explorer cards are recounted about weekly
const NEW_RUN_AFTER_MS = 20 * 3600 * 1000;      // one run a day
const LEASE_MS = 6 * 60 * 1000;                 // longer than any slice can live
const FAILED_RETRY_LIMIT = 3;                   // a step failing this many times ends the run

async function ensureTables(db) {
  await db.query("CREATE SCHEMA IF NOT EXISTS app");
  await db.query(JOB_DDL);
  await db.query(explorerCounts.TABLE_SQL);
}

/** The job to work on: the running one, else a new one when the last finished > 20 h ago (or force). */
async function startOrResume(db, { force = false, full = null, steps: only = null } = {}) {
  await ensureTables(db);
  const running = (await db.query("SELECT * FROM app.count_jobs WHERE status = 'running' ORDER BY id DESC LIMIT 1")).rows[0];
  if (running) return { job: running, created: false };
  const last = (await db.query("SELECT * FROM app.count_jobs ORDER BY id DESC LIMIT 1")).rows[0];
  if (!force && last && last.finished_at && Date.now() - new Date(last.finished_at) < NEW_RUN_AFTER_MS) {
    return { job: last, created: false };
  }
  const lastFull = (await db.query("SELECT finished_at FROM app.count_jobs WHERE full_run AND status = 'done' ORDER BY id DESC LIMIT 1")).rows[0];
  const isFull = full !== null ? !!full : !lastFull || Date.now() - new Date(lastFull.finished_at) > FULL_EVERY_MS;
  // `only`: a hand-picked list of steps (local runs: node scripts/refresh_counts.js --only …).
  const steps = only || (isFull ? [...DAILY, ...WEEKLY] : DAILY);
  const job = (await db.query(
    "INSERT INTO app.count_jobs (full_run, state) VALUES ($1, $2) RETURNING *",
    [isFull, JSON.stringify({ steps, i: 0, step: {}, results: {}, log: [], fails: 0 })])).rows[0];
  return { job, created: true };
}

/** Take the job's lease (only one slice works at a time). Returns the row, or null if busy / finished. */
async function lease(db, id) {
  const { rows } = await db.query(
    `UPDATE app.count_jobs SET lease_until = now() + ($2 || ' milliseconds')::interval, slices = slices + 1, updated_at = now()
      WHERE id = $1 AND status = 'running' AND (lease_until IS NULL OR lease_until < now())
      RETURNING *`, [id, String(LEASE_MS)]);
  return rows[0] || null;
}

async function save(db, id, state, extra = {}) {
  const sets = ["state = $2", "updated_at = now()"];
  const vals = [id, JSON.stringify(state)];
  for (const [k, v] of Object.entries(extra)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
  await db.query(`UPDATE app.count_jobs SET ${sets.join(", ")} WHERE id = $1`, vals);
}

/** Counts now served for a key (database copy, else the built-in file). */
async function current(db, key) {
  return (await explorerCounts.load(db, key)) || explorerCounts.get(key);
}

/**
 * One unit of work of the current step. Mutates `state`; returns true when the step is finished.
 * `st` (state.step) holds the step's progress: block ranges, cursor and running totals.
 */
async function unit(db, name, state, log) {
  const st = state.step;
  const R = state.results;
  const [group, a, b] = name.split(":");

  if (name === "fill") {
    const { fills, stats } = await fill.plan(db);
    const done = await fill.apply(db, fills);
    R.fill = { ...stats, filled: done };
    log(`fill: companies +${done.companies}, people +${done.people}`);
    return true;
  }
  if (group === "world" && a !== "publish") {
    R.world = R.world || {};
    R.world[a] = await world.cardsForKind(db, a, log);
    log(`world ${a}: ${Object.values(R.world[a]).reduce((s, l) => s + l.length, 0)} cards`);
    return true;
  }
  if (name === "world:publish") {
    const doc = world.assemble(R.world || {});
    await explorerCounts.save(db, "world_cities", doc);
    log(`published world_cities: ${Object.keys(doc.countries).length} countries`);
    delete R.world;
    return true;
  }

  // Block-range steps: countries:<kind>, explorer:discover:<kind>, explorer:count:<kind>
  const kind = group === "countries" ? a : b;
  if ((group === "countries" && a !== "publish") || (group === "explorer" && (a === "discover" || a === "count"))) {
    if (!st.ranges) {
      st.ranges = ranges(await tablePages(db, `final.${kind}`), CHUNKS[name]);
      st.cursor = 0;
      if (name.startsWith("explorer:count:")) {
        const base = { categories: await current(db, "categories"), cities: await current(db, "cities") };
        const top = (R.top || {})[kind];
        st.cards = explorer.buildCards(kind, base, top);
        st.counts = st.cards.map(() => 0);
      }
    }
    const [from, to] = st.ranges[st.cursor];
    if (group === "countries") {
      st.acc = country.addCounts(st.acc || {}, await country.countRange(db, kind, from, to));
    } else if (a === "discover") {
      st.merged = explorer.mergeDiscovered(st.merged, await explorer.discoverRange(db, kind, from, to));
    } else {
      const part = await explorer.countRange(db, kind, st.cards, from, to);
      st.counts = st.counts.map((n, i) => n + part[i]);
    }
    st.cursor++;
    log(`${name}: range ${st.cursor}/${st.ranges.length}`);
    if (st.cursor < st.ranges.length) return false;
    if (group === "countries") (R.countries ||= {})[kind] = st.acc;
    else if (a === "discover") (R.top ||= {})[kind] = explorer.pickTop(kind, st.merged);
    else (R.explorer ||= {})[kind] = { cards: st.cards, counts: st.counts };
    return true;
  }
  if (name === "countries:publish") {
    const doc = country.assemble(R.countries.people || {}, R.countries.companies || {});
    await explorerCounts.save(db, "countries", doc);
    log(`published countries: ${doc.countries.length}`);
    delete R.countries;
    return true;
  }
  if (name === "explorer:publish") {
    const base = { categories: await current(db, "categories"), cities: await current(db, "cities") };
    const { categories, cities } = explorer.assemble(base, R.explorer || {});
    await explorerCounts.save(db, "categories", categories);
    await explorerCounts.save(db, "cities", cities);
    log("published categories and cities");
    delete R.explorer; delete R.top;
    return true;
  }
  throw new Error(`unknown step ${name}`);
}

/**
 * Work on the job for up to budgetMs. Returns { id, status, step, done, busy }.
 * A unit is only started when the previous unit of the same step suggests it fits in the time left.
 */
async function runSlice(db, id, { budgetMs = 200000, log = () => {} } = {}) {
  const started = Date.now();
  const job = await lease(db, id);
  if (!job) {
    const row = (await db.query("SELECT status FROM app.count_jobs WHERE id = $1", [id])).rows[0];
    return { id, busy: !!row && row.status === "running", done: !row || row.status !== "running", status: row && row.status };
  }
  const state = job.state;
  state.log = state.log || [];
  const say = (msg) => { const line = `${new Date().toISOString()} ${msg}`; state.log.push(line); if (state.log.length > 200) state.log.shift(); log(line); };
  state.ms = state.ms || {};   // step name → how long its last unit took (kept across slices)
  try {
    let units = 0;
    while (state.i < state.steps.length) {
      const name = state.steps[state.i];
      const elapsed = Date.now() - started;
      // Start a unit only if it should fit: the step's last unit time, with margin. The first unit of
      // a slice always runs, so every slice makes progress.
      if (units > 0 && elapsed + (state.ms[name] || 0) * 1.5 > budgetMs) break;
      const t = Date.now();
      const finished = await unit(db, name, state, say);
      state.ms[name] = Date.now() - t;
      units++;
      if (finished) { state.i++; state.step = {}; }
      state.fails = 0;
      await save(db, id, state, { lease_until: new Date(Date.now() + LEASE_MS) });
    }
  } catch (err) {
    state.fails = (state.fails || 0) + 1;
    say(`error in ${state.steps[state.i]}: ${err.message}`);
    const failed = state.fails >= FAILED_RETRY_LIMIT;
    await save(db, id, state, failed
      ? { status: "failed", error: err.message, lease_until: null, finished_at: new Date() }
      : { lease_until: null });
    return { id, status: failed ? "failed" : "running", step: state.steps[state.i], done: failed, error: err.message };
  }
  const done = state.i >= state.steps.length;
  await save(db, id, state, done ? { status: "done", lease_until: null, finished_at: new Date() } : { lease_until: null });
  if (done) say(`run ${id} done in ${job.slices} slice(s)`);
  return { id, status: done ? "done" : "running", step: state.steps[state.i] || null, done };
}

/** Run a whole job in this process, slice after slice (local runs and tests). */
async function runToEnd(db, opts = {}) {
  const { job } = await startOrResume(db, opts);
  let r;
  do { r = await runSlice(db, job.id, opts); } while (!r.done && !r.busy);
  return r;
}

module.exports = { startOrResume, runSlice, runToEnd, ensureTables, DAILY, WEEKLY, CHUNKS };
