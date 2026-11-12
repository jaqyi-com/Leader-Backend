#!/usr/bin/env node
"use strict";
/**
 * Runs the count job (src/counts/job.js) here, without the serverless time limit. The same job runs
 * every night through our API (Vercel Cron → /api/cron/refresh-counts); use this to refresh by hand.
 * Results go to app.explorer_counts, which the app serves at once (no deploy needed).
 *
 * Usage:
 *   node scripts/refresh_counts.js                 # daily steps (+ weekly India/USA cards when due)
 *   node scripts/refresh_counts.js --full          # also the India / USA category and city cards
 *   node scripts/refresh_counts.js --only world,countries   # just these groups (fill, world, countries, explorer)
 *   node scripts/refresh_counts.js --files         # afterwards, copy the served counts into the
 *                                                  # built-in files frontend/src/*.json (commit them)
 * A run already in progress (e.g. tonight's) is continued instead of starting a new one.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const job = require("../src/counts/job");
const explorerCounts = require("../src/utils/explorerCounts");

const arg = (name) => process.argv.includes(name);
const value = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const FILES = { countries: "countries.json", world_cities: "worldCities.json", cities: "cities.json", categories: "categories.json" };

(async () => {
  const db = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await db.connect();
  let steps = null;
  if (value("--only")) {
    const groups = value("--only").split(",");
    steps = [...job.DAILY, ...job.WEEKLY].filter((s) => groups.includes(s.split(":")[0]));
    if (!steps.length) throw new Error("--only takes: fill, world, countries, explorer");
  }
  const r = await job.runToEnd(db, { force: true, full: arg("--full") ? true : null, steps, budgetMs: 60 * 60 * 1000, log: console.log });
  console.log(`run ${r.id}: ${r.status}${r.error ? ` (${r.error})` : ""}`);
  if (arg("--files")) {
    for (const [key, file] of Object.entries(FILES)) {
      const data = await explorerCounts.load(db, key);
      if (!data) continue;
      fs.writeFileSync(path.join(__dirname, "../frontend/src", file), JSON.stringify(data, null, key === "countries" ? 1 : 2) + "\n");
      console.log(`wrote frontend/src/${file}`);
    }
  }
  await db.end();
  if (r.status === "failed") process.exit(1);
})().catch((err) => { console.error(err.message); process.exit(1); });
