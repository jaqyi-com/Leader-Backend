"use strict";
// Search, pagination, filter and abuse-resistance tests for /api/final-people against a
// synthetic local PostgreSQL (250 fake people). Skipped when mongod / PostgreSQL are missing.
//
// Abuse resistance (rate limits, access policy, signup mode, result window) lives in abuse.test.js.

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
    const r = await get(`?f_full_name_nonempty=1&sort_by=full_name&limit=100&page=${page}`); // sorting needs a filter
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

test("email status filter: each friendly name returns only its own status (undeliverable ≠ risky/unknown)", { skip }, async () => {
  const rows = stack.pg.rows;
  for (const status of ["deliverable", "undeliverable", "risky", "unknown", "pending"]) {
    const got = await all(`?f_email_status=${status}`);
    assert.equal(got.length, rows.filter((x) => x.email_status === status).length, `${status}: count`);
    assert.ok(got.every((r) => r.email_status === status), `${status}: only ${status} rows (got ${[...new Set(got.map((r) => r.email_status))]})`);
  }
  // production quirk: is_email_valid is FALSE for risky/unknown/undeliverable alike — "invalid" must not use it
  const invalid = await all("?f_email_status=invalid");
  assert.ok(invalid.every((r) => r.email_status === "undeliverable"));
  // verified-good via the boolean alias
  assert.equal((await all("?f_email_status=valid")).length, rows.filter((x) => x.email_status === "deliverable").length);
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

test("counts: filtered totals are exact (not planner estimates) and flagged as exact", { skip }, async () => {
  const rows = stack.pg.rows;
  // Correlated filters used to defeat the planner estimate (28 reported vs 25 real).
  const both = rows.filter((r) => r.city === "Mumbai" && r.emails && r.emails !== "{}").length;
  const r = await get("?f_city=Mumbai&f_has_email=true&limit=10");
  assert.equal(r.json.total, both);
  assert.equal(r.json.total_exact, true);
  assert.equal(r.json.pages, Math.ceil(both / 10));

  // Asking for a page past the end still reports the real total.
  const far = await get("?f_city=Mumbai&f_has_email=true&limit=10&page=99");
  assert.equal(far.json.records.length, 0);
  assert.equal(far.json.total, both);

  assert.equal((await get("?f_state=Maharashtra&limit=10")).json.total, rows.filter((x) => x.state === "Maharashtra").length);
  assert.equal((await get("?f_city=Atlantis&limit=10")).json.total, 0);
  // Unfiltered totals come from table statistics and must say so.
  assert.equal((await get("?limit=10")).json.total_exact, false);
});

test("job-title: short role codes match whole words only (CTO ≠ Factory/Director/Doctor)", { skip }, async () => {
  const rows = stack.pg.rows;
  const titles = async (qs) => [...new Set((await all(qs)).map((x) => x.job_title))].sort();

  assert.deepEqual(await titles("?f_job_title=CTO"), ["CTO"]);
  assert.deepEqual(await titles("?f_job_title=cto"), ["CTO"]);
  assert.equal((await all("?f_job_title=CTO")).length, rows.filter((r) => r.job_title === "CTO").length);
  assert.deepEqual(await titles("?f_job_title=Director"), ["Director"]);
  // Multi-word searches are intentionally fuzzy (phrase OR any word, e.g. "manager"), so other
  // Managers may appear — but never CTO/Director/Doctor, which only matched via the "cto" substring.
  const fm = await titles("?f_job_title=Factory%20Manager");
  assert.ok(fm.includes("Factory Manager"));
  assert.ok(fm.every((t) => /manager/i.test(t)), "unexpected titles: " + fm.join(", "));
  assert.equal((await all("?f_job_title=IT&f_city=Mumbai")).length, 0, "'IT' must not match Recru-it-er");
  assert.deepEqual(await titles("?f_job_title=Doctor"), ["Doctor"]);
});

test("job-title: 2-3 letter terms (IT, HR, CA, CEO) work on their own and match whole words only", { skip }, async () => {
  const titles = async (qs) => [...new Set((await all(qs)).map((x) => x.job_title))].sort();
  // fixture titles never contain the WORD "IT"/"HR"/"CA" (only Recru-it-er, Cha-ir…) → nothing may match
  for (const term of ["IT", "HR", "CA"]) {
    const r = await get(`?f_job_title=${term}&limit=10`);
    assert.equal(r.status, 200, `${term} alone is allowed`);
    assert.equal(r.json.records.length, 0, `${term} must not match substrings (Recruiter, Director …)`);
  }
  assert.deepEqual(await titles("?f_job_title=CEO"), []); // no CEO in the fixture → none (and no "Dire-ceo" style hits)
  assert.deepEqual(await titles("?f_job_title=CTO"), ["CTO"]);
  assert.equal((await stack.http("GET", "/api/final-people-email?f_job_title=HR", { token: user.token })).status, 200);
});

test("job-title: user text cannot inject full-text operators", { skip }, async () => {
  for (const evil of ["CTO | Doctor", "CTO & !x", "cto:*", "'; DROP TABLE final.people; --", "a b c ((("]) {
    const r = await get(`?f_job_title=${encodeURIComponent(evil)}&limit=10`);
    assert.ok([200, 400].includes(r.status), `${evil} → ${r.status}`);
  }
  assert.equal((await get("?f_job_title=CTO%20%7C%20Doctor&limit=100")).json.records.every((x) => x.job_title === "CTO" || /cto/i.test(x.job_title)), true);
});

test("job-title: 'equals' filter is exact", { skip }, async () => {
  const exact = await all("?f_job_title_eq=CTO");
  assert.equal(exact.length, stack.pg.rows.filter((r) => r.job_title === "CTO").length);
  assert.ok(exact.every((r) => r.job_title === "CTO"));
});

test("wildcards: % and _ typed by the user are matched literally", { skip }, async () => {
  assert.equal((await all("?f_city=%25")).length, 0);
  assert.equal((await all("?f_city=_")).length, 0);
  assert.equal((await all("?f_job_title=%25&f_city=Mumbai")).length, 0);
  assert.equal((await all("?f_state_sw=%25")).length, 0);
  assert.equal((await all("?f_city=Mum%25")).length, 0);
  assert.equal((await all("?f_city=Mum")).length, 50, "plain prefix search still works");
});

test("country filter: India includes every Indian state (Tamil Nadu was missing), USA unchanged", { skip }, async () => {
  const rows = stack.pg.rows;
  const india = await all("?country=india");
  assert.equal(india.length, rows.filter((r) => r.state !== "TX").length);
  assert.ok(india.some((r) => r.state === "Tamil Nadu"), "Chennai / Tamil Nadu must be included");
  assert.equal((await all("?country=usa")).length, rows.filter((r) => r.state === "TX").length);
});

test("email and number routes: wildcard-safe, exact totals, correct rows", { skip }, async () => {
  const rows = stack.pg.rows;
  const hasEmail = (r) => r.emails && r.emails !== "{}";
  const hasPhone = (r) => r.phones && r.phones !== "{}";
  const e = await stack.http("GET", "/api/final-people-email?f_city=Mumbai&limit=10", { token: user.token });
  assert.equal(e.status, 200);
  assert.equal(e.json.total, rows.filter((r) => r.city === "Mumbai" && hasEmail(r)).length);
  assert.equal(e.json.total_exact, true);
  assert.ok(e.json.records.every((r) => r.city === "Mumbai"));
  const n = await stack.http("GET", "/api/final-people-number?f_city=Mumbai&limit=10", { token: user.token });
  assert.equal(n.status, 200);
  assert.equal(n.json.total, rows.filter((r) => r.city === "Mumbai" && hasPhone(r)).length);
  const w = await stack.http("GET", "/api/final-people-email?f_city=%25", { token: user.token });
  assert.equal(w.json.records.length, 0, "'%' must not match every city");
});

test("two-attempt runner: sequential scan first, index plan only after a timeout", { skip: false }, async () => {
  const { runFilteredSearch, INDEX_PLAN } = require("../src/utils/searchFilters");
  const calls = [];
  const timeout = () => Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });

  // common value: first attempt (indexes disabled) answers → no second call
  let q = async (sql, params, session, ms) => { calls.push({ session, ms }); return { rows: [1] }; };
  const r1 = await runFilteredSearch(q, "SELECT 1", [], 15000);
  assert.deepEqual(r1.rows, [1]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].session.some((c) => /enable_indexscan = off/.test(c)) && calls[0].session.some((c) => /enable_bitmapscan = off/.test(c)));
  assert.equal(calls[0].ms, 1500);

  // rare value: first attempt times out → index plan with the remaining budget
  calls.length = 0;
  q = async (sql, params, session, ms) => { calls.push({ session, ms }); if (calls.length === 1) throw timeout(); return { rows: [2] }; };
  const r2 = await runFilteredSearch(q, "SELECT 1", [], 15000);
  assert.deepEqual(r2.rows, [2]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].session, INDEX_PLAN);
  assert.equal(calls[1].ms, 13500);

  // both attempts time out → the timeout reaches the caller (becomes a clear 503)
  q = async () => { throw timeout(); };
  await assert.rejects(() => runFilteredSearch(q, "SELECT 1", [], 15000), (e) => e.code === "57014");

  // other errors are not retried
  calls.length = 0;
  q = async () => { calls.push(1); throw new Error("syntax error"); };
  await assert.rejects(() => runFilteredSearch(q, "SELECT 1", [], 15000), /syntax error/);
  assert.equal(calls.length, 1);

  // vector queries keep the index-only plan
  calls.length = 0;
  q = async (sql, params, session) => { calls.push(session); return { rows: [] }; };
  await runFilteredSearch(q, "SELECT 1", [], 15000, { vector: true });
  assert.deepEqual(calls, [INDEX_PLAN]);

  // tiny budgets are split in half
  const seen = [];
  q = async (sql, params, session, ms) => { seen.push(ms); if (seen.length === 1) throw timeout(); return { rows: [] }; };
  await runFilteredSearch(q, "SELECT 1", [], 600);
  assert.deepEqual(seen, [300, 300]);
});

