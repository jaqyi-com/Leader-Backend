"use strict";
// Abuse resistance and access policy, proven against the real backend + synthetic Postgres:
// rate limits, signup mode, paid-access policy, deep-page cap, sort guard, search timeout handling.

const test = require("node:test");
const assert = require("node:assert/strict");
const { startStack, available } = require("./helpers/stack");

const skip = (!available.mongod && "mongod not installed") || (!available.postgres && "PostgreSQL not installed");
const P = "/api/final-people";
// Each test gets its own short-lived stack and releases it immediately (a few Postgres/Mongo
// servers at once is fine; nine at once exhausts macOS shared-memory limits).
const live = new Set();
const bootBase = async (opts) => { const s = await startStack({ postgres: true, ...opts }); live.add(s); return s; };
const release = async (...ss) => { for (const s of ss) { if (s) { live.delete(s); await s.stop(); } } };
test.after(async () => { await release(...live); });

test("rate limit: repeated wrong-password logins are throttled per account and per IP", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const s = await boot({ env: { RATE_LIMIT_AUTH_MAX: "12", RATE_LIMIT_LOGIN_ACCOUNT_MAX: "5" } });
    const u = await s.newUser("victim"); // register + login = 2 auth calls
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await s.http("POST", "/api/auth/login", { body: { email: u.email, password: "wrong-" + i } })).status);
    assert.ok(codes.includes(429), `account limiter should kick in, got ${codes}`);
    // another account from the same IP is still served until the per-IP limit
    assert.equal(codes[0], 401, "first wrong attempts are normal 401s");
    // per-IP limit: eventually everything from this IP is throttled, even for unknown accounts
    let ipLimited = false;
    for (let i = 0; i < 20 && !ipLimited; i++) ipLimited = (await s.http("POST", "/api/auth/login", { body: { email: `x${i}@example.test`, password: "p" } })).status === 429;
    assert.ok(ipLimited, "per-IP auth limit must apply");
  } finally {
    await release(...mine);
  }
});

test("rate limit: the people search is throttled per user", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const s = await boot({ env: { RATE_LIMIT_DATA_MAX: "40" } });
    const u = await s.newUser("hammer");
    const other = await s.newUser("bystander");
    let limited = 0;
    for (let i = 0; i < 60; i++) if ((await s.http("GET", `${P}?limit=1`, { token: u.token })).status === 429) limited++;
    assert.ok(limited >= 15, `expected ~20 throttled requests, got ${limited}`);
    assert.equal((await s.http("GET", `${P}?limit=1`, { token: other.token })).status, 200, "another user is not affected");
  } finally {
    await release(...mine);
  }
});

test("signup: REGISTRATION_MODE=open (default) keeps current behaviour", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const s = await boot();
    assert.equal((await s.http("GET", "/api/auth/registration")).json.mode, "open");
    assert.ok(await s.newUser("walkin"));
  } finally {
    await release(...mine);
  }
});

test("signup: invite mode requires the server-side code; closed mode refuses everyone", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const inv = await boot({ env: { REGISTRATION_MODE: "invite", REGISTRATION_INVITE_CODE: "let-me-in-2026" } });
    const body = (extra = {}) => ({ name: "n", email: `i${Math.random().toString(36).slice(2)}@example.test`, password: "Passw0rd!invite", ...extra });
    assert.equal((await inv.http("GET", "/api/auth/registration")).json.mode, "invite");
    assert.equal((await inv.http("POST", "/api/auth/register", { body: body() })).status, 403);
    const bad = await inv.http("POST", "/api/auth/register", { body: body({ inviteCode: "nope" }) });
    assert.equal(bad.status, 403);
    assert.equal(bad.json.code, "INVALID_INVITE_CODE");
    assert.equal((await inv.http("POST", "/api/auth/register", { body: body({ inviteCode: "let-me-in-2026" }) })).status, 201);

    const closed = await boot({ env: { REGISTRATION_MODE: "closed" } });
    assert.equal((await closed.http("POST", "/api/auth/register", { body: body({ inviteCode: "anything" }) })).status, 403);

    const misconfigured = await boot({ env: { REGISTRATION_MODE: "invite" } }); // no code configured → safe default: closed
    assert.equal((await misconfigured.http("POST", "/api/auth/register", { body: body({ inviteCode: "x" }) })).status, 403);
  } finally {
    await release(...mine);
  }
});

