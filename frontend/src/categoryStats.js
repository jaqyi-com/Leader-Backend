// Category lists shown on the public pages (landing preview and /categories), from the generated
// files: categories.json (India / USA) and worldCategories.json (other countries).
import CATEGORIES_DATA from "./categories.json" with { type: "json" };
import WORLD_CATEGORIES from "./worldCategories.json" with { type: "json" };

export { CATEGORIES_DATA };

/** Other countries with category cards, most cards first: [{ code, name, company, people }]. */
export const GLOBAL_COUNTRIES = Object.entries(WORLD_CATEGORIES.countries || {})
  .map(([code, c]) => ({ code, name: c.name, company: c.companies || [], people: c.people || [] }))
  .filter((c) => c.company.length + c.people.length > 0)
  .sort((a, b) => (b.company.length + b.people.length) - (a.company.length + a.people.length) || a.name.localeCompare(b.name));

/** Every industry and job-title list entry, all countries. */
export const TOTAL_CATEGORIES =
  ["india", "usa"].reduce((s, c) => s + CATEGORIES_DATA[c].company.length + CATEGORIES_DATA[c].people.length, 0) +
  GLOBAL_COUNTRIES.reduce((s, c) => s + c.company.length + c.people.length, 0);

/** Countries with category lists (India, USA and the global ones). */
export const CATEGORY_COUNTRIES = 2 + GLOBAL_COUNTRIES.length;
