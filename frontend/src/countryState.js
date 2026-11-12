// Country state shared by the data pages: read it from the URL, remember the last one used.
import { toCountryCode } from "./countries";

const KEY = "doott_country";

/** Country in the URL: ?country=DE, or f_country / f_country_eq from category and city links.
 *  Returns a code, "" for an explicit "all", or null when the URL says nothing about country. */
export function countryFromUrl(searchParams) {
  const raw = searchParams.get("country") ?? searchParams.get("f_country") ?? searchParams.get("f_country_eq");
  if (raw === null) return null;
  return toCountryCode(raw);
}

/** The picker owns the country, so drop any "country" rows from the query-builder filters. */
export const withoutCountryFilters = (filters) => filters.filter((f) => f.col !== "country");

export function rememberCountry(code) {
  try { code ? localStorage.setItem(KEY, code) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export function rememberedCountry() {
  try { return toCountryCode(localStorage.getItem(KEY)); } catch { return ""; }
}
