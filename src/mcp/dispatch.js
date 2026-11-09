"use strict";
// Run one request through the Express app in-process and collect the response.
// Used by the MCP tools so they go through the normal API stack (auth, plan check, rate limits)
// without a network round trip. Uses plain node:http objects; nothing global is patched.

const http = require("node:http");
const net = require("node:net");

const TIMEOUT_MS = 60_000;

function dispatch(app, { method = "GET", url, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const socket = new net.Socket(); // never connected; the response is captured below
    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    if (payload) req.headers["content-length"] = String(payload.length);
    if (payload) req.push(payload);
    req.push(null);

    const res = new http.ServerResponse(req);
    const chunks = [];
    let done = false;
    const add = (chunk, enc) => {
      if (chunk === undefined || chunk === null || typeof chunk === "function") return;
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === "string" ? enc : "utf8"));
    };
    const timer = setTimeout(() => finish(new Error("in-process request timed out")), TIMEOUT_MS);
    function finish(err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) return reject(err);
      resolve({ status: res.statusCode, headers: res.getHeaders(), body: Buffer.concat(chunks).toString("utf8") });
    }
    // Own properties win over the prototype Express installs on res.
    res.write = (chunk, enc, cb) => { add(chunk, enc); (typeof enc === "function" ? enc : cb)?.(); return true; };
    res.end = (chunk, enc, cb) => {
      add(chunk, enc);
      res.headersSent || res.writeHead(res.statusCode);
      res.finished = true;
      finish();
      res.emit("finish");
      (typeof chunk === "function" ? chunk : typeof enc === "function" ? enc : cb)?.();
      return res;
    };
    try { app(req, res); } catch (err) { finish(err); }
  });
}

module.exports = { dispatch };
