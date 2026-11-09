"use strict";
// ============================================================
// OAUTH 2.1 FOR THE DOOTT MCP CONNECTOR
// ============================================================
// Lets a user connect Doott to Claude (claude.ai, Claude Desktop, Claude Code) by signing in to Doott
// and clicking "Allow". Implements what the MCP authorization spec asks of a server:
//
//   GET  /.well-known/oauth-protected-resource[/mcp]  RFC 9728 — where to get tokens for /mcp
//   GET  /.well-known/oauth-authorization-server      RFC 8414 — endpoints below
//   POST /oauth/register                              RFC 7591 — dynamic client registration
//   GET  /oauth/authorize                             → Doott consent page (frontend /connect/claude)
//   POST /oauth/token                                 authorization_code (PKCE S256) + refresh_token
//   POST /oauth/revoke                                RFC 7009
//
// Used by the consent page and Settings (normal Doott login token required):
//   GET    /api/mcp/consent?request=…   who is asking
//   POST   /api/mcp/approve             { request, approve } → { redirect }
//   GET    /api/mcp/connections         the user's connected clients
//   DELETE /api/mcp/connections/:id     disconnect one
//
// Tokens: access tokens are 1-hour JWTs signed with a key derived from JWT_SECRET (so a Doott login
// token is never accepted by /mcp and an MCP token is never accepted by the rest of the API).
// Refresh tokens are random, stored hashed, rotated on every use, and revocable.
// ============================================================

const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { JWT_SECRET } = require("../config/jwtSecret");
const { auth } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimiter");
const { McpClient, McpAuthCode, McpGrant } = require("../db/models/mcpOAuth");
const logger = require("../utils/logger").forAgent("McpOAuth");

const MCP_KEY = crypto.createHmac("sha256", JWT_SECRET).update("doott-mcp-oauth-v1").digest();
const ACCESS_TTL_S = 60 * 60;                  // 1 hour
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, renewed on every refresh
const CODE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TTL_S = 15 * 60;                 // time to sign in and click Allow
const SCOPE = "doott:read";
const AUDIENCE = "doott-mcp";

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function baseUrl(req) {
  if (process.env.MCP_PUBLIC_URL) return process.env.MCP_PUBLIC_URL.replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}
const frontendUrl = () => (process.env.FRONTEND_URL || "http://localhost:5174").replace(/\/$/, "");

function isAllowedRedirectUri(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  // Claude Code and Claude Desktop receive the code on a loopback port.
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}

const oauthError = (res, status, error, description) =>
  res.status(status).json({ error, ...(description ? { error_description: description } : {}) });

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function errorPage(res, message) {
  res.status(400).type("html").send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Doott connection error</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px">` +
    `<h1 style="font-size:20px">Could not connect to Doott</h1><p>${escapeHtml(message)}</p></body>`
  );
}

function issueAccessToken(grant) {
  return jwt.sign(
    { typ: "mcp_access", gid: String(grant._id), cid: grant.clientId, scope: SCOPE },
    MCP_KEY,
    { algorithm: "HS256", subject: String(grant.userId), audience: AUDIENCE, expiresIn: ACCESS_TTL_S }
  );
}

