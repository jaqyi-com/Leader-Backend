#!/usr/bin/env node
"use strict";
/**
 * Recounts the cards on the Categories and Cities pages and rewrites
 * frontend/src/categories.json and frontend/src/cities.json.
 *
 * Each card's number is the number of rows its click finds: the count runs the same WHERE clause
 * as the Companies / People search (buildWhere from the route), with the same URL filters the card
 * sends. So the number on a card and the result after clicking it always agree.
 *
 * The card lists come from the current JSON files: names are de-duplicated (case-insensitive, and
 * city spellings such as Bangalore/Bengaluru become one card), cards that match nothing are
 * dropped, and each list is sorted by count.
 *
 * Read-only on the database. Scans final.companies (~1.5M rows) and final.people (~45M rows) once
 * each; the people scan takes several minutes.
 *
 * Usage:
 *   node scripts/refresh_explorer_counts.js                  # recount everything
 *   node scripts/refresh_explorer_counts.js --companies-only # skip the people scan (keeps people counts)
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { CITY_ALIASES, CITY_ALIAS_GROUPS } = require("../src/utils/searchFilters");
const { buildWhere: companiesWhere } = require("../src/routes/finalCompaniesDatabase");
const { buildWhere: peopleWhere } = require("../src/routes/finalPeopleDatabase");

const ROOT = path.join(__dirname, "..");
const CATEGORIES_FILE = path.join(ROOT, "frontend/src/categories.json");
const CITIES_FILE = path.join(ROOT, "frontend/src/cities.json");
const COMPANIES_ONLY = process.argv.includes("--companies-only");

// ── Card lists ─────────────────────────────────────────────

function dedupe(cards, keyOf) {
  const seen = new Map();
  for (const card of cards) {
    const key = keyOf(card);
    if (!seen.has(key)) seen.set(key, card);
  }
  return [...seen.values()];
}

const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s);

/** "Calcutta" → "Kolkata", "Cochin/ Kochi/ Ernakulam" → "Kochi", "COIMBATORE" → "Coimbatore". */
function canonicalCity(name) {
  for (const part of name.split("/").map((p) => p.trim()).filter(Boolean)) {
    const aliases = CITY_ALIASES[part.toLowerCase()];
    if (aliases) return CITY_ALIAS_GROUPS.find((g) => g.includes(aliases[0]))[0];
  }
  return titleCase(name.split("/")[0].trim());
}

function categoryCards(list) {
  return dedupe(list.map(({ name }) => ({ name })), (c) => c.name.toLowerCase());
}

function indiaCityCards(list) {
  const cards = list.map(({ name, state }) => ({ name: canonicalCity(name), state }));
  if (!cards.some((c) => c.name === "Delhi")) cards.push({ name: "Delhi", state: "Delhi" });
  for (const c of cards) if (c.name === "Delhi") c.state = "Delhi";
  return dedupe(cards, (c) => c.name.toLowerCase());
}

function usaCityCards(list) {
  // A USA card needs its state: the click filters by it (there are several Columbuses).
  const cards = list.filter((c) => c.state).map(({ name, state }) => ({ name, state }));
  return dedupe(cards, (c) => `${c.name.toLowerCase()}|${c.state}`);
}

// ── Counting ───────────────────────────────────────────────

/**
 * Sums the rows of an aggregated table (column n) matching each card's WHERE clause.
 * `aggSql` groups the base table down to the columns the WHERE clauses use, so the costly scan
 * happens once and each card's filter runs on the much smaller aggregate.
 */
async function countCards(db, aggSql, cards, whereFor) {
  const values = [];
  const sums = cards.map((card, i) => {
    const { whereStr, values: v } = whereFor(card);
    const offset = values.length;
    values.push(...v);
    const cond = whereStr.replace(/^WHERE /, "").replace(/\$(\d+)/g, (_, d) => `$${Number(d) + offset}`);
    return `COALESCE(sum(n) FILTER (WHERE ${card.kindCond} AND ${cond}), 0)::bigint AS c${i}`;
  });
  const { rows } = await db.query(`WITH agg AS MATERIALIZED (${aggSql}) SELECT ${sums.join(",\n")} FROM agg`, values);
  return cards.map((card, i) => ({ ...card, count: Number(rows[0][`c${i}`]) }));
}

const finish = (cards) =>
  cards.filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(({ name, state, count }) => (state ? { name, state, count } : { name, count }));

