"use strict";
// Account settings: profile, password change, sign out everywhere, API keys, account deletion.
// Runs against the hermetic local stack (throwaway PostgreSQL). Skipped when it is missing.

const test = require("node:test");
const assert = require("node:assert/strict");
const { startStack, available } = require("./helpers/stack");

const skip = (!available.postgres && "PostgreSQL not installed");
let stack;

test.before(async () => { if (!skip) stack = await startStack({ postgres: true }); });
test.after(async () => { if (stack) await stack.stop(); });

test("account: profile read and rename", { skip }, async () => {
  const u = await stack.newUser("profile");
  const a = await stack.http("GET", "/api/account", { token: u.token });
  assert.equal(a.status, 200);
  assert.equal(a.json.account.email, u.email);
  assert.equal(a.json.account.hasPassword, true);
  assert.equal(a.json.account.passwordHash, undefined);
  assert.equal((await stack.http("PATCH", "/api/account/profile", { token: u.token, body: { name: "" } })).status, 400);
  const r = await stack.http("PATCH", "/api/account/profile", { token: u.token, body: { name: "New Name" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.name, "New Name");
});

test("account: change password signs out other sessions and keeps this one", { skip }, async () => {
  const u = await stack.newUser("pw");
  const other = (await stack.http("POST", "/api/auth/login", { body: { email: u.email, password: u.password } })).json.token;
  const P = "/api/account/password";
  assert.equal((await stack.http("POST", P, { token: u.token, body: { currentPassword: "wrong-password", newPassword: "Another1!pass" } })).json.code, "WRONG_PASSWORD");
  assert.equal((await stack.http("POST", P, { token: u.token, body: { currentPassword: u.password, newPassword: "short" } })).status, 400);
  assert.equal((await stack.http("POST", P, { token: u.token, body: { currentPassword: u.password, newPassword: u.password } })).status, 400);
  const r = await stack.http("POST", P, { token: u.token, body: { currentPassword: u.password, newPassword: "Another1!pass" } });
  assert.equal(r.status, 200);
  assert.ok(r.json.token);
  assert.equal((await stack.http("GET", "/api/auth/me", { token: r.json.token })).status, 200, "new token works");
  const old = await stack.http("GET", "/api/account", { token: other });
  assert.equal(old.status, 401, "other device signed out");
  assert.equal(old.json.code, "SESSION_REVOKED");
  assert.equal((await stack.http("POST", "/api/auth/login", { body: { email: u.email, password: u.password } })).status, 401, "old password no longer works");
  assert.equal((await stack.http("POST", "/api/auth/login", { body: { email: u.email, password: "Another1!pass" } })).status, 200);
});

test("account: sign out everywhere", { skip }, async () => {
  const u = await stack.newUser("signout");
  const r = await stack.http("POST", "/api/account/sessions/revoke-others", { token: u.token });
  assert.equal(r.status, 200);
  assert.equal((await stack.http("GET", "/api/final-people?limit=1", { token: u.token })).status, 401);
  assert.equal((await stack.http("GET", "/api/final-people?limit=1", { token: r.json.token })).status, 200);
});

test("account: API keys work on the data API only, are listed without the secret, and can be revoked", { skip }, async () => {
  const u = await stack.newUser("keys");
  const v = await stack.newUser("keys-other");
  assert.equal((await stack.http("POST", "/api/account/api-keys", { token: u.token, body: { name: "" } })).status, 400);
  const c = await stack.http("POST", "/api/account/api-keys", { token: u.token, body: { name: "CRM sync" } });
  assert.equal(c.status, 201);
  const key = c.json.key;
  assert.match(key, /^doott_/);
  const list = await stack.http("GET", "/api/account/api-keys", { token: u.token });
  assert.equal(list.json.keys.length, 1);
  assert.equal(JSON.stringify(list.json).includes(key), false, "full key is never listed");
  assert.equal(list.json.keys[0].prefix, key.slice(0, 12));

  const data = await stack.http("GET", "/api/final-people?limit=3", { token: key });
  assert.equal(data.status, 200);
  assert.equal(data.json.records.length, 3);
  // X-API-Key header also works
  const viaHeader = await fetch(`${stack.base}/api/final-people?limit=1`, { headers: { "x-api-key": key } });
  assert.equal(viaHeader.status, 200);
  // Not usable for account, org or connector routes
  for (const [m, p] of [["GET", "/api/account"], ["POST", "/api/account/api-keys"], ["GET", "/api/org/members"], ["GET", "/api/mcp/connections"]]) {
    assert.equal((await stack.http(m, p, { token: key, body: m === "POST" ? { name: "x" } : undefined })).status, 403, `${m} ${p}`);
  }
  assert.equal((await stack.http("GET", "/api/final-people?limit=1", { token: "doott_notarealkey" })).status, 401);

  // Another user cannot revoke it
  assert.equal((await stack.http("DELETE", `/api/account/api-keys/${list.json.keys[0].id}`, { token: v.token })).status, 404);
  assert.equal((await stack.http("DELETE", `/api/account/api-keys/${list.json.keys[0].id}`, { token: u.token })).status, 200);
  assert.equal((await stack.http("GET", "/api/final-people?limit=1", { token: key })).status, 401, "revoked key stops working");
});

test("account: delete needs the email and password, then removes the account", { skip }, async () => {
  const u = await stack.newUser("delete");
  const c = await stack.http("POST", "/api/account/api-keys", { token: u.token, body: { name: "k" } });
  assert.equal((await stack.http("DELETE", "/api/account", { token: u.token, body: { confirmEmail: "nope@example.test", password: u.password } })).status, 400);
  assert.equal((await stack.http("DELETE", "/api/account", { token: u.token, body: { confirmEmail: u.email, password: "wrong-password" } })).status, 400);
  assert.equal((await stack.http("DELETE", "/api/account", { token: u.token, body: { confirmEmail: u.email, password: u.password } })).status, 200);
  assert.equal((await stack.http("GET", "/api/auth/me", { token: u.token })).status, 401, "token of a deleted account is refused");
  assert.equal((await stack.http("GET", "/api/final-people?limit=1", { token: c.json.key })).status, 401, "its API keys are gone");
  assert.equal((await stack.http("POST", "/api/auth/login", { body: { email: u.email, password: u.password } })).status, 401);
});

test("features: Settings is always enabled for every user", { skip }, async () => {
  const r = await stack.http("GET", "/api/features");
  assert.equal(r.json.features.settings.status, "enabled");
});
