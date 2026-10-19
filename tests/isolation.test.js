"use strict";
// Multi-tenant isolation tests against a REAL MongoDB (throwaway local mongod, temp data dir).
// Two organisations are created through the real register endpoint; every cross-tenant
// read / update / delete must fail and mass-assignment of orgId must be ignored.
// Skipped automatically when `mongod` is not installed.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const mongoose = require("mongoose");

const ROOT = path.join(__dirname, "..");
const hasMongod = spawnSync("mongod", ["--version"]).status === 0;
const opts = { skip: !hasMongod && "mongod not installed" };

const MONGO_PORT = 27100 + Math.floor(Math.random() * 400);
const API_PORT = 4800 + Math.floor(Math.random() * 400);
const MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}/isolation_test`;
const BASE = `http://127.0.0.1:${API_PORT}`;
const SECRET = "isolation-secret-" + "y".repeat(40);

let mongod, server, dbDir;
const A = { email: "alice@org-a.example.test", password: "Passw0rd!aaa" };
const B = { email: "bob@org-b.example.test", password: "Passw0rd!bbb" };

async function http(method, url, { token, body } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let json = null; try { json = await res.json(); } catch { /* html or empty */ }
  return { status: res.status, json };
}

async function register(u, name) {
  const r = await http("POST", "/api/auth/register", { body: { name, email: u.email, password: u.password, orgName: name + " Org" } });
  assert.equal(r.status, 201, "register " + name);
  const l = await http("POST", "/api/auth/login", { body: { email: u.email, password: u.password } });
  assert.equal(l.status, 200, "login " + name);
  u.token = l.json.token;
  u.orgId = String(l.json.org?._id || l.json.org?.id);
  assert.match(u.orgId, /^[0-9a-f]{24}$/);
}

test.before(async () => {
  if (!hasMongod) return;
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "doott-mongo-"));
  mongod = spawn("mongod", ["--dbpath", dbDir, "--port", String(MONGO_PORT), "--bind_ip", "127.0.0.1", "--nounixsocket", "--quiet"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 500 }); break; }
    catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.equal(mongoose.connection.readyState, 1, "mongod did not start");

  server = spawn(process.execPath, [path.join(ROOT, "src/server.js")], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH, NODE_ENV: "production", PORT: String(API_PORT), JWT_SECRET: SECRET,
      MONGO_URI, NEON_DATABASE_URL: "postgresql://u:p@127.0.0.1:1/x",
      OPENAI_API_KEY: "fake", APOLLO_API_KEY: "fake", SMTP_USER: "fake", SMTP_PASS: "fake",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(BASE + "/", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  await register(A, "Alice");
  await register(B, "Bob");
});

