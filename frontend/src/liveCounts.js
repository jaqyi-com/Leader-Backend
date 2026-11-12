// Live counts for the country picker and the city / category cards.
//
// The numbers are made nightly in the background and served by GET /api/explorer-counts
// (app.explorer_counts in Neon), so they change without a deploy. Pages start with the JSON built
// into the site (countries.json, worldCities.json, …) and switch to the live copy as soon as it
// arrives; if the request fails (or nobody is signed in), the built-in numbers simply stay.
import { useEffect, useSyncExternalStore } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const data = {};               // key → current counts (built-in first, then live)
const requested = new Set();   // keys already fetched (or being fetched) this session
const listeners = new Set();
let version = 0;

/** Register the built-in copy of a key (each module imports only the JSON it needs). */
export function initCounts(key, builtIn) {
  if (!(key in data)) data[key] = builtIn;
}

/** Current counts for a key (live when loaded, else built-in). */
export const getCounts = (key) => data[key];

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// The shape every key must have before it replaces the built-in copy.
const VALID = {
  countries: (d) => Array.isArray(d?.countries) && d.countries.length > 0,
  world_cities: (d) => d && typeof d.countries === "object",
  cities: (d) => d?.india && d?.usa,
  categories: (d) => d?.india && d?.usa,
};

function load(keys) {
  const missing = keys.filter((k) => !requested.has(k));
  if (!missing.length || typeof fetch !== "function") return;
  missing.forEach((k) => requested.add(k));
  let token = null;
  try { token = localStorage.getItem("leader_token"); } catch { /* storage blocked */ }
  if (!token) { missing.forEach((k) => requested.delete(k)); return; } // signed-out pages keep the built-in numbers
  fetch(`${API}/explorer-counts?keys=${missing.join(",")}`, { headers: { authorization: `Bearer ${token}` } })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (!json) return;
      let changed = false;
      for (const k of missing) {
        if (VALID[k]?.(json[k])) { data[k] = json[k]; changed = true; }
      }
      if (changed) { version++; listeners.forEach((fn) => fn()); }
    })
    .catch(() => { /* keep the built-in numbers */ });
}

/**
 * Use live counts in a component: fetches the keys once per session and re-renders when they
 * arrive. Returns a version number (handy as a useMemo dependency).
 */
export function useLiveCounts(...keys) {
  const key = keys.join(",");
  useEffect(() => { load(key.split(",")); }, [key]);
  return useSyncExternalStore(subscribe, () => version, () => version);
}