async function main() {
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf8"));
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, "utf8"));
  // Older files keep USA cities in top-level "companies"/"people" and India cities in an array.
  const oldIndiaCities = Array.isArray(cities.india) ? cities.india : cities.india.companies;
  const oldUsaCities = cities.usa ? cities.usa.companies : cities.companies;

  const db = new Client({ connectionString: process.env.NEON_DIRECT_URL || process.env.NEON_DATABASE_URL });
  await db.connect();
  await db.query("SET default_transaction_read_only = on; SET statement_timeout = 0");

  const companySchema = { actualCols: ["geo_source", "industry", "city", "state"] };
  const peopleSchema = { actualCols: ["geo_source", "job_title", "city", "state", "location"] };

  // One scan of companies, grouped two ways. ILIKE is case-insensitive, so lower() only merges groups.
  const companiesAgg = `
    SELECT geo_source, lower(industry) AS industry, lower(city) AS city, state, GROUPING(lower(industry)) AS by_city, count(*) AS n
    FROM final.companies
    GROUP BY GROUPING SETS ((geo_source, lower(industry)), (geo_source, lower(city), state))`;
  // People: location is only ever tested for "United States" / "USA", so it is reduced to those.
  const peopleAgg = `
    SELECT geo_source, state, location, lower(job_title) AS job_title, lower(city) AS city,
           GROUPING(lower(job_title)) AS by_city, count(*) AS n
    FROM (SELECT geo_source, state, job_title, city,
                 CASE WHEN location ILIKE '%United States%' THEN 'United States'
                      WHEN location ILIKE '%USA%' THEN 'USA' END AS location
          FROM final.people) p
    GROUP BY GROUPING SETS ((geo_source, state, location, lower(job_title)), (geo_source, state, location, lower(city)))`;

  // by_city is 0 on the industry / job-title rows of the aggregate and 1 on the city rows.
  const categoryCard = (country) => (c) => ({ ...c, country, kindCond: "by_city = 0" });
  const cityCard = (country) => (c) => ({ ...c, country, kindCond: "by_city = 1" });
  const isCity = (c) => c.kindCond === "by_city = 1";
  // Same URL filters the cards send (see CategoryExplorerPage / CityExplorerPage handleClick).
  const industryWhere = (c) => companiesWhere({ f_industry: c.name, f_country: c.country }, null, companySchema);
  const titleWhere = (c) => peopleWhere({ f_job_title: c.name, f_country: c.country }, null, peopleSchema);
  const cityParams = (c) => (c.country === "india"
    ? { f_city: c.name, f_country: "india" }
    : { f_city: c.name, f_state_eq: c.state });
  const companyCityWhere = (c) => companiesWhere(cityParams(c), null, companySchema);
  const peopleCityWhere = (c) => peopleWhere(cityParams(c), null, peopleSchema);

  const indiaCities = indiaCityCards(oldIndiaCities);
  const usaCities = usaCityCards(oldUsaCities);

  console.log("Counting companies…");
  let t = Date.now();
  const companyCards = [
    ...categoryCards(categories.india.company).map(categoryCard("india")),
    ...categoryCards(categories.usa.company).map(categoryCard("usa")),
  ];
  const companyCityCards = [...indiaCities.map(cityCard("india")), ...usaCities.map(cityCard("usa"))];
  const companyCounts = await countCards(db, companiesAgg, [...companyCards, ...companyCityCards],
    (c) => (isCity(c) ? companyCityWhere(c) : industryWhere(c)));
  console.log(`  done in ${Math.round((Date.now() - t) / 1000)}s`);
  const byGroup = (list, city, country) => list.filter((c) => isCity(c) === city && c.country === country);

  const out = {
    categories: {
      generatedAt: new Date().toISOString(),
      india: { company: finish(byGroup(companyCounts, false, "india")), people: categories.india.people },
      usa: { company: finish(byGroup(companyCounts, false, "usa")), people: categories.usa.people },
    },
    cities: {
      generatedAt: new Date().toISOString(),
      india: { companies: finish(byGroup(companyCounts, true, "india")), people: cities.india.people || [] },
      usa: { companies: finish(byGroup(companyCounts, true, "usa")), people: cities.usa ? cities.usa.people : [] },
    },
  };

  if (!COMPANIES_ONLY) {
    console.log("Counting people (one scan of ~45M rows, takes several minutes)…");
    t = Date.now();
    const titleCards = [
      ...categoryCards(categories.india.people).map(categoryCard("india")),
      ...categoryCards(categories.usa.people).map(categoryCard("usa")),
    ];
    const peopleCityCards = [...indiaCities.map(cityCard("india")), ...usaCities.map(cityCard("usa"))];
    const peopleCounts = await countCards(db, peopleAgg, [...titleCards, ...peopleCityCards],
      (c) => (isCity(c) ? peopleCityWhere(c) : titleWhere(c)));
    console.log(`  done in ${Math.round((Date.now() - t) / 1000)}s`);
    out.categories.india.people = finish(byGroup(peopleCounts, false, "india"));
    out.categories.usa.people = finish(byGroup(peopleCounts, false, "usa"));
    out.cities.india.people = finish(byGroup(peopleCounts, true, "india"));
    out.cities.usa.people = finish(byGroup(peopleCounts, true, "usa"));
  }
  await db.end();

  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(out.categories, null, 2) + "\n");
  fs.writeFileSync(CITIES_FILE, JSON.stringify(out.cities, null, 2) + "\n");
  for (const [file, data] of [["categories", out.categories], ["cities", out.cities]]) {
    for (const country of ["india", "usa"]) {
      const parts = Object.entries(data[country]).map(([k, v]) => `${k} ${v.length}`).join(", ");
      console.log(`${file}.json ${country}: ${parts}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
