"use strict";
// ============================================================
// INDIA / USA CATEGORY AND CITY CARDS  → explorer counts keys "categories" and "cities"
// ============================================================
// Each card's number is the number of rows its click finds: the count runs the same WHERE clause as
// the Companies / People search (buildWhere from the route) with the URL filters the card sends.
//
// Category cards: the current cards plus the largest real industries / job titles per country (so
// big groups such as "Chief Executive Officer" always have a card), minus values that are not
// categories. City cards: the current cards, de-duplicated (Bangalore/Bengaluru → one card).
//
// Both steps scan a whole table, so they work on block ranges (one API call each, src/counts/job.js):
//   discoverRange → mergeDiscovered → pickTop   (largest values; per-range top lists, merged)
//   buildCards → countRange (per range) → add   (exact counts; sums over ranges are exact)
// ============================================================

const { CITY_ALIASES, CITY_ALIAS_GROUPS } = require("../utils/searchFilters");
const { peopleCountryWhere, companiesCountryWhere } = require("../utils/countries");
const { countCards, blockRange } = require("./cards");

// ── Card lists ─────────────────────────────────────────────

function dedupe(cards, keyOf) {
  const seen = new Map();
  for (const card of cards) {
    const k = keyOf(card);
    if (!seen.has(k)) seen.set(k, card);
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

// Values in the industry / job_title columns that are not categories: membership or card tiers
// ("GOLD", "Visa Silver Plus"), bare numbers or letters, and placeholders.
const NOT_A_CATEGORY = /^(\d+|[a-z]|\W{1,2}|others?|n\/?a|none|null|nil|-+|\.+|gold|silver|classic|platinum|landmark gold|visa\b.*|bc ?gold.*|eplc|owned|resident|hni\b.*)$/i;

function categoryCards(list) {
  const cards = list.map(({ name }) => ({ name: String(name).trim() })).filter((c) => !NOT_A_CATEGORY.test(c.name));
  return dedupe(cards, (c) => c.name.toLowerCase());
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

// ── Per-kind setup ─────────────────────────────────────────

// The India / USA rules fall back to the phone number's country, and only ever test it for 'IN' / 'US',
// so the aggregates keep just those two values (anything else becomes NULL) to stay small.
const PHONE_COUNTRY = `CASE WHEN phone_country IN ('IN', 'US') THEN phone_country END`;

const KINDS = {
  companies: {
    table: "final.companies",
    col: "industry",
    route: "../routes/finalCompaniesDatabase",
    schema: { actualCols: ["geo_source", "industry", "city", "state", "phone_country"] },
    bucket: () => `CASE WHEN ${companiesCountryWhere("US")} THEN 'usa' WHEN ${companiesCountryWhere("IN")} THEN 'india' ELSE 'other' END`,
    limits: { india: { min: 50, max: 400 }, usa: { min: 100, max: 300 } },
    categoryKey: "company",
    citiesKey: "companies",
    categoryParams: (c) => ({ f_industry_eq: c.name, f_country: c.country }),
    // One scan, grouped two ways. ILIKE is case-insensitive, so lower() only merges groups.
    agg: (range) => `
      SELECT geo_source, phone_country, lower(industry) AS industry, lower(city) AS city, state, GROUPING(lower(industry)) AS by_city, count(*) AS n
      FROM (SELECT geo_source, ${PHONE_COUNTRY} AS phone_country, industry, city, state FROM final.companies WHERE ${range}) c
      GROUP BY GROUPING SETS ((geo_source, phone_country, lower(industry)), (geo_source, phone_country, lower(city), state))`,
  },
  people: {
    table: "final.people",
    col: "job_title",
    route: "../routes/finalPeopleDatabase",
    schema: { actualCols: ["geo_source", "job_title", "city", "state", "location", "phone_country"] },
    bucket: () => `CASE WHEN ${peopleCountryWhere("US")} THEN 'usa' WHEN ${peopleCountryWhere("IN")} THEN 'india' ELSE 'other' END`,
    limits: { india: { min: 20, max: 150 }, usa: { min: 1000, max: 300 } },
    categoryKey: "people",
    citiesKey: "people",
    categoryParams: (c) => ({ f_job_title_eq: c.name, f_country: c.country }),
    // location is reduced to the markers the country rules test (each kept separately: "Indiana, USA"
    // has both USA and India). Job titles stay as stored: title cards match exact spellings with "=".
    agg: (range) => `
      SELECT geo_source, phone_country, state, location, job_title, lower(city) AS city,
             GROUPING(job_title) AS by_city, count(*) AS n
      FROM (SELECT geo_source, ${PHONE_COUNTRY} AS phone_country, state, job_title, city,
                   NULLIF(concat_ws(' ',
                     CASE WHEN location ILIKE '%United States%' THEN 'United States' END,
                     CASE WHEN location ILIKE '%USA%' THEN 'USA' END,
                     CASE WHEN location ILIKE '%India%' THEN 'India' END), '') AS location
            FROM final.people WHERE ${range}) p
      GROUP BY GROUPING SETS ((geo_source, phone_country, state, location, job_title), (geo_source, phone_country, state, location, lower(city)))`,
  },
};

// ── Largest values (discover) ──────────────────────────────

const RANGE_TOP = 1500;   // per country, per block range
const KEEP_TOP = 5000;    // per country, in the running merge

/** Largest values of the kind's column in one block range: { india: { key: [spelling, n] }, usa: {…} }. */
async function discoverRange(db, kind, from, to) {
  const { col, table, bucket } = KINDS[kind];
  const { rows } = await db.query(`
    SELECT b, k, name, n FROM (
      SELECT b, lower(btrim(${col})) AS k, mode() WITHIN GROUP (ORDER BY btrim(${col})) AS name, count(*) AS n,
             row_number() OVER (PARTITION BY b ORDER BY count(*) DESC) AS rk
      FROM (SELECT ${bucket()} AS b, ${col} FROM ${table}
             WHERE ${blockRange(from, to)} AND ${col} IS NOT NULL AND btrim(${col}) <> '') s
      WHERE b <> 'other'
      GROUP BY b, lower(btrim(${col}))
    ) t WHERE rk <= ${RANGE_TOP}`);
  const out = { india: {}, usa: {} };
  for (const r of rows) out[r.b][r.k] = [r.name, Number(r.n)];
  return out;
}

/** Merge one range's discover result into the running one (counts add up; the most common spelling wins). */
function mergeDiscovered(total, part) {
  total = total || { india: {}, usa: {} };
  for (const b of ["india", "usa"]) {
    const t = total[b];
    for (const [k, [name, n]] of Object.entries(part[b] || {})) {
      if (!t[k]) t[k] = [name, n, n];               // [spelling, total, count of that spelling's range]
      else {
        t[k][1] += n;
        if (n > t[k][2]) { t[k][0] = name; t[k][2] = n; }
      }
    }
    const entries = Object.entries(t);
    if (entries.length > KEEP_TOP) {
      total[b] = Object.fromEntries(entries.sort((x, y) => y[1][1] - x[1][1]).slice(0, KEEP_TOP));
    }
  }
  return total;
}

/** The largest real values per country from a merged discover result: { india: [{ name }], usa: [...] }. */
function pickTop(kind, merged) {
  const out = { india: [], usa: [] };
  for (const b of ["india", "usa"]) {
    const lim = KINDS[kind].limits[b];
    const sorted = Object.values((merged || {})[b] || {}).sort((x, y) => y[1] - x[1]);
    for (const [name, n] of sorted) {
      // ALL-CAPS values are shown in normal case; cards match case-insensitively, so the count is the same.
      if (n >= lim.min && out[b].length < lim.max && !NOT_A_CATEGORY.test(name)) out[b].push({ name: name.length > 3 ? titleCase(name) : name });
    }
  }
  return out;
}

// ── Exact counts ───────────────────────────────────────────

/**
 * Every card of a kind: category cards (current + top values) and city cards (current ones).
 * base: { categories, cities } documents now served. Returns plain objects (they are kept in the job state).
 */
function buildCards(kind, base, top) {
  const k = KINDS[kind];
  const { categories, cities } = base;
  // Older files keep USA cities in top-level "companies"/"people" and India cities in an array.
  const oldIndia = Array.isArray(cities.india) ? cities.india : (cities.india.companies || []);
  const oldUsa = cities.usa ? cities.usa.companies : cities.companies;
  const cards = [];
  for (const country of ["india", "usa"]) {
    for (const c of categoryCards([...(categories[country][k.categoryKey] || []), ...((top && top[country]) || [])])) {
      cards.push({ name: c.name, country, city: false });
    }
  }
  for (const c of indiaCityCards(oldIndia)) cards.push({ name: c.name, state: c.state, country: "india", city: true });
  for (const c of usaCityCards(oldUsa)) cards.push({ name: c.name, state: c.state, country: "usa", city: true });
  return cards;
}

/** Same URL filters the cards send (see CategoryExplorerPage / CityExplorerPage handleClick). */
function whereFor(kind) {
  const k = KINDS[kind];
  const { buildWhere } = require(k.route);
  return (c) => {
    if (!c.city) return buildWhere(k.categoryParams(c), null, k.schema);
    const p = c.country === "india" ? { f_city: c.name, f_country: "india" } : { f_city: c.name, f_state_eq: c.state };
    return buildWhere(p, null, k.schema);
  };
}

/** Counts of every card over block range [from, to): an array in card order. */
async function countRange(db, kind, cards, from, to) {
  const withKind = cards.map((c) => ({ ...c, kindCond: c.city ? "by_city = 1" : "by_city = 0" }));
  const counted = await countCards(db, KINDS[kind].agg(blockRange(from, to)), withKind, whereFor(kind));
  return counted.map((c) => c.count);
}

const finish = (cards) =>
  cards.filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(({ name, state, count }) => (state ? { name, state, count } : { name, count }));

/**
 * New { categories, cities } documents. results: { companies?: { cards, counts }, people?: {…} };
 * a kind without results keeps the cards of `base`.
 */
function assemble(base, results) {
  const now = new Date().toISOString();
  const categories = { generatedAt: now, india: { ...base.categories.india }, usa: { ...base.categories.usa } };
  const cities = { generatedAt: now, india: { ...base.cities.india }, usa: { ...base.cities.usa } };
  for (const kind of ["companies", "people"]) {
    const r = results[kind];
    if (!r) continue;
    const counted = r.cards.map((c, i) => ({ ...c, count: r.counts[i] || 0 }));
    for (const country of ["india", "usa"]) {
      categories[country][KINDS[kind].categoryKey] = finish(counted.filter((c) => !c.city && c.country === country));
      cities[country][KINDS[kind].citiesKey] = finish(counted.filter((c) => c.city && c.country === country));
    }
  }
  return { categories, cities };
}

module.exports = { KINDS, discoverRange, mergeDiscovered, pickTop, buildCards, countRange, assemble, canonicalCity };
