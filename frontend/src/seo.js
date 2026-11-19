// Per-route <head> metadata. Used at build time (scripts/prerender.mjs) to write a static
// HTML file for each indexable page, and at runtime (components/RouteMeta.jsx) so the
// tags stay correct after client-side navigation.

import { PEOPLE_M } from "./siteStats.js";
import { TOTAL_CATEGORIES, CATEGORY_COUNTRIES } from "./categoryStats.js";

export const SITE_URL = "https://doott.jaqyi.com";

const DEFAULT = {
  title: "Doott – B2B Contact Database & Lead Gen Platform",
  description:
    `Search ${PEOPLE_M} B2B contacts with emails, phones and job titles. Filter and export to CSV in seconds. ₹179 lifetime, no per-seat pricing.`,
};

// Public pages that should rank. Each one is pre-rendered to static HTML.
export const INDEXABLE_ROUTES = {
  "/": DEFAULT,
  "/pricing": {
    title: `Doott Pricing – Lifetime Access to ${PEOPLE_M} B2B Contacts`,
    description:
      "One price, lifetime access to Doott's B2B database: verified emails, direct phone numbers, company data and unlimited CSV exports. No per-seat fees.",
  },
  "/categories": {
    title: "B2B Industries & Job Titles by Country – Doott Categories",
    description:
      `Browse ${TOTAL_CATEGORIES.toLocaleString("en-US")} industries and job titles across ${CATEGORY_COUNTRIES} countries in Doott, including India and the USA. Open any category to see its companies or decision-makers.`,
  },
  "/claude": {
    title: "Connect Doott to Claude – Search B2B Leads from Your Chat",
    description:
      `Add Doott as a connector in Claude and search ${PEOPLE_M} B2B contacts and companies by asking in plain English. Setup takes a minute: add the URL, sign in, click Allow.`,
  },
};

// Pages that exist for signed-in users or account flows; keep them out of search results.
const NOINDEX_TITLES = {
  "/login": "Log in – Doott",
  "/register": "Create an account – Doott",
  "/join": "Join Doott",
  "/forgot-password": "Reset your password – Doott",
  "/reset-password": "Reset your password – Doott",
  "/verify-email": "Verify your email – Doott",
  "/auth/callback": "Signing in – Doott",
  "/connect/claude": "Connect to Claude – Doott",
};

export function metaFor(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const page = INDEXABLE_ROUTES[path];
  if (page) return { ...page, canonical: SITE_URL + (path === "/" ? "/" : path), index: true };
  const title = NOINDEX_TITLES[path] || (path.startsWith("/app") ? "Doott" : DEFAULT.title);
  return { title, description: DEFAULT.description, canonical: SITE_URL + "/", index: false };
}
