"use strict";
// Search, pagination, filter and abuse-resistance tests for /api/final-people against a
// synthetic local PostgreSQL (250 fake people). Skipped when mongod / PostgreSQL are missing.
//
// Tests marked `todo` document KNOWN GAPS: they assert the behaviour we want and currently
// fail; node:test reports them as TODO without failing the run. Remove `todo` once fixed.

const test = require("node:test");
const assert = require("node:assert/strict");
const { startStack, available } = require("./helpers/stack");

const skip = (!available.mongod && "mongod not installed") || (!available.postgres && "PostgreSQL not installed");
let stack, user;
const P = "/api/final-people";
const get = (qs = "", token = user?.token) => stack.http("GET", `${P}${qs}`, { token });
/** Fetch every page of a filtered query and return all records. */
async function all(qs) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const r = await get(`${qs}${qs.includes("?") ? "&" : "?"}limit=100&page=${page}`);
    out.push(...r.json.records);
    if (r.json.records.length < 100) break;
  }
  return out;
}

test.before(async () => {
  if (skip) return;
  stack = await startStack({ postgres: true });
  user = await stack.newUser("searcher");
});
test.after(async () => { if (stack) await stack.stop(); });

test("search: anonymous callers are rejected", { skip }, async () => {
  assert.equal((await get("", null)).status, 401);
});

test("search: list returns rows without internal columns", { skip }, async () => {
  const r = await get("?limit=5");
  assert.equal(r.status, 200);
  assert.equal(r.json.records.length, 5);
  for (const rec of r.json.records) {
    for (const hidden of ["uuid", "company_uuid", "embedding"]) assert.equal(rec[hidden], undefined, `${hidden} must not be returned`);
  }
});

test("pagination: limits are capped, bad values fall back, pages cover all rows exactly once", { skip }, async () => {
  assert.equal((await get("?limit=1000")).json.records.length, 100, "limit capped at 100");
  assert.equal((await get("?limit=0")).json.records.length, 50, "limit=0 falls back to 50");
  assert.equal((await get("?page=abc&limit=10")).json.page, 1);
  assert.equal((await get("?page=-3&limit=10")).json.page, 1);
  assert.equal((await get("?page=99&limit=100")).json.records.length, 0, "past the end is empty");

  const seen = new Set();
  for (let page = 1; page <= 3; page++) {
    const r = await get(`?sort_by=full_name&limit=100&page=${page}`);
    for (const rec of r.json.records) seen.add(rec.full_name);
  }
  assert.equal(seen.size, 250, "every row exactly once across pages (sorted)");
});

test("filters: city, state, job title, has_email and combinations return exactly the right rows", { skip }, async () => {
  const rows = stack.pg.rows;
  const expect = (fn) => rows.filter(fn).length;
  const count = async (qs) => (await all(qs)).length;

  assert.equal(await count("?f_city=Mumbai"), expect((r) => r.city === "Mumbai"));
  assert.equal(await count("?f_state=Maharashtra"), expect((r) => r.state === "Maharashtra"));
  assert.equal(await count("?f_job_title=Designer"), expect((r) => r.job_title === "Designer"));
  assert.equal(await count("?f_has_email=true"), expect((r) => r.emails && r.emails !== "{}"));
  assert.equal(await count("?f_has_email=false"), expect((r) => !r.emails || r.emails === "{}"));
  assert.equal(await count("?f_city=Mumbai&f_has_email=true"), expect((r) => r.city === "Mumbai" && r.emails && r.emails !== "{}"));
  assert.equal(await count("?f_city=Atlantis"), 0, "no match → empty, not an error");

  assert.ok((await all("?f_city=Mumbai")).every((r) => r.city === "Mumbai"));
});

test("email status filter maps friendly names to stored values", { skip }, async () => {
  assert.equal((await all("?f_email_status=deliverable")).length, stack.pg.rows.filter((x) => x.email_status === "deliverable").length);
});

