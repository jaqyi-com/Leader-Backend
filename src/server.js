require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const passport = require("passport");
const logger = require("./utils/logger");
const validateCredentials = require("./utils/validateEnv");
const { connectDB } = require("./db/mongoose");
const { generalLimiter, dataLimiter } = require("./middleware/rateLimiter");
const { requirePaidAccess } = require("./middleware/entitlement");
const { auth } = require("./middleware/auth");
const { sanitizeBody } = require("./middleware/sanitizeBody");
const authRouter = require("./routes/auth");
const orgRouter = require("./routes/org");
const analyticsRouter = require("./routes/analytics");
const { configurePassport } = require("./config/passport");

connectDB();
configurePassport();

// Register weekly disposable email domains sync (Every Sunday at 03:00 UTC) - Only in long-running environments
if (!process.env.VERCEL) {
  cron.schedule("0 3 * * 0", async () => {
    try {
      logger.info("[Scheduler] 🔄 Running weekly disposable email domains sync from upstream...");
      const { syncDisposableDomainsFromGitHub } = require("./services/emailVerification");
      await syncDisposableDomainsFromGitHub();
    } catch (err) {
      logger.error(`[Scheduler] Weekly disposable domains sync failed: ${err.message}`);
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — restrict to known frontend origins in production
// Clean up trailing slashes from env variables just in case
const cleanFrontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, "") : null;
const cleanCorsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.replace(/\/$/, "") : null;

const ALLOWED_ORIGINS = [
  "http://localhost:5174",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://leader-backend-oty3.vercel.app", // Explicitly allow current production frontend
  "https://doott.jaqyi.com",               // Production frontend domain
  cleanFrontendUrl,
  cleanCorsOrigin,
].filter(Boolean);

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin requests (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Clean the incoming origin just in case
      const incomingOrigin = origin.replace(/\/$/, "");
      if (ALLOWED_ORIGINS.includes(incomingOrigin)) return callback(null, true);
      // In development allow all
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      
      console.error(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(passport.initialize());

validateCredentials();

// ============================================================
// GLOBAL AUTH GUARD
// ============================================================
// Every API route requires a valid JWT **except** the paths below.
// To add a new public endpoint, append its prefix to PUBLIC_PATH_PREFIXES.
//
// Public paths:
//   /api/auth/*                   — login, register, Google/GitHub OAuth callbacks
// ============================================================
const PUBLIC_PATH_PREFIXES = [
  "/api/auth",                  // all auth & OAuth routes
  "/api/track",                 // page-view tracker (no auth needed)
  "/api/features",              // active feature flags map (publicly readable)
  "/api-docs",                  // public API documentation page (no auth needed)
  "/api-docs.html",             // public API documentation HTML (no auth needed)
  "/sitemap.xml",               // SEO sitemap (publicly crawlable)
  "/robots.txt",                // SEO robots directives (publicly crawlable)
  "/google633297afc8503e41.html", // Google Search Console ownership verification
  "/doott-og.jpg",              // OG social share image (1200x630)
  "/api/payments",              // Razorpay payment endpoints (pre-auth)
  "/api/health",                // uptime / readiness probe (no sensitive data)
];

app.use((req, res, next) => {
  // Root — always public (health / uptime check)
  if (req.path === "/") return next();

  // Check whitelist
  const isPublic = PUBLIC_PATH_PREFIXES.some(
    (p) => req.path === p || req.path.startsWith(p + "/")
  );
  if (isPublic) return next();

  // Everything else — require valid JWT
  return auth(req, res, next);
});

// Strip server-owned fields (orgId, _id, …) and Mongo operators from every authenticated body.
app.use(sanitizeBody);

// ------------------------------------------------------------
// PUBLIC DOCS PAGE — /api-docs (no auth, no React Router)
// ------------------------------------------------------------
app.get(["/api-docs", "/api-docs.html"], (req, res) => {
  const possiblePaths = [
    path.join(__dirname, "public", "api-docs.html"),
    path.join(process.cwd(), "src", "public", "api-docs.html"),
    path.join(process.cwd(), "api-docs.html"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }
  res.status(404).send("API Documentation page not found");
});

// ------------------------------------------------------------
// SEO FILES — sitemap.xml, robots.txt, GSC verification
// These must be served from the backend because Vercel routes
// all traffic through this function (/(.*) -> /api/index.js).
// The frontend/public copies are used by local Vite dev server.
// ------------------------------------------------------------
app.get("/robots.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(
`# Doott — B2B Contact Database & Lead Generation Platform
# robots.txt

User-agent: *

# Allow public marketing pages
Allow: /$
Allow: /pricing
Allow: /login
Allow: /register
Allow: /api-docs

# Disallow app (authenticated) routes — no crawling needed
Disallow: /app/
Disallow: /auth/
Disallow: /verify-email
Disallow: /forgot-password
Disallow: /reset-password

# Sitemaps
Sitemap: https://doott.jaqyi.com/sitemap.xml
`
  );
});

app.get("/sitemap.xml", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/xml");
  res.send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
          http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

  <!-- Landing page — highest priority, updated daily -->
  <url>
    <loc>https://doott.jaqyi.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Pricing -->
  <url>
    <loc>https://doott.jaqyi.com/pricing</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- API Docs -->
  <url>
    <loc>https://doott.jaqyi.com/api-docs</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>

</urlset>
`
  );
});

// Google Search Console ownership verification
app.get("/google633297afc8503e41.html", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send("google-site-verification: google633297afc8503e41.html");
});

// OG social share image (1200x630) — must be served from backend on Vercel
app.get("/doott-og.jpg", (req, res) => {
  const possiblePaths = [
    path.join(__dirname, "..", "frontend", "public", "doott-og.jpg"),
    path.join(process.cwd(), "frontend", "public", "doott-og.jpg"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      res.setHeader("Cache-Control", "public, max-age=604800"); // 1 week
      return res.sendFile(p);
    }
  }
  res.status(404).send("OG image not found");
});

// ------------------------------------------------------------
// AUTH & ORG ROUTES (public — no auth required)
// ------------------------------------------------------------
app.use("/api/auth", authRouter);
app.use("/api/org", auth, orgRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/track",     require("./routes/tracker"));
app.use("/api", require("./routes/featureFlags"));
app.use("/api/payments", require("./routes/payments"));



// ------------------------------------------------------------
// API ROUTES
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    name: "Leader API",
    status: "online",
    version: "1.0.0"
  });
});

// Readiness probe — reports only up/down per dependency, never connection details.
app.get("/api/health", generalLimiter, async (req, res) => {
  const withTimeout = (p, ms = 2000) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const checks = {};
  try {
    // On a cold start the connection is still opening; give it a few seconds before calling it down.
    const conn = require("mongoose").connection;
    for (let i = 0; i < 20 && conn.readyState !== 1; i++) await new Promise((r) => setTimeout(r, 200));
    checks.mongo = conn.readyState === 1 ? "up" : "down";
  } catch { checks.mongo = "down"; }
  try {
    await withTimeout(require("./db/cloudSql").query("SELECT 1"));
    checks.postgres = "up";
  } catch { checks.postgres = "down"; }
  const ok = Object.values(checks).every((v) => v === "up");
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks });
});

// ============================================================
// DATA API — companies, people, emails, numbers
// ============================================================
const finalPeopleRouter        = require("./routes/finalPeopleDatabase");
const finalPeopleEmailRouter   = require("./routes/finalPeopleEmail");
const finalPeopleNumberRouter  = require("./routes/finalPeopleNumber");
const finalCompaniesRouter     = require("./routes/finalCompaniesDatabase");
const emailVerificationRouter  = require("./routes/emailVerification");
app.use("/api/final-people",         dataLimiter, requirePaidAccess, finalPeopleRouter);
app.use("/api/final-people-email",   dataLimiter, requirePaidAccess, finalPeopleEmailRouter);
app.use("/api/final-people-number",  dataLimiter, requirePaidAccess, finalPeopleNumberRouter);
app.use("/api/final-companies",      dataLimiter, requirePaidAccess, finalCompaniesRouter);
app.use("/api/verify-email",         emailVerificationRouter);



// Export for Vercel / serverless environments
// Central error handler — JSON responses, no stack traces or internals.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });
  if (err && err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  if (err && typeof err.message === "string" && err.message.startsWith("CORS:")) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  logger.error(`[Unhandled] ${req.method} ${req.path}: ${err && err.message}`);
  res.status(err && err.status >= 400 && err.status < 500 ? err.status : 500).json({ error: "Internal server error" });
});

module.exports = app;

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`\n🚀 Leader API Server running on port ${PORT}`);
    logger.info(`Dashboard API ready at http://0.0.0.0:${PORT}`);
  });
  
  server.timeout = 600000;
}
