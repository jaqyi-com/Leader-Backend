"use strict";
// The app tables in Neon (schema "app"): feature flags, page tracking and
// analytics, organisations and members, password reset, Google sign-in and the payment webhook.
// Runs against the hermetic local PostgreSQL stack.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { startStack, available } = require("./helpers/stack");

const skip = !available.postgres && "PostgreSQL not installed";
const ADMIN = "owner@example.test";
const WEBHOOK_SECRET = "whsec-test-" + "x".repeat(20);
let stack, admin;

test.before(async () => {
  if (skip) return;
  stack = await startStack({ env: { ADMIN_EMAIL: ADMIN, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET } });
  const r = await stack.http("POST", "/api/auth/register", { body: { name: "Owner", email: ADMIN, password: "Passw0rd!owner" } });
  assert.equal(r.status, 201);
  admin = (await stack.http("POST", "/api/auth/login", { body: { email: ADMIN, password: "Passw0rd!owner" } })).json;
});
test.after(async () => { if (stack) await stack.stop(); });

const q = (text, params) => stack.pg.pool.query(text, params);

test("app schema: tables exist in schema app, lead tables untouched", { skip }, async () => {
  const { rows } = await q("SELECT table_name FROM information_schema.tables WHERE table_schema = 'app' ORDER BY 1");
  assert.deepEqual(rows.map((r) => r.table_name), [
    "api_keys", "feature_flags", "mcp_auth_codes", "mcp_clients", "mcp_grants", "members", "organizations", "page_views", "schema_meta", "users",
  ]);
  assert.equal((await q("SELECT count(*)::int AS n FROM final.people")).rows[0].n, 250);
});

test("register: user, org and admin membership are stored; ids keep the 24-hex format", { skip }, async () => {
  const u = await stack.newUser("shape");
  const me = await stack.http("GET", "/api/auth/me", { token: u.token });
  assert.equal(me.status, 200);
  assert.match(me.json.user._id, /^[0-9a-f]{24}$/);
  assert.equal(me.json.user.passwordHash, undefined, "password hash never returned");
  assert.equal(me.json.user.tokenVersion, undefined);
  assert.equal(me.json.org._id, me.json.user.defaultOrgId);
  const { rows } = await q("SELECT password_hash FROM app.users WHERE id = $1", [me.json.user._id]);
  assert.match(rows[0].password_hash, /^\$2[aby]\$12\$/, "bcrypt hash stored, not the password");
  const m = await q("SELECT role, status FROM app.members WHERE user_id = $1", [me.json.user._id]);
  assert.deepEqual(m.rows[0], { role: "admin", status: "active" });
  assert.equal((await stack.http("POST", "/api/auth/register", { body: { name: "x", email: u.email.toUpperCase(), password: "Passw0rd!x" } })).status, 409, "email is case-insensitive unique");
  assert.equal((await stack.http("POST", "/api/auth/login", { body: { email: u.email.toUpperCase(), password: u.password } })).status, 200);
});

