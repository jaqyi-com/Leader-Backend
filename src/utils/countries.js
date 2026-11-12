"use strict";
// ============================================================
// COUNTRY FILTER — one definition for every search (People, Emails, Numbers, Companies, Claude, API)
// ============================================================
// The tables have no country column. A row's country comes from:
//   India / USA : the address-based rules used since launch (state, location, geo source), plus the
//                 phone number's country as a fallback (finds ~5M Indian people and ~73K US companies
//                 that have no address marker).
//   all others  : the phone number's country (phone_country, ISO 3166 alpha-2).
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
  return otherCountry(code);
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
  return otherCountry(code);
}

/** The country value a request asked for (country=, f_country=, f_country_eq=, f_country_contains=). */
function requestedCountry(q) {
  return q.country || q.f_country || q.f_country_eq || q.f_country_contains || "";
}

// Exact per-country totals from frontend/src/countries.json (scripts/refresh_country_counts.js).
// COUNTRY_COUNTS_FILE points elsewhere (tests use their own file).
let COUNTS = null;
function countryCounts() {
  if (!COUNTS) {
    const file = process.env.COUNTRY_COUNTS_FILE || require("path").join(__dirname, "../../frontend/src/countries.json");
    try { COUNTS = JSON.parse(require("fs").readFileSync(file, "utf8")); } catch { COUNTS = { countries: [] }; }
  }
  return COUNTS;
}
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
  SUSPECT_CODES, countryOnlyTotal, countryName, normalizeCountry, peopleCountryWhere, companiesCountryWhere, requestedCountry,
};
