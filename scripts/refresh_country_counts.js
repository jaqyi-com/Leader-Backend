#!/usr/bin/env node
"use strict";
/**
 * Recounts how many people and companies each country has and rewrites frontend/src/countries.json
 * (the country picker on Companies / People / Emails / Numbers and the landing page read it).
 *
 * Each number is what selecting that country in the app returns: the counts use the same country
 * rules as the search (src/utils/countries.js). India / USA use the address rules plus the phone
 * country; every other country uses the phone number's country unless the address says India / USA. Codes that are usually mis-parsed
 * numbers (SUSPECT_CODES) are left out.
 *
 * Read-only. Scans final.companies (~1.7M rows, seconds) and final.people (~45M rows, ~6 minutes).
 * Usage: node scripts/refresh_country_counts.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { peopleCountryWhere, companiesCountryWhere, countryName, SUSPECT_CODES } = require("../src/utils/countries");

const OUT = path.join(__dirname, "..", "frontend/src/countries.json");

async function countTable(client, table, where) {
  const sql = `SELECT COALESCE((${where("US")}), false) AS is_us, COALESCE((${where("IN")}), false) AS is_in,
                      phone_country, count(*)::bigint AS n
                 FROM final.${table} GROUP BY 1, 2, 3`;
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout = 0");
  const { rows } = await client.query(sql);
  await client.query("COMMIT");
  const counts = {};
  const add = (code, n) => { counts[code] = (counts[code] || 0) + n; };
  for (const r of rows) {
    const n = Number(r.n);
    if (r.is_us) add("US", n);
    if (r.is_in) add("IN", n);
    // Other countries: the phone country, unless the address already says India or the USA.
    if (!r.is_us && !r.is_in && r.phone_country && r.phone_country !== "US" && r.phone_country !== "IN") add(r.phone_country, n);
  }
  return counts;
}

(async () => {
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();
  const t = Date.now();
  const companies = await countTable(client, "companies", (c) => companiesCountryWhere(c));
  console.log(`companies counted in ${Math.round((Date.now() - t) / 1000)}s`);
  const people = await countTable(client, "people", (c) => peopleCountryWhere(c));
  console.log(`people counted in ${Math.round((Date.now() - t) / 1000)}s`);
  await client.end();

  const codes = new Set([...Object.keys(people), ...Object.keys(companies)]);
  const countries = [...codes]
    .filter((code) => /^[A-Z]{2}$/.test(code) && !SUSPECT_CODES.has(code) && countryName(code))
    .map((code) => ({ code, name: countryName(code), people: people[code] || 0, companies: companies[code] || 0 }))
    .sort((a, b) => (b.people + b.companies) - (a.people + a.companies) || a.name.localeCompare(b.name));
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), countries }, null, 1) + "\n");
  console.log(`wrote ${countries.length} countries to ${path.relative(process.cwd(), OUT)}`);
  for (const c of countries.slice(0, 5)) console.log(`  ${c.code} ${c.name}: ${c.people} people, ${c.companies} companies`);
})().catch((e) => { console.error("refresh_country_counts failed:", e.message); process.exit(1); });
