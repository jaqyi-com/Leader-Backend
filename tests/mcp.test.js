"use strict";
// MCP connector: OAuth (registration, consent, PKCE, refresh rotation, revocation) and the /mcp tools,
// against the hermetic local stack (synthetic people only). Skipped when mongod / PostgreSQL are missing.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { startStack, available } = require("./helpers/stack");

const skip = (!available.mongod && "mongod not installed") || (!available.postgres && "PostgreSQL not installed");
const FRONTEND = "https://frontend.example.test";
const REDIRECT = "http://localhost:53682/callback";
let stack, user;

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const pkce = () => {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(crypto.createHash("sha256").update(verifier).digest()) };
};

async function req(method, path, { headers = {}, body, form } = {}) {
  const res = await fetch(stack.base + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, headers: res.headers, json, text };
}

let rpcId = 0;
const rpc = (token, method, params = {}) => req("POST", "/mcp", {
  headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
  body: { jsonrpc: "2.0", id: ++rpcId, method, params },
});

async function register() {
  const r = await req("POST", "/oauth/register", { body: { client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" } });
  assert.equal(r.status, 201, r.text);
  return r.json.client_id;
}

/** Run authorize → consent → approve and return { code, verifier }. */
async function authorize(clientId, { approve = true } = {}) {
  const { verifier, challenge } = pkce();
  const qs = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "xyz" });
  const a = await req("GET", `/oauth/authorize?${qs}`);
  assert.equal(a.status, 302);
  const loc = new URL(a.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, `${FRONTEND}/connect/claude`);
  const request = loc.searchParams.get("request");

  const c = await req("GET", `/api/mcp/consent?request=${encodeURIComponent(request)}`, { headers: { authorization: `Bearer ${user.token}` } });
  assert.equal(c.status, 200);
  assert.equal(c.json.clientName, "Claude");
  assert.equal(c.json.redirectHost, "localhost:53682");

  const ap = await req("POST", "/api/mcp/approve", { headers: { authorization: `Bearer ${user.token}` }, body: { request, approve } });
  assert.equal(ap.status, 200);
  const back = new URL(ap.json.redirect);
  assert.equal(back.origin + back.pathname, REDIRECT);
  assert.equal(back.searchParams.get("state"), "xyz");
  return { code: back.searchParams.get("code"), error: back.searchParams.get("error"), verifier };
}

const exchange = (clientId, code, verifier) => req("POST", "/oauth/token", {
  form: { grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: REDIRECT },
});

test.before(async () => {
  if (skip) return;
  stack = await startStack({ postgres: true, env: { FRONTEND_URL: FRONTEND } });
  user = await stack.newUser("mcp");
});
test.after(async () => { if (stack) await stack.stop(); });

test("mcp: discovery metadata and 401 challenge", { skip }, async () => {
  const pr = await req("GET", "/.well-known/oauth-protected-resource/mcp");
  assert.equal(pr.status, 200);
  assert.equal(pr.json.resource, `${stack.base}/mcp`);
  assert.deepEqual(pr.json.authorization_servers, [stack.base]);

  const as = await req("GET", "/.well-known/oauth-authorization-server");
  assert.equal(as.status, 200);
  assert.equal(as.json.token_endpoint, `${stack.base}/oauth/token`);
  assert.deepEqual(as.json.code_challenge_methods_supported, ["S256"]);

  const r = await req("POST", "/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  assert.equal(r.status, 401);
  assert.match(r.headers.get("www-authenticate"), /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test("mcp: registration rejects unsafe redirect URIs; authorize never redirects to unregistered ones", { skip }, async () => {
  for (const uris of [["http://evil.example/cb"], ["javascript:alert(1)"], ["https://ok.example/cb#frag"], []]) {
    const r = await req("POST", "/oauth/register", { body: { redirect_uris: uris } });
    assert.equal(r.status, 400, JSON.stringify(uris));
  }
  const clientId = await register();
  const { challenge } = pkce();
  const qs = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "https://evil.example/cb", code_challenge: challenge, code_challenge_method: "S256" });
  const r = await req("GET", `/oauth/authorize?${qs}`);
  assert.equal(r.status, 400);
  assert.equal(r.headers.get("location"), null);
  // Missing PKCE goes back to the (registered) client with an error.
  const noPkce = await req("GET", `/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT })}`);
  assert.equal(noPkce.status, 302);
  assert.equal(new URL(noPkce.headers.get("location")).searchParams.get("error"), "invalid_request");
});

test("mcp: consent endpoints need a Doott login", { skip }, async () => {
  assert.equal((await req("GET", "/api/mcp/consent?request=x")).status, 401);
  assert.equal((await req("POST", "/api/mcp/approve", { body: { request: "x", approve: true } })).status, 401);
  const bad = await req("GET", "/api/mcp/consent?request=forged", { headers: { authorization: `Bearer ${user.token}` } });
  assert.equal(bad.status, 400);
});

test("mcp: deny returns access_denied without a code", { skip }, async () => {
  const clientId = await register();
  const r = await authorize(clientId, { approve: false });
  assert.equal(r.code, null);
  assert.equal(r.error, "access_denied");
});

test("mcp: full flow — token exchange, tools, token separation, refresh rotation, disconnect", { skip }, async () => {
  const clientId = await register();
  const { code, verifier } = await authorize(clientId);

  assert.equal((await exchange(clientId, code, "wrong-verifier-" + "x".repeat(40))).json.error, "invalid_grant", "PKCE checked");
  // The failed attempt consumed the code (single use), so run authorize again.
  const second = await authorize(clientId);
  const t = await exchange(clientId, second.code, second.verifier);
  assert.equal(t.status, 200, t.text);
  assert.equal(t.json.token_type, "Bearer");
  assert.ok(t.json.access_token && t.json.refresh_token);
  assert.equal((await exchange(clientId, second.code, second.verifier)).json.error, "invalid_grant", "code is single use");
  assert.equal((await exchange(clientId, code, verifier)).json.error, "invalid_grant");

  // Tokens are not interchangeable with Doott login tokens.
  assert.equal((await rpc(user.token, "tools/list")).status, 401, "app JWT rejected by /mcp");
  assert.equal((await req("GET", "/api/final-people?limit=1", { headers: { authorization: `Bearer ${t.json.access_token}` } })).status, 401, "MCP token rejected by the API");

  const init = await rpc(t.json.access_token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal(init.status, 200, init.text);
  assert.equal(init.json.result.serverInfo.name, "doott");

  const list = await rpc(t.json.access_token, "tools/list");
  const names = list.json.result.tools.map((x) => x.name).sort();
  assert.deepEqual(names, ["list_categories", "list_cities", "search_companies", "search_people", "verify_email", "whoami"]);

  const who = await rpc(t.json.access_token, "tools/call", { name: "whoami", arguments: {} });
  assert.equal(who.json.result.structuredContent.email, user.email);

  const s = await rpc(t.json.access_token, "tools/call", { name: "search_people", arguments: { city: "Pune", limit: 5 } });
  assert.equal(s.status, 200, s.text);
  const out = s.json.result.structuredContent;
  assert.equal(s.json.result.isError, undefined);
  assert.equal(out.records.length, 5);
  for (const rec of out.records) {
    assert.equal(rec.city, "Pune");
    assert.equal(rec.uuid, undefined);
    assert.equal(rec.embedding, undefined);
  }
  const exact = await rpc(t.json.access_token, "tools/call", { name: "search_people", arguments: { job_title: "cto", exact_job_title: true, limit: 50 } });
  const titles = new Set(exact.json.result.structuredContent.records.map((x) => x.job_title));
  assert.deepEqual([...titles], ["CTO"], "exact title match, not 'Director'/'Factory Manager'");

  const cats = await rpc(t.json.access_token, "tools/call", { name: "list_categories", arguments: { kind: "people", country: "usa" } });
  const catRows = cats.json.result.structuredContent.categories;
  assert.ok(catRows.length > 0 && catRows.every((c) => c.country === "usa" && Number.isFinite(c.count)));

  const big = await rpc(t.json.access_token, "tools/call", { name: "search_people", arguments: { limit: 500 } });
  assert.ok(big.json.result.isError || big.json.error, "limit above 50 is rejected by the schema");

  // Refresh rotates the token; the old refresh token stops working.
  const r1 = await req("POST", "/oauth/token", { form: { grant_type: "refresh_token", client_id: clientId, refresh_token: t.json.refresh_token } });
  assert.equal(r1.status, 200);
  assert.notEqual(r1.json.refresh_token, t.json.refresh_token);
  const reuse = await req("POST", "/oauth/token", { form: { grant_type: "refresh_token", client_id: clientId, refresh_token: t.json.refresh_token } });
  assert.equal(reuse.json.error, "invalid_grant");

  // Disconnect in Settings ends the connection.
  const conns = await req("GET", "/api/mcp/connections", { headers: { authorization: `Bearer ${user.token}` } });
  assert.equal(conns.status, 200);
  assert.ok(conns.json.connections.length >= 1);
  for (const c of conns.json.connections) {
    assert.equal((await req("DELETE", `/api/mcp/connections/${c.id}`, { headers: { authorization: `Bearer ${user.token}` } })).status, 200);
  }
  assert.equal((await rpc(r1.json.access_token, "tools/list")).status, 401, "revoked access token rejected");
  const after = await req("POST", "/oauth/token", { form: { grant_type: "refresh_token", client_id: clientId, refresh_token: r1.json.refresh_token } });
  assert.equal(after.json.error, "invalid_grant", "revoked refresh token rejected");
});

test("mcp: another user cannot disconnect someone else's connection", { skip }, async () => {
  const clientId = await register();
  const { code, verifier } = await authorize(clientId);
  assert.equal((await exchange(clientId, code, verifier)).status, 200);
  const mine = await req("GET", "/api/mcp/connections", { headers: { authorization: `Bearer ${user.token}` } });
  const other = await stack.newUser("other");
  const id = mine.json.connections[0].id;
  assert.equal((await req("DELETE", `/api/mcp/connections/${id}`, { headers: { authorization: `Bearer ${other.token}` } })).status, 404);
});

test("mcp: tools respect the paid-access policy", { skip }, async () => {
  const paid = await startStack({ postgres: true, env: { FRONTEND_URL: FRONTEND, DATA_ACCESS_POLICY: "paid" } });
  const saved = { stack, user };
  try {
    stack = paid;
    user = await paid.newUser("free");
    await paid.setPlan(user.email, "free");
    const clientId = await register();
    const { code, verifier } = await authorize(clientId);
    const t = await exchange(clientId, code, verifier);
    const r = await rpc(t.json.access_token, "tools/call", { name: "search_people", arguments: { limit: 1 } });
    assert.equal(r.json.result.isError, true);
    assert.match(r.json.result.content[0].text, /paid plan/);
  } finally {
    ({ stack, user } = saved);
    await paid.stop();
  }
});
