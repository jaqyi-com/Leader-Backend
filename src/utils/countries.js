"use strict";
// ============================================================
// COUNTRY FILTER — one definition for every search (People, Emails, Numbers, Companies, Claude, API)
// ============================================================
// The tables have no country column. A row's country comes from:
//   India / USA : the address-based rules used since launch (state, location, geo source), plus the
//                 phone number's country as a fallback (finds ~5M Indian people and ~73K US companies
//                 that have no address marker).
//   all others  : the phone number's country (phone_country, ISO 3166 alpha-2), unless the address
//                 says India or the USA (an Indian address with a UAE number is India; the address wins).
// Country codes are validated to two letters A–Z before they reach SQL, so they are inlined as literals.
// "Other country" conditions repeat the partial-index predicate (phone_country NOT IN ('IN', 'US'))
// so PostgreSQL can use idx_*_phone_country_other (scripts/create_country_indexes.sql).
// ============================================================

const { peopleCountryCondition: peopleIndiaUsa } = require("./searchFilters");

// Codes that show up in phone_country but are almost always mis-parsed Indian/US numbers
// (tiny territories whose dialling codes collide with them). Never offered in the picker.
const SUSPECT_CODES = new Set(["AC", "TA", "NF", "NU", "TK", "TO", "PM", "FK", "SH", "SB", "KI", "TV"]);

// Region codes Intl knows that are not countries, or are outdated aliases of another code
// (UK → GB, BU → MM, TP → TL, ZR → CD, …).
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ", "UK", "BU", "DD", "FX", "TP", "YU", "ZR", "CS", "AN", "NT", "SU", "QU"]);

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
/** English name for an ISO alpha-2 code ("DE" → "Germany"), or null when unknown. */
function countryName(code) {
  if (!/^[A-Z]{2}$/.test(code || "") || NOT_COUNTRIES.has(code)) return null;
  try {
    const n = displayNames.of(code);
    return n && n !== code ? n : null;
  } catch { return null; }
}

// lower-case name / alias → code, built once from every known region code.
const NAME_TO_CODE = new Map();
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    const name = countryName(code);
    if (name && !NAME_TO_CODE.has(name.toLowerCase())) NAME_TO_CODE.set(name.toLowerCase(), code);
  }
}
for (const [alias, code] of Object.entries({
  usa: "US", us: "US", "united states of america": "US", america: "US", "u.s.": "US", "u.s.a.": "US",
  ind: "IN", bharat: "IN", uk: "GB", "great britain": "GB", england: "GB", uae: "AE", "south korea": "KR",
  korea: "KR", russia: "RU", vietnam: "VN", "hong kong": "HK", turkey: "TR", "czech republic": "CZ",
})) NAME_TO_CODE.set(alias, code);

/**
 * Normalise what a user or client sent ("india", "IN", "usa", "Germany", "de") to an ISO code.
 * Returns null for empty / unknown input (no country filter is applied then).
 */
function normalizeCountry(input) {
  const raw = String(input ?? "").trim();
  if (!raw || raw.toLowerCase() === "all") return null;
  const lower = raw.toLowerCase();
  if (NAME_TO_CODE.has(lower)) return NAME_TO_CODE.get(lower);
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && countryName(upper)) return upper;
  return null;
}

const nz = (sql) => `COALESCE((${sql}), false)`;
const otherCountry = (code) => `("phone_country" = '${code}' AND "phone_country" NOT IN ('IN', 'US'))`;

/** WHERE condition for final.people (no leading AND), or null when no/unknown country. */
function peopleCountryWhere(input, { hasPhoneCountry = true } = {}) {
  const code = normalizeCountry(input);
  if (!code) return null;
  const india = peopleIndiaUsa("india");
  const usa = peopleIndiaUsa("usa");
  if (!hasPhoneCountry) return code === "IN" ? india : code === "US" ? usa : "FALSE";
  if (code === "IN") return `(${india} OR ("phone_country" = 'IN' AND NOT ${nz(usa)}))`;
  if (code === "US") return `(${usa} OR ("phone_country" = 'US' AND NOT ${nz(india)}))`;
  return `(${otherCountry(code)} AND NOT ${nz(india)} AND NOT ${nz(usa)})`;
}

const COMPANY_INDIA = `"geo_source" IN ('csv_v2_import', 'pincode')`;
const COMPANY_USA = `"geo_source" IN ('us_zip', 'us_city', 'us_state')`;

/** WHERE condition for final.companies (no leading AND), or null when no/unknown country. */
function companiesCountryWhere(input, { hasPhoneCountry = true } = {}) {
  const code = normalizeCountry(input);
  if (!code) return null;
  if (!hasPhoneCountry) return code === "IN" ? `(${COMPANY_INDIA})` : code === "US" ? `(${COMPANY_USA})` : "FALSE";
  if (code === "IN") return `((${COMPANY_INDIA}) OR ("phone_country" = 'IN' AND NOT ${nz(COMPANY_USA)}))`;
  if (code === "US") return `((${COMPANY_USA}) OR ("phone_country" = 'US' AND NOT ${nz(COMPANY_INDIA)}))`;
  return `(${otherCountry(code)} AND NOT ${nz(COMPANY_INDIA)} AND NOT ${nz(COMPANY_USA)})`;
}

/**
 * True when the country filter must be applied even though the request also filters by city / state.
 * An Indian or US city implies its country (the old India / USA city cards rely on that); any other
 * country's city name is not unique ("London" is in the UK and in Canada), so the country stays.
 */
function countryNeedsOwnFilter(input) {
  const code = normalizeCountry(input);
  return !!code && code !== "IN" && code !== "US";
}

/** The country value a request asked for (country=, f_country=, f_country_eq=, f_country_contains=). */
function requestedCountry(q) {
  return q.country || q.f_country || q.f_country_eq || q.f_country_contains || "";
}

// Exact per-country totals (count job, src/counts/countryCounts.js → app.explorer_counts, with
// frontend/src/countries.json as the fallback; COUNTRY_COUNTS_FILE points tests at their own file).
const countryCounts = () => require("./explorerCounts").get("countries") || { countries: [] };
const NOT_A_FILTER = new Set(["page", "limit", "sort_by", "sort_dir", "country", "f_country", "f_country_eq", "f_country_contains"]);
/**
 * When a search filters by country and nothing else, its exact total from countries.json
 * ("people" or "companies"); null otherwise. The planner's estimate for the India / USA rules is
 * often off by 2×, so the generated count is used instead.
 */
function countryOnlyTotal(table, query) {
  if (Object.entries(query || {}).some(([k, v]) => !NOT_A_FILTER.has(k) && String(v ?? "").trim() !== "")) return null;
  const code = normalizeCountry(requestedCountry(query || {}));
  if (!code) return null;
  const row = countryCounts().countries.find((c) => c.code === code);
  return row && Number.isFinite(row[table]) ? row[table] : null;
}

module.exports = {
  SUSPECT_CODES, countryNeedsOwnFilter, countryOnlyTotal, countryName, normalizeCountry, peopleCountryWhere, companiesCountryWhere, requestedCountry,
};
