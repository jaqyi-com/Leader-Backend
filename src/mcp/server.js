"use strict";
// ============================================================
// DOOTT MCP SERVER — POST /mcp (Streamable HTTP, stateless)
// ============================================================
// Lets Claude search Doott for the signed-in user. Every tool call is replayed in-process through
// the normal Doott API (/api/final-people, /api/final-companies, …) as that user, so the same
// auth, plan check (requirePaidAccess), rate limits (dataLimiter, per user) and query guards apply.
// Nothing here talks to the database directly.
// ============================================================

const express = require("express");
const jwt = require("jsonwebtoken");
const { dispatch } = require("./dispatch");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { JWT_SECRET } = require("../config/jwtSecret");
const db = require("../db/appDb");
const { verifyAccessToken, baseUrl, ensureDb } = require("./oauth");
const logger = require("../utils/logger").forAgent("McpServer");

const SERVER_INFO = { name: "doott", title: "Doott", version: "1.0.0" };
const INSTRUCTIONS =
  "Doott is a B2B contact database, mainly India and the USA (plus Canada and smaller coverage of 200+ other " +
  "countries): ~45M people and ~1.7M companies with emails, " +
  "phone numbers, job titles and locations. Use search_people for individuals (filter by job_title, city, " +
  "state, country, has_email, has_phone, email_status) and search_companies for businesses. Use " +
  "list_categories / list_cities to see which job titles, industries and cities have the most records. " +
  "Use email_status='deliverable' to get only verified emails (both search tools support it). " +
  "The country filter accepts a name or ISO code; outside India, the USA and Canada counts are small. " +
  "Results are paginated (max 50 per call); report the total and say when it is an estimate (total_exact=false). " +
  "Email status 'deliverable' means verified; treat 'pending', 'unknown' and 'risky' as unverified.";

// Fields that only add noise for Claude.
const DROP_FIELDS = new Set(["lat", "long", "created_at", "updated_at", "_row_hash", "embedding"]);

function compactRecord(rec) {
  const out = {};
  for (const [k, v] of Object.entries(rec || {})) {
    if (DROP_FIELDS.has(k) || v === "" || v === null || v === undefined) continue;
    if (k === "similarity_score") { out[k] = Math.round(Number(v) * 1000) / 1000; continue; }
    out[k] = v;
  }
  return out;
}

const result = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
});
const failure = (message) => ({ content: [{ type: "text", text: message }], isError: true });