test("feature flags: defaults seeded, admin can toggle, apply a preset and reset; settings stays on", { skip }, async () => {
  const f = await stack.http("GET", "/api/features");
  assert.equal(f.json.features.companies.status, "enabled");
  const user = await stack.newUser("flags");
  assert.equal((await stack.http("PUT", "/api/admin/features/docs", { token: user.token, body: { status: "disabled" } })).status, 403);
  const t = await stack.http("PUT", "/api/admin/features/docs", { token: admin.token, body: { status: "disabled", badge: "SOON" } });
  assert.equal(t.status, 200);
  assert.equal(t.json.flag.status, "disabled");
  assert.equal((await stack.http("GET", "/api/features")).json.features.docs.badge, "SOON");
  assert.equal((await stack.http("PUT", "/api/admin/features/settings", { token: admin.token, body: { status: "disabled" } })).status, 200);
  assert.equal((await stack.http("GET", "/api/features")).json.features.settings.status, "enabled", "settings is always on");
  const p = await stack.http("POST", "/api/admin/features/preset", { token: admin.token, body: { presetKey: "data_only" } });
  assert.equal(p.status, 200);
  assert.equal(p.json.flags.find((x) => x.key === "docs").status, "disabled");
  const list = await stack.http("GET", "/api/admin/features", { token: admin.token });
  assert.equal(list.json.flags.length, list.json.summary.total);
  const r = await stack.http("POST", "/api/admin/features/reset", { token: admin.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.flags.find((x) => x.key === "docs").badge, "");
});

test("tracking and analytics: page views are stored and summarised", { skip }, async () => {
  for (const [path, sessionId, isEntry] of [["/", "s1", true], ["/pricing", "s1", false], ["/", "s2", true]]) {
    const r = await fetch(`${stack.base}/api/track`, {
      method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (iPhone) Mobile Safari" },
      body: JSON.stringify({ path, sessionId, isEntry, duration: 12, utmCampaign: path === "/pricing" ? "launch" : "" }),
    });
    assert.deepEqual(await r.json(), { ok: true });
  }
  const user = await stack.newUser("notadmin");
  assert.equal((await stack.http("GET", "/api/analytics/traffic", { token: user.token })).status, 403);
  const a = await stack.http("GET", "/api/analytics/traffic", { token: admin.token });
  assert.equal(a.status, 200);
  assert.ok(a.json.kpis.totalViews >= 3);
  assert.ok(a.json.kpis.uniqueVisitors >= 2);
  assert.equal(a.json.kpis.bounceRate, 50, "s2 viewed one page, s1 two");
  assert.equal(a.json.hourlyViews.length, 24);
  assert.equal(a.json.daily30.length, 30);
  assert.equal(a.json.heatmap.length, 7);
  assert.equal(a.json.heatmap.flat().reduce((x, y) => x + y, 0), a.json.kpis.totalViews);
  assert.equal(a.json.topPages[0].path, "/");
  assert.equal(a.json.devices[0].device, "Mobile");
  assert.equal(a.json.utmCampaigns[0].campaign, "launch");
  assert.equal(a.json.recentVisits.length, a.json.kpis.totalViews);
  assert.ok((await stack.http("GET", "/api/analytics/live", { token: admin.token })).json.live >= 2);
  const users = await stack.http("GET", "/api/analytics/users", { token: admin.token });
  assert.ok(users.json.stats.total >= 3);
  assert.equal(users.json.users.some((x) => "passwordHash" in x), false);
});

test("organisations: members list, invite, accept, role change, switch and remove", { skip }, async () => {
  const owner = await stack.newUser("orgowner");
  const other = await stack.newUser("orgother");
  const members = await stack.http("GET", "/api/org/members", { token: owner.token });
  assert.equal(members.status, 200);
  assert.equal(members.json.members.length, 1);
  assert.equal(members.json.members[0].user.email, owner.email);

  const inv = await stack.http("POST", "/api/org/members/invite", { token: owner.token, body: { email: other.email, role: "viewer" } });
  // No SMTP server in tests: sending fails after the invite is stored (same behaviour as before the move).
  assert.ok(inv.status === 200 || /ECONNREFUSED/.test(inv.json?.error || ""), JSON.stringify(inv.json));
  const { rows } = await q("SELECT invite_token, user_id FROM app.members WHERE org_id = $1 AND status = 'invited'", [owner.orgId]);
  assert.equal(rows.length, 1);
  // accept the invite directly through the service (there is no public accept route)
  const otherId = (await stack.http("GET", "/api/auth/me", { token: other.token })).json.user._id;
  await q("UPDATE app.members SET user_id = $2, status = 'active', joined_at = now(), invite_token = NULL WHERE invite_token = $1", [rows[0].invite_token, otherId]);

  const after = await stack.http("GET", "/api/org/members", { token: owner.token });
  assert.equal(after.json.members.length, 2);
  const role = await stack.http("PATCH", `/api/org/members/${otherId}/role`, { token: owner.token, body: { role: "member" } });
  assert.equal(role.status, 200, JSON.stringify(role.json));
  assert.equal((await q("SELECT role FROM app.members WHERE org_id = $1 AND user_id = $2", [owner.orgId, otherId])).rows[0].role, "member");

  const mine = await stack.http("GET", "/api/org/mine", { token: other.token });
  assert.equal(mine.json.orgs.length, 2);
  const sw = await stack.http("POST", "/api/org/switch", { token: other.token, body: { orgId: owner.orgId } });
  assert.equal(sw.status, 200);
  assert.equal(String(sw.json.org._id), owner.orgId);
  assert.equal((await stack.http("GET", "/api/org", { token: sw.json.token })).json.org._id, owner.orgId);

  // the owner cannot delete their account while the org has another member
  const del = await stack.http("DELETE", "/api/account", { token: owner.token, body: { confirmEmail: owner.email, password: owner.password } });
  assert.equal(del.status, 409);
  assert.equal((await stack.http("DELETE", `/api/org/members/${otherId}`, { token: owner.token })).status, 200);
  assert.equal((await stack.http("GET", "/api/org/members", { token: owner.token })).json.members.length, 1);
  const upd = await stack.http("PATCH", "/api/org", { token: owner.token, body: { name: "Renamed Co", website: "https://renamed.example" } });
  assert.equal(upd.json.org.name, "Renamed Co");
});

test("password reset: link token works once and signs out existing sessions", { skip }, async () => {
  const u = await stack.newUser("reset");
  assert.equal((await stack.http("POST", "/api/auth/forgot-password", { body: { email: u.email } })).status, 200);
  const { rows } = await q("SELECT password_reset_token FROM app.users WHERE lower(email) = lower($1)", [u.email]);
  assert.ok(rows[0].password_reset_token);
  const r = await stack.http("POST", "/api/auth/reset-password", { body: { token: rows[0].password_reset_token, password: "Brand-new-pass1" } });
  assert.equal(r.status, 200);
  assert.equal((await stack.http("POST", "/api/auth/reset-password", { body: { token: rows[0].password_reset_token, password: "Another-pass-2" } })).status, 400, "single use");
  assert.equal((await stack.http("GET", "/api/auth/me", { token: u.token })).status, 401, "old session signed out");
  assert.equal((await stack.http("POST", "/api/auth/login", { body: { email: u.email, password: "Brand-new-pass1" } })).status, 200);
});

test("payments webhook: a signed payment.captured upgrades the account", { skip }, async () => {
  const u = await stack.newUser("payer");
  await stack.setPlan(u.email, "free");
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_TEST1", order_id: "order_TEST1", notes: { email: u.email.toUpperCase() } } } } });
  const bad = await fetch(`${stack.base}/api/payments/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": "nope" }, body });
  assert.equal(bad.status, 400);
  const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const ok = await fetch(`${stack.base}/api/payments/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": sig }, body });
  assert.equal(ok.status, 200);
  const { rows } = await q("SELECT plan, razorpay_payment_id, paid_at FROM app.users WHERE lower(email) = lower($1)", [u.email]);
  assert.equal(rows[0].plan, "lifetime");
  assert.equal(rows[0].razorpay_payment_id, "pay_TEST1");
  assert.ok(rows[0].paid_at);
});

test("google sign-in: creates a user once, links an existing email account", { skip }, async () => {
  // Run the service in-process against the test database.
  process.env.NEON_DATABASE_URL = stack.pg.url;
  process.env.JWT_SECRET = stack.secret;
  process.env.REGISTRATION_MODE = "open";
  const authService = require("../src/services/authService");
  const a = await authService.handleGoogleOAuth({ googleId: "g-123", email: "Google.User@example.test", name: "G User", avatar: "https://x/a.png" });
  assert.equal(a.user.googleId, "g-123");
  assert.ok(a.org);
  const again = await authService.handleGoogleOAuth({ googleId: "g-123", email: "google.user@example.test", name: "G User" });
  assert.equal(again.user._id, a.user._id, "same user, no duplicate");
  const existing = await stack.newUser("linkme");
  const linked = await authService.handleGoogleOAuth({ googleId: "g-456", email: existing.email, name: "Link Me" });
  const { rows } = await q("SELECT google_id FROM app.users WHERE lower(email) = lower($1)", [existing.email]);
  assert.equal(rows[0].google_id, "g-456");
  assert.equal((await stack.http("GET", "/api/auth/me", { token: linked.token })).status, 200, "token works on the server");
  await require("../src/db/cloudSql").getPool().end();
});
