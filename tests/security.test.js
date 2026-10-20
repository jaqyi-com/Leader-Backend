"use strict";
// Security regression tests — run with `npm test` (Node built-in test runner, no extra deps).
// Nothing here touches real data: the server runs with fake credentials and unreachable DB URLs.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const jwt = require("jsonwebtoken");

const ROOT = path.join(__dirname, "..");
const TEST_SECRET = "test-secret-" + "x".repeat(40);

// ── jwtSecret ────────────────────────────────────────────────────────────────
test("JWT secret module refuses missing / default / placeholder secrets", () => {
  const load = (value) => {
    const saved = process.env.JWT_SECRET;
    if (value === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = value;
    delete require.cache[require.resolve("../src/config/jwtSecret")];
    try { return require("../src/config/jwtSecret"); }
    finally { saved === undefined ? delete process.env.JWT_SECRET : (process.env.JWT_SECRET = saved); }
  };
  assert.throws(() => load(undefined), /JWT_SECRET/);
  assert.throws(() => load(""), /JWT_SECRET/);
  assert.throws(() => load("changeme-secret"), /JWT_SECRET/);
  assert.throws(() => load("change-this-to-a-long-random-secret-in-production"), /JWT_SECRET/);
  assert.equal(load(TEST_SECRET).JWT_SECRET, TEST_SECRET);
});

// ── SSRF guard ───────────────────────────────────────────────────────────────
test("URL guard blocks internal destinations and unsafe URLs", async () => {
  const { assertPublicHttpUrl, isBlockedIp, publicGet } = require("../src/utils/urlGuard");
  for (const u of [
    "http://127.0.0.1/", "http://localhost/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.0.1/", "http://100.64.0.1/",
    "http://[::ffff:127.0.0.1]/", "http://metadata.internal/", "file:///etc/passwd", "ftp://example.com/",
    "http://user:pass@example.com/", "http://example.com:22/", "not a url",
  ]) {
    assert.throws(() => assertPublicHttpUrl(u), `should block ${u}`);
  }
  assert.doesNotThrow(() => assertPublicHttpUrl("https://example.com/path?q=1"));
  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("::ffff:10.1.2.3"), true);
  // Connection-time guard: a literal private IP must be refused before any request is made.
  await assert.rejects(() => publicGet("http://127.0.0.1:8080/"), /Blocked destination/);
});