function cleanup() {
  try { server && server.kill("SIGKILL"); } catch { /* ignore */ }
  try { mongod && mongod.kill("SIGKILL"); } catch { /* ignore */ }
  try { dbDir && fs.rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
process.on("exit", cleanup);

test.after(async () => {
  cleanup();
  try { await mongoose.disconnect(); } catch { /* ignore */ }
});

// ── Lead database ────────────────────────────────────────────────────────────
test("leads: org B cannot read, edit or delete org A's lead; orgId cannot be forged", { ...opts }, async () => {
  const created = await http("POST", "/api/lead-generator/database", {
    token: A.token, body: [{ fullName: "Lead Of A", email: "lead@a.example.test", orgId: B.orgId, status: "new", evil: 1 }],
  });
  assert.equal(created.json.saved, 1);

  const listA = await http("GET", "/api/lead-generator/database", { token: A.token });
  assert.equal(listA.json.total, 1);
  const lead = listA.json.leads[0];
  assert.equal(String(lead.orgId), A.orgId, "client-supplied orgId must be ignored");
  assert.equal(lead.evil, undefined);

  const listB = await http("GET", "/api/lead-generator/database", { token: B.token });
  assert.equal(listB.json.total, 0, "B must not see A's leads");

  assert.equal((await http("PATCH", `/api/lead-generator/database/${lead._id}`, { token: B.token, body: { status: "rejected" } })).status, 404);
  assert.equal((await http("DELETE", `/api/lead-generator/database/${lead._id}`, { token: B.token })).status, 404);

  const patched = await http("PATCH", `/api/lead-generator/database/${lead._id}`, { token: A.token, body: { status: "contacted", orgId: B.orgId } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.status, "contacted");
  assert.equal(String(patched.json.orgId), A.orgId, "PATCH must not move a lead to another org");

  // regex-special search must not hang or error
  const re = await http("GET", "/api/lead-generator/database?search=" + encodeURIComponent("(a+)+$"), { token: A.token });
  assert.equal(re.status, 200);
  // operator injection through query objects is ignored
  const inj = await http("GET", "/api/lead-generator/database?status[$ne]=zzz", { token: B.token });
  assert.equal(inj.json.total, 0);

  assert.equal((await http("DELETE", `/api/lead-generator/database/${lead._id}`, { token: A.token })).status, 200);
});

// ── Social posts ─────────────────────────────────────────────────────────────
test("social: posts are listed/published/deleted per org; approval link needs the exact token", { ...opts }, async () => {
  const { SocialPost } = require("../src/db/mongoose");
  const post = await SocialPost.create({
    generatedContent: "hello", status: "pending_approval", approvalToken: "tok-abcdef-123456", orgId: A.orgId,
  });
  const other = await SocialPost.create({ generatedContent: "b-post", status: "draft", orgId: B.orgId });

  const listB = await http("GET", "/api/social/posts", { token: B.token });
  assert.deepEqual(listB.json.posts.map((p) => p.generatedContent), ["b-post"]);
  assert.equal((await http("POST", `/api/social/posts/${post._id}/publish`, { token: B.token })).status, 404);
  assert.equal((await http("DELETE", `/api/social/posts/${post._id}`, { token: B.token })).status, 404);
  assert.ok(await SocialPost.findById(post._id), "A's post must survive B's delete attempt");

  const bad = await fetch(`${BASE}/api/social/posts/approve/${post._id}?token=wrong-token-1234567`);
  assert.equal(bad.status, 403);
  const none = await fetch(`${BASE}/api/social/posts/approve/${post._id}`);
  assert.equal(none.status, 403);
  const ok = await fetch(`${BASE}/api/social/posts/approve/${post._id}?token=tok-abcdef-123456`);
  assert.equal(ok.status, 200);
  assert.equal((await SocialPost.findById(post._id)).status, "approved");

  assert.equal((await http("DELETE", `/api/social/posts/${post._id}`, { token: A.token })).status, 200);
  await SocialPost.deleteOne({ _id: other._id });
});

// ── Autonomous leads ─────────────────────────────────────────────────────────
test("autonomous: server controls org/status/dossier; other orgs cannot see or run research", { ...opts }, async () => {
  const c = await http("POST", "/api/autonomous", {
    token: A.token, body: { company: "Acme", website: "https://acme.example.test", orgId: B.orgId, status: "sent", dossier: { summary: "forged" } },
  });
  assert.equal(c.status, 200);
  assert.equal(c.json.lead.status, "new");
  assert.equal(String(c.json.lead.orgId), A.orgId);
  assert.equal(c.json.lead.dossier?.summary, undefined);
  const id = c.json.lead._id;

  assert.equal((await http("GET", "/api/autonomous", { token: B.token })).json.length, 0);
  assert.equal((await http("GET", `/api/autonomous/${id}`, { token: B.token })).status, 404);
  assert.equal((await http("POST", `/api/autonomous/${id}/research`, { token: B.token })).status, 404);
  assert.equal((await http("POST", `/api/autonomous/${id}/outreach`, { token: B.token })).status, 404);
  assert.equal((await http("GET", `/api/autonomous/${id}`, { token: A.token })).status, 200);
});

// ── CRM ──────────────────────────────────────────────────────────────────────
test("crm: deals are isolated, and a deal cannot be moved to another org by sending orgId", { ...opts }, async () => {
  const d = await http("POST", "/api/crm/deals", { token: A.token, body: { title: "Big deal", companyName: "Acme", value: 1000 } });
  assert.equal(d.status, 200);
  const id = d.json.deal._id;

  assert.equal((await http("GET", `/api/crm/deals/${id}`, { token: B.token })).status, 404);
  assert.equal((await http("PUT", `/api/crm/deals/${id}`, { token: B.token, body: { title: "hijacked" } })).status, 404);
  await http("DELETE", `/api/crm/deals/${id}`, { token: B.token }); // route answers 200 but is scoped → no-op
  assert.equal((await http("GET", `/api/crm/deals/${id}`, { token: A.token })).status, 200, "B's delete must not remove A's deal");
  assert.equal((await http("GET", "/api/crm/deals", { token: B.token })).json.deals?.length ?? 0, 0);

  // Mass assignment: A tries to push its deal into B's tenant.
  const moved = await http("PUT", `/api/crm/deals/${id}`, { token: A.token, body: { title: "still mine", orgId: B.orgId } });
  const stillA = await http("GET", `/api/crm/deals/${id}`, { token: A.token });
  assert.equal(stillA.status, 200, `deal must stay in org A (PUT returned ${moved.status})`);
  assert.equal((await http("GET", `/api/crm/deals/${id}`, { token: B.token })).status, 404, "deal must not appear in org B");
});

test("crm: pipelines cannot be reassigned to another org", { ...opts }, async () => {
  const p = await http("POST", "/api/crm/pipelines", { token: A.token, body: { name: "A pipe", stages: [] } });
  const id = p.json.pipeline._id;
  await http("PUT", `/api/crm/pipelines/${id}`, { token: A.token, body: { name: "renamed", orgId: B.orgId } });
  const listB = await http("GET", "/api/crm/pipelines", { token: B.token });
  assert.ok(!listB.json.pipelines.some((x) => String(x._id) === id), "pipeline must not appear in org B");
});

// ── Inventory ────────────────────────────────────────────────────────────────
test("inventory: items are isolated and cannot be reassigned to another org", { ...opts }, async () => {
  const g = await http("POST", "/api/inventory/groups", { token: A.token, body: { name: "Widgets" } });
  assert.equal(g.status, 200);
  assert.equal((await http("GET", "/api/inventory/groups", { token: B.token })).json.groups.length, 0);

  const it = await http("POST", "/api/inventory/items", { token: A.token, body: { name: "Bolt", openingQty: 5, groupId: g.json.group._id } });
  assert.equal(it.status, 200, JSON.stringify(it.json));
  const id = it.json.item._id;
  assert.equal((await http("GET", `/api/inventory/items/${id}`, { token: B.token })).status, 404);
  assert.equal((await http("PUT", `/api/inventory/items/${id}`, { token: B.token, body: { name: "x" } })).status, 404);

  await http("PUT", `/api/inventory/items/${id}`, { token: A.token, body: { name: "Bolt2", orgId: B.orgId } });
  assert.equal((await http("GET", `/api/inventory/items/${id}`, { token: B.token })).status, 404, "item must not appear in org B");
  assert.equal((await http("GET", `/api/inventory/items/${id}`, { token: A.token })).status, 200);
});