test("injection: hostile filter keys/values and sort columns are inert", { skip }, async () => {
  const before = (await stack.pg.pool.query("select count(*)::int n from final.people")).rows[0].n;
  const attempts = [
    `?f_city=${encodeURIComponent("x'; DROP TABLE final.people; --")}`,
    `?f_job_title=${encodeURIComponent("' OR '1'='1")}`,
    `?sort_by=${encodeURIComponent('full_name"; DROP TABLE final.people; --')}`,
    `?f_${encodeURIComponent('city" OR 1=1 --')}=x`,
    `?f_nonexistent_column=x`,
    `?sort_dir=${encodeURIComponent("asc; DROP TABLE final.people")}&sort_by=full_name`,
    `?page=${encodeURIComponent("1; DROP TABLE final.people")}`,
  ];
  for (const qs of attempts) {
    const r = await get(qs);
    assert.ok([200, 400].includes(r.status), `${qs} → ${r.status}`);
  }
  const after = (await stack.pg.pool.query("select count(*)::int n from final.people")).rows[0].n;
  assert.equal(after, before, "table must be untouched");
  assert.equal((await get("?f_city=' OR '1'='1")).json.records.length, 0, "quote-injection returns nothing");
});

test("counts: unfiltered total equals the real row count (after ANALYZE)", { skip }, async () => {
  assert.equal((await get("?limit=10")).json.total, 250);
});

test("counts: filtered total equals the real number of matches", { skip, todo: "total is a planner ESTIMATE (EXPLAIN rows=) or page*limit+1000 — pagination UI shows wrong totals" }, async () => {
  // Correlated filters defeat the planner's independence assumption, so EXPLAIN's rows= is off.
  const expected = stack.pg.rows.filter((r) => r.city === "Mumbai" && r.emails && r.emails !== "{}").length; // 25
  const r = await get("?f_city=Mumbai&f_has_email=true&limit=10");
  assert.equal(r.json.total, expected);
});

test("job-title matching: 'Factory Manager' must not also match CTOs", { skip, todo: "valLower.includes('cto') fires inside 'fa-cto-ry' / 'dire-cto-r' and adds CTO titles to the results" }, async () => {
  const recs = await all("?f_job_title=Factory%20Manager");
  assert.ok(recs.length > 0);
  assert.ok(recs.every((x) => /factory manager/i.test(x.job_title)), "only Factory Manager rows expected: " + [...new Set(recs.map((x) => x.job_title))].join(", "));
});

// ── Known gaps: abuse resistance / entitlement ───────────────────────────────
test("entitlement: a brand-new free account cannot bulk-read the people database", { skip, todo: "any self-registered user can page the whole dataset — no plan, quota or credit check server-side" }, async () => {
  const fresh = await stack.newUser("freeloader");
  const r = await get("?limit=100", fresh.token);
  assert.ok(r.status === 402 || r.status === 403, `expected 402/403 for an unpaid account, got ${r.status}`);
});

test("rate limit: hammering the people search eventually returns 429", { skip, todo: "docs promise 300 req / 15 min / IP, but no limiter is attached to /api/final-people*" }, async () => {
  let limited = false;
  for (let i = 0; i < 350 && !limited; i++) limited = (await get("?limit=1")).status === 429;
  assert.ok(limited, "350 rapid requests were all served");
});

test("rate limit: repeated wrong-password logins are throttled", { skip, todo: "docs promise 20 req / 15 min / IP on /api/auth/login but no limiter exists — password brute force is unlimited" }, async () => {
  let limited = false;
  for (let i = 0; i < 40 && !limited; i++) {
    const r = await stack.http("POST", "/api/auth/login", { body: { email: user.email, password: "wrong-" + i } });
    limited = r.status === 429;
  }
  assert.ok(limited, "40 wrong-password attempts were all processed");
});

test("signup: the public register endpoint should not bypass the paid/invite flow", { skip, todo: "/register 'gate' is a client-side password in the JS bundle; POST /api/auth/register is open to anyone and returns a working account" }, async () => {
  const r = await stack.http("POST", "/api/auth/register", { body: { name: "x", email: `anon${Date.now()}@example.test`, password: "Passw0rd!anon1" } });
  assert.ok([401, 403].includes(r.status), `anonymous registration returned ${r.status}`);
});