// ── CSV formula injection / filenames ────────────────────────────────────────
test("CSV helpers neutralise formulas and sanitise filenames", () => {
  const { neutralizeCell, neutralizeRow, safeFilename } = require("../src/utils/csvSafe");
  assert.equal(neutralizeCell("=HYPERLINK(\"http://evil\")"), "'=HYPERLINK(\"http://evil\")");
  assert.equal(neutralizeCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(neutralizeCell("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
  assert.equal(neutralizeCell("-2+3"), "'-2+3");
  assert.equal(neutralizeCell("-42"), "-42");
  assert.equal(neutralizeCell("+919876543210"), "+919876543210");
  assert.equal(neutralizeCell("plain@example.com"), "plain@example.com");
  assert.deepEqual(neutralizeRow({ a: "=1+1", b: 5, c: null }), { a: "'=1+1", b: 5, c: null });
  assert.equal(safeFilename('x";\r\nSet-Cookie: a=b.csv'), "x_Set-Cookie_a_b.csv");
  assert.ok(!safeFilename("../../etc/passwd").startsWith("."));
  assert.ok(!safeFilename("../../etc/passwd").includes("/"));
});

// ── Mass assignment ──────────────────────────────────────────────────────────
test("pickModelFields strips tenant/identity fields and operators", () => {
  const { Organization } = require("../src/db/mongoose");
  const { pickModelFields, escapeRegex } = require("../src/utils/tenant");
  const out = pickModelFields({
    name: "Acme", orgId: "attacker-org", _id: "x", createdAt: "2000-01-01",
    "$set": { orgId: "y" }, "a.b": 1, notAField: 1, industry: "Retail",
  }, Organization);
  assert.deepEqual(out, { name: "Acme", industry: "Retail" });
  assert.deepEqual(pickModelFields("str", Organization), {});
  assert.deepEqual(pickModelFields([1], Organization), {});
  assert.equal(new RegExp(escapeRegex("(a+)+$")).test("(a+)+$"), true);
});

// ── HTTP-level tests against a real server process ───────────────────────────
const PORT = 4300 + Math.floor(Math.random() * 500); // 4300-4799: no fetch-blocked ports
const BASE = `http://127.0.0.1:${PORT}`;
let server;

const sign = (claims, secret = TEST_SECRET) => jwt.sign(claims, secret, { expiresIn: "5m" });
const call = async (method, url, { token, body, query = "" } = {}) => {
  const res = await fetch(BASE + url + query, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  let json = null; try { json = await res.clone().json(); } catch { /* not json */ }
  return { status: res.status, json, headers: res.headers };
};

test.before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, "src/server.js")], {
    cwd: os.tmpdir(), // keeps dotenv from loading a real .env
    env: {
      PATH: process.env.PATH, NODE_ENV: "production", PORT: String(PORT), JWT_SECRET: TEST_SECRET,
      ADMIN_EMAIL: "owner@example.test",
      MONGO_URI: "mongodb://127.0.0.1:1/test?serverSelectionTimeoutMS=500",
      NEON_DATABASE_URL: "postgresql://u:p@127.0.0.1:1/x",
      OPENAI_API_KEY: "fake", APOLLO_API_KEY: "fake", SMTP_USER: "fake", SMTP_PASS: "fake",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + "/", { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("test server did not start");
});
test.after(() => server && server.kill());

test("server: security headers present, X-Powered-By removed", async () => {
  const r = await call("GET", "/");
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
});

test("auth: no token / forged tokens / wrong algorithm are rejected", async () => {
  assert.equal((await call("GET", "/api/final-people")).status, 401);
  const forged = sign({ userId: "u1", orgId: "o1", role: "owner" }, "changeme-secret");
  assert.equal((await call("GET", "/api/final-people", { token: forged })).status, 401);
  const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." +
    Buffer.from(JSON.stringify({ userId: "u1", orgId: "o1", role: "owner" })).toString("base64url") + ".";
  assert.equal((await call("GET", "/api/final-people", { token: none })).status, 401);
});

test("auth: token in the URL is no longer accepted", async () => {
  const good = sign({ userId: "u1", orgId: "507f1f77bcf86cd799439011", role: "admin", email: "a@example.test" });
  const r = await call("GET", "/api/final-people", { query: `?token=${good}` });
  assert.equal(r.status, 401);
});

test("removed features: their endpoints no longer exist", async () => {
  const user = sign({ userId: "u1", orgId: "507f1f77bcf86cd799439011", role: "admin", email: "a@example.test" });
  for (const [m, u] of [
    ["POST", "/api/reset"], ["POST", "/api/pipeline/all"], ["GET", "/api/schedule"], ["POST", "/api/icp"],
    ["GET", "/api/logs"], ["GET", "/api/sheets/data"], ["DELETE", "/api/sheets/clear"],
    ["GET", "/api/autonomous"], ["GET", "/api/lead-generator/database"], ["GET", "/api/social/posts"],
    ["GET", "/api/crm/deals"], ["GET", "/api/accounting/ledgers"], ["GET", "/api/inventory/items"],
    ["GET", "/api/payroll/employees"], ["GET", "/api/chatbot/conversations"], ["GET", "/api/outreach/campaigns"],
    ["GET", "/api/crawler/websites"], ["GET", "/api/inbuild-database"], ["GET", "/api/india-data"],
    ["GET", "/api/public-contacts"], ["GET", "/api/niches75m"], ["GET", "/api/search/hybrid"], ["GET", "/api/gmail/status"],
  ]) {
    const r = await call(m, u, { token: user, body: m === "GET" || m === "DELETE" ? undefined : {} });
    assert.equal(r.status, 404, `${m} ${u} should be gone, got ${r.status}`);
  }
});

test("admin guard: ordinary users cannot modify the shared disposable-domain list", async () => {
  const user = sign({ userId: "u1", orgId: "507f1f77bcf86cd799439011", role: "admin", email: "member@example.test" });
  assert.equal((await call("POST", "/api/verify-email/sync-disposable", { token: user })).status, 403);
  assert.equal((await call("POST", "/api/verify-email/disposable-domains", { token: user, body: { domain: "gmail.com" } })).status, 403);
  assert.equal((await call("GET", "/api/verify-email/stats", { token: user })).status, 403);
});

test("verify-email batch jobs are not readable by other users", async () => {
  const other = sign({ userId: "u2", orgId: "507f1f77bcf86cd799439012", role: "member", email: "b@example.test" });
  assert.equal((await call("GET", "/api/verify-email/batch/00000000-0000-4000-8000-000000000000", { token: other })).status, 404);
  assert.equal((await call("GET", "/api/verify-email/batch/00000000-0000-4000-8000-000000000000/download", { token: other })).status, 404);
});

test("errors: malformed JSON returns a JSON 400 with no stack trace", async () => {
  const res = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.ok(!/at .*\.js|node_modules/.test(text), "no stack trace in response");
  assert.match(res.headers.get("content-type") || "", /json/);
});

test("health endpoint is public and reveals only up/down states", async () => {
  const r = await call("GET", "/api/health");
  assert.ok([200, 503].includes(r.status));
  assert.deepEqual(Object.keys(r.json.checks).sort(), ["mongo", "postgres"]);
  assert.ok(!JSON.stringify(r.json).includes("127.0.0.1"));
});
