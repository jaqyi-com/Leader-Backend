"use strict";
// ============================================================
// EXPLORER COUNTS — the numbers on the country picker, city cards and category cards
// ============================================================
// Counting the 45M-row people table takes minutes, so the counts are made in the background by the
// daily count job (src/counts/job.js, started by Vercel Cron through /api/cron/refresh-counts) and
// stored in app.explorer_counts. The app reads them from there, so new numbers appear without a
// deploy. The JSON files in frontend/src are the built-in fallback (and what the pre-rendered pages
// use) when the table is empty or the database is unreachable.
// ============================================================

const fs = require("fs");

// Built-in copies, required statically so the serverless bundle always contains them.
const FILES = {
  countries: () => require("../../frontend/src/countries.json"),
  world_cities: () => require("../../frontend/src/worldCities.json"),
  cities: () => require("../../frontend/src/cities.json"),
  categories: () => require("../../frontend/src/categories.json"),
};
const KEYS = Object.keys(FILES);
// How long loaded counts are trusted before re-reading the table (tests set EXPLORER_COUNTS_TTL_MS=0).
const TTL_MS = Number(process.env.EXPLORER_COUNTS_TTL_MS ?? 5 * 60 * 1000);

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS app.explorer_counts (
  key          text PRIMARY KEY,
  data         jsonb NOT NULL,
  generated_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
)`;

const fileCache = {};
function fromFile(key) {
  if (!(key in fileCache)) {
    // COUNTRY_COUNTS_FILE: tests point the country counts at their own file.
    try {
      fileCache[key] = key === "countries" && process.env.COUNTRY_COUNTS_FILE
        ? JSON.parse(fs.readFileSync(process.env.COUNTRY_COUNTS_FILE, "utf8"))
        : FILES[key]();
    } catch { fileCache[key] = null; }
  }
  return fileCache[key];
}

let live = {};          // key → data from app.explorer_counts
let loadedAt = 0;
let loading = null;

/** Current counts for a key: the database copy when loaded, else the built-in file. */
function get(key) {
  if (!FILES[key]) throw new Error(`unknown explorer counts key: ${key}`);
  if (key === "countries" && process.env.COUNTRY_COUNTS_FILE) return fromFile(key);
  return live[key] || fromFile(key);
}

/**
 * Reload from the database when older than 5 minutes. Never throws: on any error the previous
 * values (or the files) stay in use. Callers can await it (a no-op while fresh) or fire and forget.
 */
function refresh({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const { getPool } = require("../db/cloudSql");
      const { rows } = await getPool().query("SELECT key, data FROM app.explorer_counts WHERE key = ANY($1)", [KEYS]);
      const next = {};
      for (const r of rows) next[r.key] = r.data;
      live = next;
    } catch { /* table missing or database down: keep what we have */ }
    loadedAt = Date.now();
    loading = null;
  })();
  return loading;
}

/** Express middleware: make sure the counts are at most 5 minutes old before the route runs. */
function fresh(req, res, next) { refresh().then(() => next(), () => next()); }

/**
 * Save counts made by the count job. `client` is a pg Client / Pool that can write.
 * Creates the table on first use.
 */
async function save(client, key, data) {
  if (!FILES[key]) throw new Error(`unknown explorer counts key: ${key}`);
  await client.query("CREATE SCHEMA IF NOT EXISTS app");
  await client.query(TABLE_SQL);
  await client.query(
    `INSERT INTO app.explorer_counts (key, data, generated_at, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, generated_at = EXCLUDED.generated_at, updated_at = now()`,
    [key, JSON.stringify(data), data && data.generatedAt ? new Date(data.generatedAt) : new Date()]);
}

/** Read a key straight from the database (scripts use it as their starting point), or null. */
async function load(client, key) {
  try {
    const { rows } = await client.query("SELECT data FROM app.explorer_counts WHERE key = $1", [key]);
    return rows[0] ? rows[0].data : null;
  } catch { return null; }
}

/** For tests: forget everything loaded. */
function _reset() { live = {}; loadedAt = 0; loading = null; for (const k of Object.keys(fileCache)) delete fileCache[k]; }

module.exports = { KEYS, TABLE_SQL, get, refresh, fresh, save, load, _reset };