/** Build the request context for one MCP call: who the user is and how to call the API as them. */
async function userContext(req, userId) {
  const user = await db.findUserById(userId);
  if (!user) return null;
  const member = user.defaultOrgId ? null : await db.firstMembership(user._id);
  const orgId = user.defaultOrgId || member?.orgId || null;
  // Short-lived app token for in-process calls only; it never leaves this function.
  const appToken = jwt.sign(
    { userId: String(user._id), email: user.email, orgId: orgId ? String(orgId) : null, role: member?.role || "member", tv: user.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: 120 }
  );
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "127.0.0.1";

  async function callApi(method, path, { query, body } = {}) {
    const qs = query
      ? "?" + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString()
      : "";
    const r = await dispatch(req.app, {
      method,
      url: path + qs,
      headers: {
        authorization: `Bearer ${appToken}`,
        "x-forwarded-for": ip,
        "user-agent": "doott-mcp",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body,
    });
    let json = null;
    try { json = JSON.parse(r.body); } catch { /* not JSON */ }
    return { status: r.status, json };
  }
  return { email: user.email, callApi };
}

function apiError(r) {
  const msg = r.json?.error || `Doott returned HTTP ${r.status}`;
  if (r.status === 402) return failure(`${msg} (Doott account needs the paid plan: ${process.env.FRONTEND_URL || "https://doott.jaqyi.com"}/join)`);
  if (r.status === 429) return failure(`${msg} Doott rate limit reached; wait a few minutes before searching again.`);
  return failure(msg);
}

function searchResult(r, page, limit) {
  const j = r.json || {};
  return result({
    total: j.total,
    total_exact: Boolean(j.total_exact),
    page: j.page ?? page,
    limit: j.limit ?? limit,
    pages: j.pages,
    ...(j.sort_notice ? { notice: j.sort_notice } : {}),
    records: (j.records || []).map(compactRecord),
  });
}

// Searches take any country (name or ISO code); the category / city lists only exist for India and the USA.
const country = z.string().trim().min(2).max(60).optional()
  .describe("Country name or ISO code, e.g. 'India', 'USA', 'Canada', 'GB', 'Germany'. India and the USA have by far the most data");
const listCountry = z.enum(["india", "usa"]).optional().describe("Limit to India or the USA");
const page = z.number().int().min(1).max(200).optional().describe("Page number, starting at 1");
const limit = z.number().int().min(1).max(50).optional().describe("Results per page (default 25, max 50)");
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function buildServer(ctx) {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  server.registerTool("search_people", {
    title: "Search people",
    description:
      "Search Doott's people database (India + USA). Returns names, job titles, locations, LinkedIn URLs, " +
      "emails and phone numbers. 'query' is a semantic search over name/title/location; the other fields are filters.",
    inputSchema: {
      query: z.string().max(200).optional().describe("Free-text semantic search, e.g. 'HR manager in Pune'"),
      job_title: z.string().max(100).optional().describe("Job title contains these words, e.g. 'Talent Acquisition'"),
      exact_job_title: z.boolean().optional().describe("Match job_title exactly (case-insensitive) instead of 'contains'"),
      city: z.string().max(80).optional(),
      state: z.string().max(80).optional().describe("State name or US state code, e.g. 'Karnataka' or 'TX'"),
      country,
      has_email: z.boolean().optional().describe("Only people with (true) / without (false) an email"),
      has_phone: z.boolean().optional().describe("Only people with (true) / without (false) a phone number"),
      email_status: z.enum(["deliverable", "undeliverable", "risky", "unknown"]).optional().describe("Email verification status"),
      page, limit,
    },
    annotations: { title: "Search people", ...readOnly },
  }, async (a) => {
    const p = a.page || 1; const l = a.limit || 25;
    const query = {
      page: p, limit: l, search: a.query,
      [a.exact_job_title ? "f_job_title_eq" : "f_job_title"]: a.job_title,
      f_city: a.city, f_state: a.state, f_country: a.country,
      f_has_email: a.has_email === undefined ? undefined : String(a.has_email),
      f_has_phone: a.has_phone === undefined ? undefined : String(a.has_phone),
      f_email_status: a.email_status,
    };
    const r = await ctx.callApi("GET", "/api/final-people", { query });
    return r.status === 200 ? searchResult(r, p, l) : apiError(r);
  });

  server.registerTool("search_companies", {
    title: "Search companies",
    description:
      "Search Doott's company database (India + USA). Returns business name, industry, website/domain, address, " +
      "city/state, emails and phone numbers. 'query' is a semantic search; the other fields are filters.",
    inputSchema: {
      query: z.string().max(200).optional().describe("Free-text semantic search, e.g. 'cloud consulting firms in Bengaluru'"),
      business_name: z.string().max(120).optional(),
      industry: z.string().max(100).optional().describe("Industry contains, e.g. 'Software'"),
      exact_industry: z.boolean().optional().describe("Match industry exactly (case-insensitive)"),
      domain: z.string().max(120).optional().describe("Website domain, e.g. 'acme.com'"),
      city: z.string().max(80).optional(),
      state: z.string().max(80).optional(),
      country,
      has_email: z.boolean().optional(),
      has_phone: z.boolean().optional(),
      email_status: z.enum(["deliverable", "undeliverable", "risky", "unknown"]).optional()
        .describe("Email verification status; 'deliverable' = verified, use it for a clean outreach list"),
      phone_status: z.enum(["valid", "mobile", "landline", "invalid"]).optional()
        .describe("Phone check result; 'mobile' = valid mobile number"),
      page, limit,
    },
    annotations: { title: "Search companies", ...readOnly },
  }, async (a) => {
    const p = a.page || 1; const l = a.limit || 25;
    const query = {
      page: p, limit: l, search: a.query,
      f_business_name: a.business_name,
      [a.exact_industry ? "f_industry_eq" : "f_industry"]: a.industry,
      f_domain: a.domain, f_city: a.city, f_state: a.state, f_country: a.country,
      f_has_email: a.has_email === undefined ? undefined : String(a.has_email),
      f_has_phone: a.has_phone === undefined ? undefined : String(a.has_phone),
      f_email_status: a.email_status,
      f_phone_status: a.phone_status,
    };
    const r = await ctx.callApi("GET", "/api/final-companies", { query });
    return r.status === 200 ? searchResult(r, p, l) : apiError(r);
  });

  server.registerTool("list_categories", {
    title: "List categories",
    description:
      "The largest job titles (people) or industries (companies) in Doott with exact record counts. " +
      "Use the names as job_title / industry filters with exact_job_title / exact_industry = true.",
    inputSchema: {
      kind: z.enum(["people", "companies"]).describe("people = job titles, companies = industries"),
      country: listCountry,
    },
    annotations: { title: "List categories", ...readOnly },
  }, async (a) => {
    const path = a.kind === "companies" ? "/api/final-companies/categories" : "/api/final-people/categories";
    const r = await ctx.callApi("GET", path);
    if (r.status !== 200) return apiError(r);
    const rows = (Array.isArray(r.json) ? r.json : []).filter((c) => !a.country || c.country === a.country);
    return result({ kind: a.kind, categories: rows.map((c) => ({ name: c.name, count: c.count, country: c.country })) });
  });

  server.registerTool("list_cities", {
    title: "List cities",
    description: "Cities with the most Doott records (people or companies), with exact counts.",
    inputSchema: {
      kind: z.enum(["people", "companies"]),
      country: listCountry,
    },
    annotations: { title: "List cities", ...readOnly },
  }, async (a) => {
    const path = a.kind === "companies" ? "/api/final-companies/cities" : "/api/final-people/cities";
    const r = await ctx.callApi("GET", path);
    if (r.status !== 200) return apiError(r);
    const rows = (r.json?.cities || []).filter((c) => !a.country || c.country === a.country);
    return result({ kind: a.kind, cities: rows.map((c) => ({ name: c.name, state: c.state || undefined, count: c.count, country: c.country })) });
  });

  server.registerTool("verify_email", {
    title: "Verify email",
    description: "Check whether an email address is deliverable (syntax, MX, SMTP mailbox, catch-all, disposable).",
    inputSchema: { email: z.string().email().max(254) },
    annotations: { title: "Verify email", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (a) => {
    const r = await ctx.callApi("POST", "/api/verify-email", { body: { email: a.email } });
    return r.status === 200 ? result(r.json) : apiError(r);
  });

  server.registerTool("whoami", {
    title: "Connected account",
    description: "Which Doott account this connection uses.",
    inputSchema: {},
    annotations: { title: "Connected account", ...readOnly },
  }, async () => result({ email: ctx.email }));

  return server;
}

// ── HTTP endpoint ─────────────────────────────────────────────────────────────
const router = express.Router();

function cors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, mcp-protocol-version, mcp-session-id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, mcp-session-id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

function unauthorized(req, res, description) {
  const meta = `${baseUrl(req)}/.well-known/oauth-protected-resource/mcp`;
  res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${meta}"${description ? `, error="invalid_token", error_description="${description}"` : ""}`);
  return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Sign in to Doott to use this connector." }, id: null });
}

router.all("/mcp", cors, express.json({ limit: "1mb" }), ensureDb, async (req, res) => {
  if (req.method !== "POST") {
    // Stateless server: no standalone SSE stream and no sessions to delete.
    return res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return unauthorized(req, res);
  const who = await verifyAccessToken(token).catch(() => null);
  if (!who) return unauthorized(req, res, "The access token is invalid, expired or revoked");

  try {
    const ctx = await userContext(req, who.userId);
    if (!ctx) return unauthorized(req, res, "The Doott account no longer exists");
    const server = buildServer(ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error(`mcp request failed: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});

module.exports = { router };
