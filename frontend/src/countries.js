// Countries in Doott and how many people / companies each has.
// Counts come from the daily count job (src/counts/countryCounts.js) — never typed by hand. They are served live
// (liveCounts.js); countries.json is the built-in copy used until the live one arrives.
import COUNTRY_DATA from "./countries.json";
import { initCounts, getCounts } from "./liveCounts";

initCounts("countries", COUNTRY_DATA);

/** Built-in list (pre-rendered pages); components should call countryList() for live numbers. */
export const COUNTRIES = COUNTRY_DATA.countries;
/** Current list: live when loaded (useLiveCounts("countries") re-renders on arrival). */
export const countryList = () => getCounts("countries").countries;
export const MAIN_MARKETS = ["IN", "US", "CA"];
/** Countries below this many records (for the kind shown) are listed under "Show all". */
export const SMALL_COUNTRY = 100;
/** A selected country below this many records gets a "limited coverage" note. */
export const LIMITED_COVERAGE = 1000;

let byCodeFor = null;
let BY_CODE = new Map();
function byCode() {
  const list = countryList();
  if (byCodeFor !== list) { BY_CODE = new Map(list.map((c) => [c.code, c])); byCodeFor = list; }
  return BY_CODE;
}
export const countryByCode = (code) => byCode().get(String(code || "").toUpperCase()) || null;

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
  return byCode().has(code) ? code : "";
}

export const fmtCount = (n) => Number(n || 0).toLocaleString("en-US");
