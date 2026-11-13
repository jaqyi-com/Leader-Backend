"use strict";
// Emails Doott sends (src/services/mailer.js + emailTemplates.js). MAIL_OUTBOX_FILE captures every
// message instead of sending it, so each flow can be checked: who gets what, with working links.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startStack, available } = require("./helpers/stack");

const skip = !available.postgres && "PostgreSQL not installed";
const OUTBOX = path.join(os.tmpdir(), `doott-outbox-${process.pid}.jsonl`);
let stack;

test.before(async () => {
  if (skip) return;
  fs.rmSync(OUTBOX, { force: true });
  stack = await startStack({ env: { MAIL_OUTBOX_FILE: OUTBOX, FRONTEND_URL: "https://app.example.test" } });
});
test.after(async () => { if (stack) await stack.stop(); fs.rmSync(OUTBOX, { force: true }); });

const outbox = () => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
async function mailTo(to, kind, ms = 5000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const m = outbox().filter((x) => x.to === to && x.kind === kind);
    if (m.length) return m[m.length - 1];
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
const count = (to, kind) => outbox().filter((x) => x.to === to && (!kind || x.kind === kind)).length;

test("sign-up sends a welcome email (names are escaped)", { skip }, async () => {
  const email = `welcome.${Date.now()}@example.test`;
  const r = await stack.http("POST", "/api/auth/register", { body: { name: "<b>Asha</b> Rao", email, password: "Passw0rd!welcome" } });
  assert.equal(r.status, 201);
  const m = await mailTo(email, "welcome");
  assert.ok(m, "welcome email");
  assert.equal(m.subject, "Welcome to Doott");
  assert.match(m.html, /Hi &lt;b&gt;Asha&lt;\/b&gt;,/);
  assert.ok(!m.html.includes("<b>Asha</b>"), "user input is never raw HTML");
  assert.match(m.text, /https:\/\/app\.example\.test\/app\/companies/);
});

test("forgot password: reset email with a working link, then a 'password reset' notice", { skip }, async () => {
  const u = await stack.newUser("reset");
  const r = await stack.http("POST", "/api/auth/forgot-password", { body: { email: u.email } });
  assert.equal(r.status, 200);
  const m = await mailTo(u.email, "passwordReset");
  assert.ok(m, "reset email");
  assert.equal(m.subject, "Reset your Doott password");
  const token = m.text.match(/reset-password\?token=([a-f0-9]+)/)[1];
  const done = await stack.http("POST", "/api/auth/reset-password", { body: { token, password: "N3w-Passw0rd!reset" } });
  assert.equal(done.status, 200);
  const notice = await mailTo(u.email, "passwordChanged");
  assert.equal(notice.subject, "Your Doott password was reset");
  assert.equal((await stack.http("POST", "/api/auth/login", { body: { email: u.email, password: "N3w-Passw0rd!reset" } })).status, 200);
});

test("forgot password for an unknown address sends nothing (and says the same)", { skip }, async () => {
  const before = outbox().length;
  const r = await stack.http("POST", "/api/auth/forgot-password", { body: { email: "nobody.here@example.test" } });
  assert.equal(r.status, 200);
  await new Promise((r2) => setTimeout(r2, 300));
  assert.equal(outbox().length, before);
});

test("Settings: password change, new API key and account deletion each send a notice", { skip }, async () => {
  const u = await stack.newUser("settings");
  const ch = await stack.http("POST", "/api/account/password", { token: u.token, body: { currentPassword: u.password, newPassword: "An0ther-Passw0rd!" } });
  assert.equal(ch.status, 200);
  assert.equal((await mailTo(u.email, "passwordChanged")).subject, "Your Doott password was changed");
  const key = await stack.http("POST", "/api/account/api-keys", { token: ch.json.token, body: { name: "Zapier <sync>" } });
  assert.equal(key.status, 201);
  const k = await mailTo(u.email, "apiKeyCreated");
  assert.match(k.html, /Zapier &lt;sync&gt;/);
  assert.ok(!k.text.includes(key.json.key), "the key itself is never emailed");
  assert.match(k.text, /app\/settings\?tab=api/);
  const del = await stack.http("DELETE", "/api/account", { token: ch.json.token, body: { confirmEmail: u.email, password: "An0ther-Passw0rd!" } });
  assert.equal(del.status, 200);
  assert.equal((await mailTo(u.email, "accountDeleted")).subject, "Your Doott account was deleted");
});

test("every template renders subject, HTML and text without user input breaking out", () => {
  const t = require("../src/services/emailTemplates");
  const evil = `"><script>alert(1)</script>`;
  const cases = {
    welcome: { name: evil, email: "a@b.test", paymentId: "pay_123" },
    passwordReset: { name: evil, email: "a@b.test", link: "https://x.test/reset-password?token=abc" },
    passwordChanged: { name: evil, email: "a@b.test", how: "set" },
    apiKeyCreated: { name: evil, keyName: evil, prefix: "doott_abc" },
    claudeConnected: { name: evil, clientName: evil },
    accountDeleted: { name: evil, email: "a@b.test" },
    verifyEmail: { name: evil, link: "https://x.test/verify-email?token=abc" },
    orgInvite: { orgName: evil, link: "https://x.test/invite?token=abc" },
  };
  for (const [kind, data] of Object.entries(cases)) {
    const m = t[kind](data);
    assert.ok(m.subject && m.html && m.text, kind);
    assert.ok(!m.html.includes("<script>"), `${kind}: escaped`);
    assert.match(m.html, /^<!doctype html>/, kind);
  }
  assert.match(t.welcome(cases.welcome).text, /Payment ID: pay_123/);
});
