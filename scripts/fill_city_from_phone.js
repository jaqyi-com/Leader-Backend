#!/usr/bin/env node
"use strict";
/**
 * Fill empty cities outside India / USA from landline numbers (src/counts/fillCities.js) by hand.
 * The daily count job already does this; use this script to preview or undo it.
 *
 * Usage:
 *   node scripts/fill_city_from_phone.js            # dry run: what would be filled (read-only)
 *   node scripts/fill_city_from_phone.js --apply    # write the fills (logged in final.city_phone_fills)
 *   node scripts/fill_city_from_phone.js --revert   # undo every logged fill
 * Afterwards: node scripts/refresh_counts.js --only world,countries
 */
require("dotenv").config();
const { Client } = require("pg");
const fill = require("../src/counts/fillCities");

(async () => {
  const mode = process.argv[2] || "--dry-run";
  if (!["--dry-run", "--apply", "--revert"].includes(mode)) throw new Error("use --dry-run, --apply or --revert");
  const db = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await db.connect();
  try {
    if (mode === "--revert") {
      const done = await fill.revert(db);
      console.log(`reverted: companies ${done.companies}, people ${done.people}`);
      return;
    }
    const { fills, stats } = await fill.plan(db);
    for (const table of ["companies", "people"]) {
      const s = stats[table];
      console.log(`${table}: ${s.rows} rows outside India/USA, ${s.withoutCity} without a city, ${s.fill} get one`);
      const per = {};
      for (const [, city, prov, cc] of fills[table]) {
        const k = city + (prov ? ` (${prov})` : "");
        (per[cc] ||= {})[k] = (per[cc][k] || 0) + 1;
      }
      for (const [cc, places] of Object.entries(per).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y) - Object.values(a[1]).reduce((x, y) => x + y)).slice(0, 12)) {
        const top = Object.entries(places).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, n]) => `${p} ${n}`).join(", ");
        console.log(`  ${cc} +${Object.values(places).reduce((x, y) => x + y)}: ${top}`);
      }
    }
    if (mode === "--apply") {
      const done = await fill.apply(db, fills);
      console.log(`filled: companies ${done.companies}, people ${done.people}`);
    } else console.log("dry run: nothing written (use --apply)");
  } finally { await db.end(); }
})().catch((err) => { console.error(err.message); process.exit(1); });
