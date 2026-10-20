// Per-route <head> metadata. Used at build time (scripts/prerender.mjs) to write a static
// HTML file for each indexable page, and at runtime (components/RouteMeta.jsx) so the
// tags stay correct after client-side navigation.

export const SITE_URL = "https://doott.jaqyi.com";

const DEFAULT = {
  title: "Doott – B2B Contact Database & Lead Gen Platform",
  description:
    "Search 43.9M B2B contacts with verified emails, phones and job titles. Filter and export to CSV in seconds. No per-seat pricing.",
};

// Public pages that should rank. Each one is pre-rendered to static HTML.
export const INDEXABLE_ROUTES = {
  "/": DEFAULT,
  "/pricing": {
    title: "Doott Pricing – Lifetime Access to 43.9M B2B Contacts",
    description:
      "One price, lifetime access to Doott's B2B database: verified emails, direct phone numbers, company data and unlimited CSV exports. No per-seat fees.",
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
};

export function metaFor(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const page = INDEXABLE_ROUTES[path];
  if (page) return { ...page, canonical: SITE_URL + (path === "/" ? "/" : path), index: true };
  const title = NOINDEX_TITLES[path] || (path.startsWith("/app") ? "Doott" : DEFAULT.title);
  return { title, description: DEFAULT.description, canonical: SITE_URL + "/", index: false };
}
