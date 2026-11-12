"use strict";
// Live explorer counts: GET /api/explorer-counts serves app.explorer_counts (written by the daily
// count job) and falls back to the built-in JSON files; country totals and the /cities
// endpoints use the same live copy, so new numbers need no deploy.

const test = require("node:test");
const assert = require("node:assert/strict");
const { startStack, available } = require("./helpers/stack");

const skip = !available.postgres && "PostgreSQL not installed";
let stack, user;
const WORLD_FILE = require("../frontend/src/worldCities.json");

test.before(async () => {
  if (skip) return;
  // TTL 0: re-read the table on every request; COUNTRY_COUNTS_FILE "": use the live copy, not a test file.
  stack = await startStack({ env: { EXPLORER_COUNTS_TTL_MS: "0", COUNTRY_COUNTS_FILE: "" } });
  user = await stack.newUser("explorer"); // creates the app schema (incl. app.explorer_counts)
});
test.after(async () => { if (stack) await stack.stop(); });

const save = (key, data) => stack.pg.pool.query(
  `INSERT INTO app.explorer_counts (key, data, generated_at) VALUES ($1, $2, now())
   ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [key, JSON.stringify(data)]);

test("empty table: the built-in files are served; bad keys are refused", { skip }, async () => {
  assert.equal((await stack.http("GET", "/api/explorer-counts?keys=world_cities")).status, 401, "signed-in users only");
  const r = await stack.http("GET", "/api/explorer-counts?keys=world_cities", { token: user.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.world_cities, WORLD_FILE);
  assert.match(r.headers.get("cache-control") || "", /private, no-cache/);
  assert.equal((await stack.http("GET", "/api/explorer-counts?keys=world_cities,passwords", { token: user.token })).status, 400);
  const all = await stack.http("GET", "/api/explorer-counts", { token: user.token });
  assert.deepEqual(Object.keys(all.json).sort(), ["categories", "cities", "countries", "world_cities"]);
});

test("a refresh saved to the table is served at once, with no deploy", { skip }, async () => {
  const world = { generatedAt: "2026-11-13T00:00:00.000Z", countries: { DE: { name: "Germany", companies: [{ name: "Berlin", count: 999 }], people: [] } } };
  await save("world_cities", world);
  const r = await stack.http("GET", "/api/explorer-counts?keys=world_cities", { token: user.token });
  assert.deepEqual(r.json.world_cities, world);
  // the backend's own users of the counts read the same live copy
  await save("cities", { generatedAt: "2026-11-13T00:00:00.000Z", india: { companies: [{ name: "Pune", state: "Maharashtra", count: 7 }], people: [] }, usa: { companies: [], people: [] } });
  const cities = await stack.http("GET", "/api/final-companies/cities", { token: user.token });
  assert.equal(cities.status, 200);
  assert.deepEqual(cities.json.cities.map((c) => [c.name, c.count]), [["Pune", 7]]);
  await save("countries", { generatedAt: "2026-11-13T00:00:00.000Z", countries: [{ code: "DE", name: "Germany", people: 1, companies: 4242 }] });
  const de = await stack.http("GET", "/api/final-companies?country=DE&limit=5", { token: user.token });
  assert.equal(de.json.total, 4242, "country-only total comes from the live counts");
});

test("save() (used by the count job) writes what the API serves, with its generation time", { skip }, async () => {
  const { save: saveCounts } = require("../src/utils/explorerCounts");
  await saveCounts(stack.pg.pool, "categories", { generatedAt: "2026-11-13T01:00:00.000Z", india: { company: [{ name: "Software", count: 3 }], people: [] }, usa: { company: [], people: [] } });
  const r = await stack.http("GET", "/api/explorer-counts?keys=categories", { token: user.token });
  assert.equal(r.json.categories.india.company[0].count, 3);
  const row = (await stack.pg.pool.query("SELECT generated_at FROM app.explorer_counts WHERE key = 'categories'")).rows[0];
  assert.equal(row.generated_at.toISOString(), "2026-11-13T01:00:00.000Z");
});