/** Verify an MCP access token. Returns { userId, grantId, clientId } or null. */
const grantCache = new Map(); // grantId -> { ok, at }
async function verifyAccessToken(token) {
  let p;
  try {
    p = jwt.verify(token, MCP_KEY, { algorithms: ["HS256"], audience: AUDIENCE });
  } catch { return null; }
  if (p.typ !== "mcp_access" || !p.sub || !p.gid) return null;
  // Disconnecting in Settings must take effect quickly, so check the grant (cached 30 s).
  const hit = grantCache.get(p.gid);
  let ok;
  if (hit && Date.now() - hit.at < 30_000) ok = hit.ok;
  else {
    if (!mongoose.isValidObjectId(p.gid)) return null;
    const g = await McpGrant.findById(p.gid).select("revokedAt userId").lean();
    ok = Boolean(g && !g.revokedAt && String(g.userId) === p.sub);
    grantCache.set(p.gid, { ok, at: Date.now() });
    if (ok) McpGrant.updateOne({ _id: p.gid }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return ok ? { userId: p.sub, grantId: p.gid, clientId: p.cid } : null;
}

async function newGrantTokens(grant) {
  const refreshToken = randomToken();
  grant.refreshTokenHash = sha256(refreshToken);
  grant.refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await grant.save();
  return {
    access_token: issueAccessToken(grant),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: refreshToken,
    scope: SCOPE,
  };
}

/** Client authentication at the token / revoke endpoints. Returns the client or null. */
async function authenticateClient(req) {
  let clientId = req.body.client_id;
  let secret = req.body.client_secret;
  const basic = req.headers.authorization;
  if (basic && basic.startsWith("Basic ")) {
    const [id, sec] = Buffer.from(basic.slice(6), "base64").toString().split(":");
    clientId = decodeURIComponent(id || "");
    secret = decodeURIComponent(sec || "");
  }
  if (!clientId || typeof clientId !== "string") return null;
  const client = await McpClient.findOne({ clientId }).lean();
  if (!client) return null;
  if (client.clientSecretHash) {
    if (!secret || !safeEqual(sha256(secret), client.clientSecretHash)) return null;
  }
  return client;
}

// ── Router ────────────────────────────────────────────────────────────────────
// publicRouter is mounted before the app-wide CORS and JWT guard (MCP clients are not the Doott
// frontend); apiRouter holds the endpoints the Doott frontend calls with a normal login token.
const publicRouter = express.Router();
const apiRouter = express.Router();
const json = express.json({ limit: "20kb" }); // per route: a router-wide parser would also run for /api/payments/webhook
const oauthLimiter = createRateLimiter(60, 60, {
  key: (req) => `mcp-oauth:${req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress}`,
});
const form = express.urlencoded({ extended: false, limit: "20kb" });

// Discovery documents may be fetched by browser-based clients.
function openCors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, mcp-protocol-version");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

publicRouter.options(["/.well-known/*path", "/oauth/*path"], openCors);

function protectedResourceMetadata(req, res) {
  const base = baseUrl(req);
  res.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Doott",
    resource_documentation: `${frontendUrl()}/app/settings`,
  });
}
publicRouter.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], openCors, protectedResourceMetadata);

publicRouter.get(["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp"], openCors, (req, res) => {
  const base = baseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
  });
});

// Dynamic client registration
publicRouter.post("/oauth/register", openCors, oauthLimiter, json, async (req, res) => {
  try {
    const body = req.body || {};
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === "string" && u.length <= 2000)) {
      return oauthError(res, 400, "invalid_redirect_uri", "redirect_uris must be a list of 1-10 URLs");
    }
    if (!uris.every(isAllowedRedirectUri)) {
      return oauthError(res, 400, "invalid_redirect_uri", "redirect_uris must use https (or http on localhost)");
    }
    const method = body.token_endpoint_auth_method || "none";
    if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
      return oauthError(res, 400, "invalid_client_metadata", "unsupported token_endpoint_auth_method");
    }
    const grantTypes = body.grant_types || ["authorization_code", "refresh_token"];
    if (!Array.isArray(grantTypes) || !grantTypes.every((g) => ["authorization_code", "refresh_token"].includes(g))) {
      return oauthError(res, 400, "invalid_client_metadata", "unsupported grant_types");
    }
    const clientName = String(body.client_name || "MCP client").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 100) || "MCP client";
    const clientId = `doott_${randomToken(18)}`;
    const clientSecret = method === "none" ? null : randomToken(32);
    await McpClient.create({
      clientId, clientName, redirectUris: uris, authMethod: method,
      clientSecretHash: clientSecret ? sha256(clientSecret) : null,
    });
    res.status(201).json({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
      scope: SCOPE,
    });
  } catch (err) {
    logger.error(`register failed: ${err.message}`);
    oauthError(res, 500, "server_error");
  }
});

