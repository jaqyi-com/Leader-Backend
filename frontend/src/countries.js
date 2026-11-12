// Countries in Doott and how many people / companies each has.
// Counts come from countries.json, written by scripts/refresh_country_counts.js — never typed by hand.
import COUNTRY_DATA from "./countries.json";

export const COUNTRIES = COUNTRY_DATA.countries;
export const MAIN_MARKETS = ["IN", "US", "CA"];
/** Countries below this many records (for the kind shown) are listed under "Show all". */
export const SMALL_COUNTRY = 100;
/** A selected country below this many records gets a "limited coverage" note. */
export const LIMITED_COVERAGE = 1000;

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryByCode = (code) => BY_CODE.get(String(code || "").toUpperCase()) || null;

/** Flag emoji for an ISO alpha-2 code ("DE" → 🇩🇪). */
export const flag = (code) =>
  /^[A-Z]{2}$/.test(code || "") ? String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : "🌍";

/** Countries with at least SMALL_COUNTRY people + companies (what "N countries" means on the site). */
export const COVERED_COUNTRIES = COUNTRIES.filter((c) => c.people + c.companies >= SMALL_COUNTRY);

/** Normalise a URL / stored value (code or old "india" / "usa") to a code in the list, or "". */
export function toCountryCode(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const legacy = { india: "IN", usa: "US", us: "US", canada: "CA" }[v.toLowerCase()];
  const code = legacy || v.toUpperCase();
  return BY_CODE.has(code) ? code : "";
}

export const fmtCount = (n) => Number(n || 0).toLocaleString("en-US");
