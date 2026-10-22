"use strict";
// Email verifier servers: DOOTT_VERIFIER_URLS is tried in order, a failing or slow server hands the
// rest of the time budget to the next one, and the whole call never takes longer than the budget.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function server(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}
const ok = (req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ status: "valid", smtp_code: 250, is_catch_all: false, confidence: 95 }));
};
const fail = (req, res) => { res.statusCode = 503; res.end("busy"); };
const hang = () => {};  // never answers

function client(urls) {
  process.env.DOOTT_VERIFIER_URLS = urls.join(",");
  delete require.cache[require.resolve("../src/services/emailVerification/vpsVerifierClient")];
  return require("../src/services/emailVerification/vpsVerifierClient");
}

test("verifier: a failing server falls over to the next one", async () => {
  const a = await server(fail), b = await server(ok);
  try {
    const { verifyViaVps, isVpsConfigured } = client([a.url, b.url]);
    assert.equal(isVpsConfigured(), true);
    const r = await verifyViaVps("someone@example.com", { timeoutMs: 3000 });
    assert.equal(r.state, "deliverable");
    assert.equal(r.details.vps_verified, true);
  } finally { a.s.close(); b.s.close(); }
});

test("verifier: a hanging server never makes the call take longer than its budget", async () => {
  const a = await server(hang), b = await server(ok);
  try {
    const { verifyViaVps } = client([a.url, b.url]);
    const t0 = Date.now();
    // the first server takes the whole budget (it never answers), so nothing is left for the second
    assert.equal(await verifyViaVps("x@example.com", { timeoutMs: 1200 }), null);
    assert.ok(Date.now() - t0 < 2000, "stays within the time budget");
  } finally { a.s.closeAllConnections(); a.s.close(); b.s.close(); }
});

test("verifier: no server answering returns null (caller falls back)", async () => {
  const a = await server(fail), b = await server(fail);
  try {
    const { verifyViaVps } = client([a.url, b.url]);
    assert.equal(await verifyViaVps("x@example.com", { timeoutMs: 2000 }), null);
  } finally { a.s.close(); b.s.close(); }
});

test("verifier: a single DOOTT_VERIFIER_URL still works", async () => {
  const b = await server(ok);
  try {
    delete process.env.DOOTT_VERIFIER_URLS;
    process.env.DOOTT_VERIFIER_URL = b.url;
    delete require.cache[require.resolve("../src/services/emailVerification/vpsVerifierClient")];
    const { verifyViaVps } = require("../src/services/emailVerification/vpsVerifierClient");
    assert.equal((await verifyViaVps("x@example.com", { timeoutMs: 2000 })).state, "deliverable");
  } finally { b.s.close(); delete process.env.DOOTT_VERIFIER_URL; }
});