// Authorization request → validate, then hand off to the Doott consent page.
publicRouter.get("/oauth/authorize", oauthLimiter, async (req, res) => {
  try {
    const q = req.query;
    const clientId = typeof q.client_id === "string" ? q.client_id : "";
    const redirectUri = typeof q.redirect_uri === "string" ? q.redirect_uri : "";
    const client = clientId ? await McpClient.findOne({ clientId }).lean() : null;
    if (!client) return errorPage(res, "This app is not registered with Doott. Remove the connector and add it again.");
    // Exact match against what the client registered: never redirect anywhere else.
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      return errorPage(res, "The app sent a redirect address it did not register.");
    }
    const back = (error, description) => {
      const u = new URL(redirectUri);
      u.searchParams.set("error", error);
      if (description) u.searchParams.set("error_description", description);
      if (typeof q.state === "string") u.searchParams.set("state", q.state);
      return res.redirect(302, u.toString());
    };
    if (q.response_type !== "code") return back("unsupported_response_type");
    if (typeof q.code_challenge !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge) || q.code_challenge_method !== "S256") {
      return back("invalid_request", "PKCE with code_challenge_method=S256 is required");
    }
    const request = jwt.sign(
      {
        typ: "mcp_authz_request",
        cid: clientId,
        ru: redirectUri,
        cc: q.code_challenge,
        st: typeof q.state === "string" ? q.state.slice(0, 1000) : null,
        rs: typeof q.resource === "string" ? q.resource.slice(0, 500) : null,
      },
      MCP_KEY,
      { algorithm: "HS256", expiresIn: REQUEST_TTL_S }
    );
    res.redirect(302, `${frontendUrl()}/connect/claude?request=${encodeURIComponent(request)}`);
  } catch (err) {
    logger.error(`authorize failed: ${err.message}`);
    errorPage(res, "Something went wrong. Please try again.");
  }
});

function readAuthzRequest(token) {
  try {
    const p = jwt.verify(String(token || ""), MCP_KEY, { algorithms: ["HS256"] });
    return p.typ === "mcp_authz_request" ? p : null;
  } catch { return null; }
}

// Token endpoint
publicRouter.post("/oauth/token", openCors, oauthLimiter, form, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  try {
    req.body = req.body || {};
    const client = await authenticateClient(req);
    if (!client) return oauthError(res, 401, "invalid_client");
    const grantType = req.body.grant_type;

    if (grantType === "authorization_code") {
      const { code, redirect_uri: redirectUri, code_verifier: verifier } = req.body;
      if (typeof code !== "string" || typeof verifier !== "string") return oauthError(res, 400, "invalid_request");
      // Single use: the code is deleted as it is read.
      const rec = await McpAuthCode.findOneAndDelete({ codeHash: sha256(code) }).lean();
      if (!rec || rec.expiresAt < new Date() || rec.clientId !== client.clientId) return oauthError(res, 400, "invalid_grant");
      if (redirectUri !== rec.redirectUri) return oauthError(res, 400, "invalid_grant", "redirect_uri mismatch");
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
      if (!safeEqual(challenge, rec.codeChallenge)) return oauthError(res, 400, "invalid_grant", "PKCE verification failed");
      const grant = new McpGrant({
        clientId: client.clientId, clientName: client.clientName, userId: rec.userId,
        refreshTokenHash: "pending-" + randomToken(), refreshExpiresAt: new Date(),
      });
      return res.json(await newGrantTokens(grant));
    }

    if (grantType === "refresh_token") {
      const rt = req.body.refresh_token;
      if (typeof rt !== "string") return oauthError(res, 400, "invalid_request");
      const grant = await McpGrant.findOne({ refreshTokenHash: sha256(rt) });
      if (!grant || grant.revokedAt || grant.refreshExpiresAt < new Date() || grant.clientId !== client.clientId) {
        return oauthError(res, 400, "invalid_grant");
      }
      return res.json(await newGrantTokens(grant));
    }

    return oauthError(res, 400, "unsupported_grant_type");
  } catch (err) {
    logger.error(`token failed: ${err.message}`);
    oauthError(res, 500, "server_error");
  }
});