test("access policy: DATA_ACCESS_POLICY=paid blocks free accounts, allows paid users and admins", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const s = await boot({ env: { DATA_ACCESS_POLICY: "paid", ADMIN_EMAIL: "boss@example.test" } });
    const free = await s.newUser("freebie");
    const paid = await s.newUser("payer");
    await s.setPlan(paid.email, "lifetime");
    const r = await s.http("GET", `${P}?limit=5`, { token: free.token });
    assert.equal(r.status, 402);
    assert.equal(r.json.code, "UPGRADE_REQUIRED");
    for (const route of ["/api/final-people-email", "/api/final-people-number", "/api/final-companies", "/api/search/hybrid"]) {
      assert.equal((await s.http("GET", route, { token: free.token })).status, 402, route);
    }
    assert.equal((await s.http("GET", `${P}?limit=5`, { token: paid.token })).status, 200);
    // admin e-mail is exempt
    const adminEmail = "boss@example.test";
    await s.http("POST", "/api/auth/register", { body: { name: "boss", email: adminEmail, password: "Passw0rd!admin1" } });
    const adminLogin = await s.http("POST", "/api/auth/login", { body: { email: adminEmail, password: "Passw0rd!admin1" } });
    assert.equal((await s.http("GET", `${P}?limit=5`, { token: adminLogin.json.token })).status, 200);
  } finally {
    await release(...mine);
  }
});

test("access policy: default (open) is unchanged for free accounts", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const s = await boot();
    const free = await s.newUser("openuser");
    assert.equal((await s.http("GET", `${P}?limit=5`, { token: free.token })).status, 200);
  } finally {
    await release(...mine);
  }
});

test("deep paging: requests beyond the result window are refused instantly", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const s = await boot();
    const u = await s.newUser("deep");
    const at = (page, limit) => s.http("GET", `${P}?page=${page}&limit=${limit}`, { token: u.token });
    const ok = await at(1000, 100); // offset 99,900 + 100 = 100,000 → allowed
    assert.equal(ok.status, 200);
    const far = await at(99999, 25);
    assert.equal(far.status, 400);
    assert.equal(far.json.code, "RESULT_WINDOW_EXCEEDED");
    assert.equal((await at(1001, 100)).status, 400);
    for (const route of ["/api/final-people-email", "/api/final-people-number", "/api/final-companies"]) {
      const r = await s.http("GET", `${route}?page=99999&limit=25`, { token: u.token });
      assert.equal(r.status, 400, route);
    }
  } finally {
    await release(...mine);
  }
});

test("sorting: allowed on narrow result sets, refused with a clear message on broad ones", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const s = await boot({ env: { SORT_MAX_ROWS: "60" } });
    const u = await s.newUser("sorter");
    const get = (qs) => s.http("GET", `${P}?${qs}`, { token: u.token });
    const narrow = await get("f_city=Mumbai&sort_by=full_name&sort_dir=desc&limit=100"); // 50 rows ≤ 60
    assert.equal(narrow.status, 200);
    const names = narrow.json.records.map((r) => r.full_name);
    assert.deepEqual(names, [...names].sort().reverse(), "descending order");
    const broad = await get("f_state=Maharashtra&sort_by=full_name&limit=25"); // 100 rows > 60
    assert.equal(broad.status, 400);
    assert.equal(broad.json.code, "SORT_NEEDS_NARROWER_FILTERS");
    const none = await get("sort_by=full_name&limit=25");
    assert.equal(none.status, 400);
    assert.equal(none.json.code, "SORT_NEEDS_FILTER");
    assert.equal((await get("f_state=Maharashtra&limit=25")).status, 200, "unsorted broad search still works");
  } finally {
    await release(...mine);
  }
});

test("slow searches fail fast with a clear 503 instead of a raw 500", { skip }, async () => {
  const mine = [];
  const boot = async (o) => { const x = await bootBase(o); mine.push(x); return x; };
  try {
    const s = await boot({ env: { SEARCH_TIMEOUT_MS: "600" } });
    const u = await s.newUser("slowpoke");
    // Lock the table so the search has to wait → the statement timeout cancels it (deterministic "slow query").
    const locker = await s.pg.pool.connect();
    try {
      await locker.query("BEGIN");
      await locker.query("LOCK TABLE final.people IN ACCESS EXCLUSIVE MODE");
      const t0 = Date.now();
      const r = await s.http("GET", `${P}?f_city=Mumbai&limit=25`, { token: u.token });
      const took = Date.now() - t0;
      assert.equal(r.status, 503);
      assert.equal(r.json.code, "SEARCH_TOO_SLOW");
      assert.match(r.json.error, /too broad/i);
      assert.ok(!/statement timeout|pg_|canceling/i.test(JSON.stringify(r.json)), "no database internals in the message");
      assert.ok(took < 5000, `should fail fast, took ${took}ms`);
    } finally {
      await locker.query("ROLLBACK");
      locker.release();
    }
    // the service recovers once the lock is gone
    assert.equal((await s.http("GET", `${P}?f_city=Mumbai&limit=5`, { token: u.token })).status, 200);
  } finally {
    await release(...mine);
  }
});
