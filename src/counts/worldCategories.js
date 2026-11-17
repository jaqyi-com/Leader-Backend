"use strict";
// ============================================================
// CATEGORY CARDS FOR COUNTRIES OTHER THAN INDIA / USA  → explorer counts key "world_categories"
// ============================================================
// Companies: the largest industries per country. People: the largest job titles per country.
// A row's country follows the same rules as everywhere else (src/utils/countries.js: the phone
// number's country, unless the address says India / USA). Every count runs the WHERE clause of the
// Companies / People search with the exact URL filters the card sends (categoryCardParams, mirrored in
// CategoryExplorerPage), so a card's number is what its click finds. Only rows with
// phone_country NOT IN ('IN', 'US') are read (partial index idx_*_phone_country_other).
// ============================================================

const { SUSPECT_CODES, countryName } = require("../utils/countries");
const { NOT_A_CATEGORY } = require("./explorerCards");
const { countCards } = require("./cards");

const MIN_CARD = 5;     // fewest records a card may show (most of these countries are small)
const MAX_CARDS = 120;  // per country and kind

const KINDS = {
  companies: { table: "final.companies", route: "../routes/finalCompaniesDatabase", col: "industry", param: "f_industry_eq",
    cols: ["industry", "city", "state", "phone_country", "geo_source"] },
  people: { table: "final.people", route: "../routes/finalPeopleDatabase", col: "job_title", param: "f_job_title_eq",
    cols: ["job_title", "city", "state", "phone_country", "geo_source", "location"] },
};

/** The URL filters a card sends (CategoryExplorerPage builds the same). */
function categoryCardParams(kind, code, card) {
  return { country: code, [KINDS[kind].param]: card.name };
}

/** Candidate cards for one country from grouped rows [{v, n}]: one per value (case-insensitive), most common spelling. */
function candidates(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const name = String(r.v || "").trim();
    if (!name || NOT_A_CATEGORY.test(name)) continue;
    const key = name.toLowerCase();
    const e = byKey.get(key) || { total: 0, spellings: new Map() };
    e.total += Number(r.n);
    e.spellings.set(name, (e.spellings.get(name) || 0) + Number(r.n));
    byKey.set(key, e);
  }
  return [...byKey.values()]
    .filter((e) => e.total >= MIN_CARD)
    .map((e) => ({ name: [...e.spellings].sort((a, b) => b[1] - a[1])[0][0], n: e.total }))
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_CARDS * 2);
}

/** Category cards of one kind ("companies" | "people"): { CODE: [{ name, count }] }. */
async function cardsForKind(db, kind) {
  const { table, route, col, cols } = KINDS[kind];
  const { buildWhere } = require(route);
  // Every non-India/USA row, grouped down to the columns the card filters use. location is reduced to
  // the markers the India / USA rules test. The value column is kept as stored: the card's
  // "equals" filter is matched against it.
  const location = kind === "people"
    ? `NULLIF(concat_ws(' ', CASE WHEN location ILIKE '%United States%' THEN 'United States' END,
         CASE WHEN location ILIKE '%USA%' THEN 'USA' END, CASE WHEN location ILIKE '%India%' THEN 'India' END), '')`
    : "NULL::text";
  const aggSql = `SELECT phone_country, ${col}, city, state, geo_source, ${location} AS location, count(*) AS n
    FROM ${table} WHERE phone_country NOT IN ('IN', 'US')
    GROUP BY 1, 2, 3, 4, 5, 6`;
  // No condition on the value column here: the planner would then AND in its (huge) trigram index
  // instead of reading just the small partial index — minutes instead of seconds. Empty values are
  // skipped when the candidates are picked.
  const { rows } = await db.query(`SELECT phone_country, ${col} AS v, sum(n) AS n FROM (${aggSql}) a GROUP BY 1, 2`);
  const perCountry = new Map();
  for (const r of rows) {
    const code = r.phone_country;
    if (!/^[A-Z]{2}$/.test(code || "") || SUSPECT_CODES.has(code) || !countryName(code)) continue;
    if (!perCountry.has(code)) perCountry.set(code, []);
    perCountry.get(code).push(r);
  }
  const cards = [];
  for (const [code, list] of perCountry) for (const c of candidates(list)) cards.push({ ...c, code });
  const counted = await countCards(db, aggSql, cards,
    (c) => buildWhere(categoryCardParams(kind, c.code, c), null, { actualCols: cols }));
  const out = {};
  for (const c of counted) if (c.count >= MIN_CARD) (out[c.code] ||= []).push({ name: c.name, count: c.count });
  for (const code of Object.keys(out)) out[code] = out[code].sort((a, b) => b.count - a.count).slice(0, MAX_CARDS);
  return out;
}

/** The "world_categories" document from both kinds' cards, largest countries first. */
function assemble({ companies = {}, people = {} }) {
  const codes = [...new Set([...Object.keys(companies), ...Object.keys(people)])];
  const size = (c) => (companies[c] || []).reduce((s, x) => s + x.count, 0) + (people[c] || []).reduce((s, x) => s + x.count, 0);
  codes.sort((a, b) => size(b) - size(a));
  return {
    generatedAt: new Date().toISOString(),
    countries: Object.fromEntries(codes.map((c) => [c, { name: countryName(c), companies: companies[c] || [], people: people[c] || [] }])),
  };
}

module.exports = { categoryCardParams, candidates, cardsForKind, assemble, MIN_CARD, MAX_CARDS };