// Token revocation (always 200, per RFC 7009)
publicRouter.post("/oauth/revoke", openCors, oauthLimiter, form, async (req, res) => {
  try {
    req.body = req.body || {};
    const client = await authenticateClient(req);
    if (!client) return oauthError(res, 401, "invalid_client");
    const token = typeof req.body.token === "string" ? req.body.token : "";
    let grantId = null;
    const byRefresh = token ? await McpGrant.findOne({ refreshTokenHash: sha256(token) }).select("_id clientId").lean() : null;
    if (byRefresh && byRefresh.clientId === client.clientId) grantId = byRefresh._id;
    if (!grantId) {
      try {
        const p = jwt.verify(token, MCP_KEY, { algorithms: ["HS256"], audience: AUDIENCE });
        if (p.cid === client.clientId && mongoose.isValidObjectId(p.gid)) grantId = p.gid;
      } catch { /* not ours */ }
    }
    if (grantId) {
      await McpGrant.updateOne({ _id: grantId }, { $set: { revokedAt: new Date() } });
      grantCache.delete(String(grantId));
    }
    res.sendStatus(200);
  } catch (err) {
    logger.error(`revoke failed: ${err.message}`);
    oauthError(res, 500, "server_error");
  }
});

// ── Consent + connection management (normal Doott login) ───────────────────
apiRouter.get("/api/mcp/consent", auth, async (req, res) => {
  const r = readAuthzRequest(req.query.request);
  if (!r) return res.status(400).json({ error: "This connection link has expired. Start again from Claude.", code: "REQUEST_EXPIRED" });
  const client = await McpClient.findOne({ clientId: r.cid }).lean();
  if (!client) return res.status(400).json({ error: "This app is no longer registered. Start again from Claude.", code: "UNKNOWN_CLIENT" });
  let redirectHost = "";
  try { redirectHost = new URL(r.ru).host; } catch { /* ignore */ }
  res.json({ clientName: client.clientName, redirectHost, email: req.user.email, scope: SCOPE });
});

apiRouter.post("/api/mcp/approve", auth, async (req, res) => {
  try {
    const r = readAuthzRequest(req.body?.request);
    if (!r) return res.status(400).json({ error: "This connection link has expired. Start again from Claude.", code: "REQUEST_EXPIRED" });
    const client = await McpClient.findOne({ clientId: r.cid }).lean();
    if (!client || !client.redirectUris.includes(r.ru)) {
      return res.status(400).json({ error: "This app is no longer registered. Start again from Claude.", code: "UNKNOWN_CLIENT" });
    }
    const u = new URL(r.ru);
    if (r.st) u.searchParams.set("state", r.st);
    if (req.body?.approve !== true) {
      u.searchParams.set("error", "access_denied");
      return res.json({ redirect: u.toString() });
    }
    const code = randomToken();
    await McpAuthCode.create({
      codeHash: sha256(code), clientId: r.cid, userId: req.user.userId, redirectUri: r.ru,
      codeChallenge: r.cc, resource: r.rs, expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    u.searchParams.set("code", code);
    res.json({ redirect: u.toString() });
  } catch (err) {
    logger.error(`approve failed: ${err.message}`);
    res.status(500).json({ error: "Could not complete the connection. Please try again." });
  }
});

apiRouter.get("/api/mcp/connections", auth, async (req, res) => {
  const grants = await McpGrant.find({ userId: req.user.userId, revokedAt: null, refreshExpiresAt: { $gt: new Date() } })
    .select("clientName createdAt lastUsedAt").sort({ createdAt: -1 }).lean();
  res.json({
    connections: grants.map((g) => ({ id: String(g._id), clientName: g.clientName, connectedAt: g.createdAt, lastUsedAt: g.lastUsedAt })),
  });
});

apiRouter.delete("/api/mcp/connections/:id", auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Connection not found." });
  const r = await McpGrant.updateOne({ _id: req.params.id, userId: req.user.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  grantCache.delete(req.params.id);
  if (!r.matchedCount) return res.status(404).json({ error: "Connection not found." });
  res.json({ ok: true });
});

module.exports = { publicRouter, apiRouter, verifyAccessToken, baseUrl };
