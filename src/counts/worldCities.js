"use strict";
// ============================================================
// CITY CARDS FOR COUNTRIES OTHER THAN INDIA / USA  → explorer counts key "world_cities"
// ============================================================
// A row's country is its phone number's country (the address wins for India / USA), and its city is
// the stored city. Canada also has the province in "state" (ON, BC, …), so Canadian cards are per
// city + province; rows whose state is not a Canadian province are left out. Other countries' cards
// are per city.
// Every count runs the WHERE clause of the People / Companies search with the exact URL filters the
// card sends (cityCardParams, mirrored in CityExplorerPage), so a card's number is what its click
// finds. Cards below MIN_CARD records are dropped. Only rows with phone_country NOT IN ('IN', 'US')
// are read (partial index idx_*_phone_country_other): well under a minute per table.
// ============================================================

const { CITY_ALIASES, CITY_ALIAS_GROUPS, INDIA_STATES } = require("../utils/searchFilters");
const { SUSPECT_CODES, countryName, peopleCountryWhere, companiesCountryWhere } = require("../utils/countries");
const { countCards } = require("./cards");

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
  ...require("../../frontend/src/cities.json").india.people.map((c) => c.name),
  ...require("../../frontend/src/cities.json").india.companies.map((c) => c.name),
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


const KINDS = {
  companies: { table: "final.companies", route: "../routes/finalCompaniesDatabase", cols: ["city", "state", "phone_country", "geo_source"], india: () => companiesCountryWhere("IN") },
  people: { table: "final.people", route: "../routes/finalPeopleDatabase", cols: ["city", "state", "phone_country", "geo_source", "location"], india: () => peopleCountryWhere("IN") },
};

/** City cards of one kind ("companies" | "people"): { CODE: [{ name, state?, count }] }. */
async function cardsForKind(db, kind, log = () => {}) {
  const { table, route, cols, india } = KINDS[kind];
  const { buildWhere } = require(route);
  // Every non-India/USA row, grouped down to the columns the card filters use. location is reduced to
  // the markers the India / USA rules test.
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
  const cards = [];
  for (const [code, list] of perCountry) for (const c of candidates(code, list)) cards.push({ ...c, code });
  const counted = await countCards(db, aggSql, cards, (c) => buildWhere(cityCardParams(c.code, c), null, { actualCols: cols }));
  const out = {};
  for (const c of counted) {
    if (c.count < MIN_CARD) continue;
    if (c.code !== "CA" && await mostlyIndian(db, table, india(), c)) { log(`skip ${c.code} ${c.name}: mostly an Indian city`); continue; }
    (out[c.code] ||= []).push(c.state ? { name: c.name, state: c.state, count: c.count } : { name: c.name, count: c.count });
  }
  for (const code of Object.keys(out)) out[code] = out[code].sort((a, b) => b.count - a.count).slice(0, MAX_CARDS);
  return out;
}

/** The "world_cities" document from both kinds' cards, largest countries first. */
function assemble({ companies = {}, people = {} }) {
  const codes = [...new Set([...Object.keys(companies), ...Object.keys(people)])];
  const size = (c) => (companies[c] || []).length + (people[c] || []).length;
  codes.sort((a, b) => size(b) - size(a));
  return {
    generatedAt: new Date().toISOString(),
    countries: Object.fromEntries(codes.map((c) => [c, { name: countryName(c), companies: companies[c] || [], people: people[c] || [] }])),
  };
}

module.exports = { cityCardParams, canonicalCity, candidates, cardsForKind, assemble, MIN_CARD };
