// Headline numbers for the public pages ("45.4M+ people"), index.html and the SEO tags.
// They come from the built-in country counts (countries.json "totals": every row of final.people /
// final.companies), made by the count job (src/counts/countryCounts.js). Refresh them with
//   node scripts/refresh_counts.js --only countries --files
// and deploy. Never type these numbers by hand.
import COUNTS from "./countries.json" with { type: "json" };

const T = COUNTS.totals || {};
export const PEOPLE_TOTAL = T.people || 0;
export const COMPANIES_TOTAL = T.companies || 0;

// Rounded down so the site never claims more than we have: 45,460,624 → "45.4".
const down = (n, unit) => (Math.floor((n / unit) * 10) / 10).toFixed(1).replace(/\.0$/, "");
/** "45.4M" */
export const PEOPLE_M = `${down(PEOPLE_TOTAL, 1e6)}M`;
/** "45.4 million" */
export const PEOPLE_MILLION = `${down(PEOPLE_TOTAL, 1e6)} million`;
/** "1.7M" */
export const COMPANIES_M = `${down(COMPANIES_TOTAL, 1e6)}M`;