test("exact count: skipped (free planner estimate) when the filter is clearly dense", { skip: false }, async () => {
  const { exactCappedTotal } = require("../src/utils/searchFilters");
  const seen = [];
  // dense: EXPLAIN says 3,000,000 rows → no count query is run at all
  const dense = async (sql) => { seen.push(sql.split(" ")[0]); return { rows: [{ "QUERY PLAN": "Seq Scan on people (cost=0.00..1.00 rows=3000000 width=8)" }] }; };
  assert.equal(await exactCappedTotal(dense, "t", "WHERE x", []), null);
  assert.deepEqual(seen, ["EXPLAIN"]);
  // small: EXPLAIN says 120 rows → exact capped count runs and is returned
  const calls = [];
  const small = async (sql) => {
    calls.push(sql.split(" ")[0]);
    return sql.startsWith("EXPLAIN") ? { rows: [{ "QUERY PLAN": "Bitmap Heap Scan (cost=1..2 rows=120 width=8)" }] } : { rows: [{ cnt: "97" }] };
  };
  assert.deepEqual(await exactCappedTotal(small, "t", "WHERE x", []), { total: 97, exact: true });
  assert.deepEqual(calls, ["EXPLAIN", "SELECT"]);
  // estimate says small but the real count exceeds the cap → null (caller uses the estimate)
  const liar = async (sql) => sql.startsWith("EXPLAIN") ? { rows: [{ "QUERY PLAN": "rows=50" }] } : { rows: [{ cnt: "10001" }] };
  assert.equal(await exactCappedTotal(liar, "t", "WHERE x", []), null);
  // EXPLAIN failing must not break counting
  const noExplain = async (sql) => { if (sql.startsWith("EXPLAIN")) throw new Error("nope"); return { rows: [{ cnt: "5" }] }; };
  assert.deepEqual(await exactCappedTotal(noExplain, "t", "WHERE x", []), { total: 5, exact: true });
});
