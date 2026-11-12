#!/usr/bin/env node
"use strict";
/**
 * City cards for countries other than India and the USA → frontend/src/worldCities.json.
 * (India / USA cards live in cities.json, written by refresh_explorer_counts.js.)
 *
 * A row's country is its phone number's country (same rule as the country filter), and its city is
 * the stored city. Canada also has the province in "state" (ON, BC, …), so Canadian cards are per
 * city + province; rows whose state is not a Canadian province (e.g. "Research Triangle Park, NC" with
 * a +1 number) are left out. Other countries' cards are per city.
 *
 * Every count runs the WHERE clause of the People / Companies search with the exact URL filters the
 * card sends (cityCardParams below, mirrored in CityExplorerPage), so a card's number is what its
 * click finds. Cards below MIN_CARD records are dropped.
 *
 * Read-only. Only scans rows with phone_country NOT IN ('IN', 'US') (partial index
 * idx_*_phone_country_other), about a minute in total.
 *
 * Usage: node scripts/refresh_world_cities.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { CITY_ALIASES, CITY_ALIAS_GROUPS, INDIA_STATES } = require("../src/utils/searchFilters");
const { SUSPECT_CODES, countryName, peopleCountryWhere, companiesCountryWhere } = require("../src/utils/countries");
const { buildWhere: companiesWhere } = require("../src/routes/finalCompaniesDatabase");
const { buildWhere: peopleWhere } = require("../src/routes/finalPeopleDatabase");

const OUT_FILE = path.join(__dirname, "../frontend/src/worldCities.json");
const MIN_CARD = 20;          // fewest records a card may show
const MAX_CARDS = 150;        // per country and kind
const CA_PROVINCES = new Set(["ON", "BC", "QC", "AB", "MB", "NS", "SK", "NB", "NL", "PE", "NT", "YT", "NU"]);

/** The URL filters a card sends (CityExplorerPage builds the same). */
function cityCardParams(code, card) {
  const p = { country: code, f_city: card.name };
  if (card.state) p.f_state_eq = card.state;
  return p;
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-'.(])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
/** "montral" / "Montréal" → "Montreal" (alias groups), "TORONTO" → "Toronto". */
function canonicalCity(name) {
  const aliases = CITY_ALIASES[name.toLowerCase()];
  if (aliases) return CITY_ALIAS_GROUPS.find((g) => g.includes(aliases[0]))[0];
  return name === name.toUpperCase() || name === name.toLowerCase() ? titleCase(name) : name;
}
// Not cities: placeholders, numbers, abbreviations ("Hyd", "N J") and notes ("Other Than India").
const NOT_A_CITY = /^(.{0,3}|\d+|[^\p{L}\p{N}]+|n\/?a|none|null|unknown|others?|-+|.*\bother than\b.*|.*\bindia\b.*)$/iu;
// Indian cities and states. Many people with a foreign number (often Gulf numbers) live in India; when
// the row has no Indian address marker they still count for the number's country, but "Delhi" is not
// offered as a city of the UAE.
const INDIAN_PLACES = new Set([
  ...INDIA_STATES,
  ...require("../frontend/src/cities.json").india.people.map((c) => c.name),
  ...require("../frontend/src/cities.json").india.companies.map((c) => c.name),
  ...CITY_ALIAS_GROUPS.filter((g) => !["Montreal", "Ho Chi Minh City"].includes(g[0])).flat(),
  "Cochin", "Calicut", "Kozhikode", "Navi Mumbai", "Secunderabad", "Thane", "Kerala",
].map((n) => n.toLowerCase()));
const isIndianPlace = (name) => name.toLowerCase().split("/").some((part) => INDIAN_PLACES.has(part.trim()));

/** Candidate cards for one country from the grouped rows [{city, state, n}], largest first. */
function candidates(code, rows) {
  const byCard = new Map();
  for (const r of rows) {
    const raw = String(r.city || "").trim();
    if (!raw || NOT_A_CITY.test(raw.replace(/\s+/g, " "))) continue;
    if (isIndianPlace(raw)) continue;
    const name = canonicalCity(raw);
    let state = null;
    if (code === "CA") {
      state = String(r.state || "").trim().toUpperCase();
      if (!CA_PROVINCES.has(state)) continue;
    }
    const key = `${name.toLowerCase()}|${state || ""}`;
    const card = byCard.get(key) || { name, state, n: 0 };
    card.n += Number(r.n);
    byCard.set(key, card);
  }
  return [...byCard.values()].filter((c) => c.n >= MIN_CARD / 2).sort((a, b) => b.n - a.n).slice(0, MAX_CARDS * 2);
}

/** Exact counts: each card's search WHERE clause, evaluated on the grouped rows (agg has column n). */
async function countCards(db, aggSql, cards, whereFor) {
  if (!cards.length) return [];
  const values = [];
  const sums = cards.map((card, i) => {
    const { whereStr, values: v } = whereFor(card);
    const offset = values.length;
    values.push(...v);
    const cond = whereStr.replace(/^WHERE /, "").replace(/\$(\d+)/g, (_, d) => `$${Number(d) + offset}`);
    return `COALESCE(sum(n) FILTER (WHERE ${cond}), 0)::bigint AS c${i}`;
  });
  const { rows } = await db.query(`WITH agg AS MATERIALIZED (${aggSql}) SELECT ${sums.join(",\n")} FROM agg`, values);
  return cards.map((card, i) => ({ ...card, count: Number(rows[0][`c${i}`]) }));
}

/**
 * True when the city name is mostly found in Indian rows (≥ 10× this card's count): people with a
 * foreign number but an Indian city ("Trichy" under the UAE). Uses the btree index on city.
 */
async function mostlyIndian(db, table, indiaWhere, card) {
  const spellings = [...new Set([card.name, card.name.toLowerCase(), card.name.toUpperCase(), titleCase(card.name)])];
  const cap = card.count * 10;
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM (SELECT 1 FROM ${table} WHERE city = ANY($1) AND ${indiaWhere} LIMIT ${cap}) x`, [spellings]);
  return rows[0].n >= cap;
}

async function main() {
  const db = new Client({ connectionString: process.env.NEON_DIRECT_URL || process.env.NEON_DATABASE_URL });
  await db.connect();
  await db.query("SET default_transaction_read_only = on; SET statement_timeout = 0");

  const out = { generatedAt: new Date().toISOString(), countries: {} };
  for (const [kind, table, where, schemaCols, indiaWhere] of [
    ["companies", "final.companies", companiesWhere, ["city", "state", "phone_country", "geo_source"], companiesCountryWhere("IN")],
    ["people", "final.people", peopleWhere, ["city", "state", "phone_country", "geo_source", "location"], peopleCountryWhere("IN")],
  ]) {
    const t = Date.now();
    // Every non-India/USA row, grouped down to the columns the card filters use.
    // location is reduced to the markers the India / USA rules test (as in refresh_explorer_counts.js).
    const location = kind === "people"
      ? `NULLIF(concat_ws(' ', CASE WHEN location ILIKE '%United States%' THEN 'United States' END,
           CASE WHEN location ILIKE '%USA%' THEN 'USA' END, CASE WHEN location ILIKE '%India%' THEN 'India' END), '')`
      : "NULL::text";
    const aggSql = `SELECT phone_country, city, state, geo_source, ${location} AS location, count(*) AS n
      FROM ${table} WHERE phone_country NOT IN ('IN', 'US') GROUP BY 1, 2, 3, 4, 5`;
    const { rows } = await db.query(aggSql);
    const perCountry = new Map();
    for (const r of rows) {
      const code = r.phone_country;
      if (!/^[A-Z]{2}$/.test(code || "") || SUSPECT_CODES.has(code) || !countryName(code)) continue;
      if (!perCountry.has(code)) perCountry.set(code, []);
      perCountry.get(code).push(r);
    }
    const schema = { actualCols: schemaCols };
    const cards = [];
    for (const [code, list] of perCountry) for (const c of candidates(code, list)) cards.push({ ...c, code });
    const counted = await countCards(db, aggSql, cards, (c) => where(cityCardParams(c.code, c), null, schema));
    for (const c of counted) {
      if (c.count < MIN_CARD) continue;
      if (c.code !== "CA" && await mostlyIndian(db, table, indiaWhere, c)) { console.log(`  skip ${c.code} ${c.name}: mostly an Indian city`); continue; }
      const entry = (out.countries[c.code] ||= { name: countryName(c.code) });
      (entry[kind] ||= []).push(c.state ? { name: c.name, state: c.state, count: c.count } : { name: c.name, count: c.count });
    }
    for (const entry of Object.values(out.countries)) {
      if (entry[kind]) entry[kind] = entry[kind].sort((a, b) => b.count - a.count).slice(0, MAX_CARDS);
    }
    console.log(`${kind}: ${counted.filter((c) => c.count >= MIN_CARD).length} cards in ${Math.round((Date.now() - t) / 1000)}s`);
  }
  await db.end();

  // Largest countries first.
  const sorted = Object.entries(out.countries).sort(([, a], [, b]) =>
    ((b.people || []).length + (b.companies || []).length) - ((a.people || []).length + (a.companies || []).length));
  out.countries = Object.fromEntries(sorted.map(([code, e]) => [code, { name: e.name, companies: e.companies || [], people: e.people || [] }]));
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
  for (const [code, e] of Object.entries(out.countries)) {
    console.log(`${code} ${e.name}: companies ${e.companies.length}, people ${e.people.length}`);
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
module.exports = { cityCardParams, canonicalCity, candidates };
