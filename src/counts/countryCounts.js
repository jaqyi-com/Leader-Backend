"use strict";
// ============================================================
// PEOPLE / COMPANIES PER COUNTRY  → explorer counts key "countries"
// ============================================================
// Each number is what selecting that country returns: the same rules as the search
// (src/utils/countries.js) — India / USA by address plus the phone country, every other country by
// the phone country unless the address says India / USA. Codes that are usually mis-parsed numbers
// (SUSPECT_CODES) are left out.
// The full scan of final.people (~45M rows) is split into block ranges so each piece fits in one
// API call (src/counts/job.js); the pieces are simply added up.
// ============================================================

const { peopleCountryWhere, companiesCountryWhere, countryName, SUSPECT_CODES } = require("../utils/countries");
const { blockRange } = require("./cards");

const RULES = { people: peopleCountryWhere, companies: companiesCountryWhere };

/** Counts per country code for block range [from, to) of a table: { CODE: n }. */
async function countRange(db, kind, from, to) {
  const where = RULES[kind];
  const { rows } = await db.query(`
    SELECT COALESCE((${where("US")}), false) AS is_us, COALESCE((${where("IN")}), false) AS is_in,
           phone_country, count(*)::bigint AS n
      FROM final.${kind} WHERE ${blockRange(from, to)} GROUP BY 1, 2, 3`);
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

/** Add one range's counts into a running total (both { CODE: n }). */
function addCounts(total, part) {
  for (const [k, v] of Object.entries(part)) total[k] = (total[k] || 0) + v;
  return total;
}

/** The "countries" document from the people and companies totals. */
function assemble(people, companies) {
  const codes = new Set([...Object.keys(people), ...Object.keys(companies)]);
  const countries = [...codes]
    .filter((code) => /^[A-Z]{2}$/.test(code) && !SUSPECT_CODES.has(code) && countryName(code))
    .map((code) => ({ code, name: countryName(code), people: people[code] || 0, companies: companies[code] || 0 }))
    .sort((a, b) => (b.people + b.companies) - (a.people + a.companies) || a.name.localeCompare(b.name));
  return { generatedAt: new Date().toISOString(), countries };
}

module.exports = { countRange, addCounts, assemble };
