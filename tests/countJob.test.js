"use strict";
// The daily count job, run by our own API: GET /api/cron/refresh-counts (Vercel Cron) works in
// slices, saves its place in app.count_jobs and calls itself until done. With a 1 ms budget every
// call does exactly one unit, so this exercises the whole chain (≈100 calls) on the fixture data.

const test = require("node:test");
const assert = require("node:assert/strict");
const { startStack, available } = require("./helpers/stack");

const skip = !available.postgres && "PostgreSQL not installed";
const SECRET = "cron-secret-" + "x".repeat(32);
let stack, user;

test.before(async () => {
  if (skip) return;
  stack = await startStack({ env: { CRON_SECRET: SECRET, COUNT_JOB_BUDGET_MS: "1", EXPLORER_COUNTS_TTL_MS: "0", COUNTRY_COUNTS_FILE: "" } });
  user = await stack.newUser("cronjob");
});
test.after(async () => { if (stack) await stack.stop(); });

const cron = (path, secret = SECRET) => fetch(`${stack.base}/api/cron/${path}`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
const q = (sql, v) => stack.pg.pool.query(sql, v);

async function waitDone(ms = 180000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const s = await (await cron("refresh-counts/status")).json();
    if (s.runs[0] && s.runs[0].status !== "running") return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("count job did not finish");
}

test("the cron route needs the secret", { skip }, async () => {
  assert.equal((await cron("refresh-counts", null)).status, 401);
  assert.equal((await cron("refresh-counts", "Bearer-wrong")).status, 401);
  assert.equal((await cron("refresh-counts/status", null)).status, 401);
});

test("a full run completes in many small slices and publishes every count", { skip }, async () => {
  const first = await cron("refresh-counts?force=1&full=1");
  assert.equal(first.status, 202);
  assert.equal((await first.json()).status, "started");
  const s = await waitDone();
  assert.equal(s.runs[0].status, "done", JSON.stringify(s.log.slice(-5)));
  assert.ok(s.runs[0].slices >= 12, `one unit per call: ${s.runs[0].slices} chained calls`);
  const keys = (await q("SELECT key FROM app.explorer_counts ORDER BY key")).rows.map((r) => r.key);
  assert.deepEqual(keys, ["categories", "cities", "countries", "world_cities"]);
  // done for today: another call does nothing
  const again = await cron("refresh-counts");
  assert.equal((await again.json()).status, "up_to_date");
});

test("block-range totals equal one whole-table count", { skip }, async () => {
  const country = require("../src/counts/countryCounts");
  const live = (await q("SELECT data FROM app.explorer_counts WHERE key = 'countries'")).rows[0].data;
  const whole = country.assemble(await country.countRange(stack.pg.pool, "people", 0, null), await country.countRange(stack.pg.pool, "companies", 0, null));
  assert.deepEqual(live.countries, whole.countries);
  assert.equal(live.countries.find((c) => c.code === "DE").companies, 15);
});

test("each card's number is what its search finds", { skip }, async () => {
  const get = async (url) => (await stack.http("GET", url, { token: user.token })).json;
  const { data: cats } = (await q("SELECT data FROM app.explorer_counts WHERE key = 'categories'")).rows[0];
  const software = cats.india.company.find((c) => c.name === "Software");
  assert.ok(software, "India Software category card");
  assert.equal(software.count, (await get("/api/final-companies?f_industry_eq=Software&f_country=india&limit=500")).records.length);
  const { data: cities } = (await q("SELECT data FROM app.explorer_counts WHERE key = 'cities'")).rows[0];
  const mumbai = cities.india.people.find((c) => c.name === "Mumbai");
  assert.equal(mumbai.count, (await get("/api/final-people?f_city=Mumbai&f_country=india&limit=500")).records.length);
  const austin = cities.usa.companies.find((c) => c.name === "Austin");
  assert.equal(austin.count, (await get("/api/final-companies?f_city=Austin&f_state_eq=TX&limit=500")).records.length);
  // and the app serves the new numbers without a deploy
  const served = await stack.http("GET", "/api/explorer-counts?keys=categories", { token: user.token });
  assert.equal(served.json.categories.india.company.find((c) => c.name === "Software").count, software.count);
});

test("block ranges cover the table exactly once", () => {
  const { ranges, blockRange } = require("../src/counts/cards");
  assert.deepEqual(ranges(10, 3), [[0, 4], [4, 8], [8, null]]);
  assert.deepEqual(ranges(0, 24), [[0, null]]);
  assert.deepEqual(ranges(5, 24), [[0, 1], [1, 2], [2, 3], [3, 4], [4, null]]);
  assert.equal(blockRange(4, null), "ctid >= '(4,0)'::tid");
  assert.equal(blockRange(0, 4), "ctid >= '(0,0)'::tid AND ctid < '(4,0)'::tid");
});
