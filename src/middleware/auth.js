const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { User, Organization, Member, connectDB } = require("../db/mongoose");
const ApiKey = require("../db/models/apiKey");

const { JWT_SECRET, JWT_ALGORITHMS } = require("../config/jwtSecret");

// ── Personal API keys ────────────────────────────────────────────────────────
// Keys look like "doott_<random>". They only work on the data API below, never on account,
// billing, organisation or connector routes, so a leaked key cannot take over the account.
const API_KEY_PREFIX = "doott_";
const API_KEY_PATHS = ["/api/final-people", "/api/final-people-email", "/api/final-people-number", "/api/final-companies", "/api/verify-email"];
const hashApiKey = (key) => crypto.createHash("sha256").update(key).digest("hex");
const CACHE_TTL_MS = 30 * 1000;
const keyCache = new Map();     // keyHash -> { ctx|null, at }
const sessionCache = new Map(); // userId  -> { exists, tv, at }
let lastDbFailure = 0;

/** Mongo usable right now? Tries to (re)connect briefly, without stalling every request when it is down. */
async function dbReady() {
  if (mongoose.connection.readyState === 1) return true;
  if (Date.now() - lastDbFailure < 10 * 1000) return false;
  await Promise.race([Promise.resolve(connectDB()).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  if (mongoose.connection.readyState === 1) return true;
  lastDbFailure = Date.now();
  return false;
}

function clearAuthCache(userId) {
  if (userId) sessionCache.delete(String(userId));
  keyCache.clear();
}

async function apiKeyContext(key) {
  const keyHash = hashApiKey(key);
  const hit = keyCache.get(keyHash);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ctx;
  if (!(await dbReady())) throw Object.assign(new Error("Service temporarily unavailable."), { statusCode: 503 });
  const doc = await ApiKey.findOne({ keyHash, revokedAt: null }).lean();
  let ctx = null;
  if (doc) {
    const user = await User.findById(doc.userId).select("email defaultOrgId").lean();
    if (user) {
      const member = await Member.findOne({ userId: user._id, status: "active" }).sort({ createdAt: 1 }).lean();
      const orgId = user.defaultOrgId || member?.orgId || null;
      ctx = { userId: String(user._id), email: user.email, orgId: orgId ? String(orgId) : null, role: member?.role || "member", via: "api_key", keyId: String(doc._id) };
      ApiKey.updateOne({ _id: doc._id }, { lastUsedAt: new Date() }).catch(() => {});
    }
  }
  keyCache.set(keyHash, { ctx, at: Date.now() });
  return ctx;
}

/**
 * Is this JWT still current? Rejects tokens of deleted accounts and tokens issued before a password
 * change / "sign out everywhere". Fails open when MongoDB is unreachable (signature already checked).
 */
async function sessionValid(decoded) {
  const userId = String(decoded.userId || "");
  if (!mongoose.isValidObjectId(userId)) return true;
  let state = sessionCache.get(userId);
  if (!state || Date.now() - state.at >= CACHE_TTL_MS) {
    if (!(await dbReady())) return true;
    try {
      const u = await User.findById(userId).select("tokenVersion").lean();
      state = { exists: Boolean(u), tv: u?.tokenVersion || 0, at: Date.now() };
      sessionCache.set(userId, state);
    } catch {
      return true;
    }
  }
  return state.exists && (decoded.tv || 0) === state.tv;
}

/**
 * JWT Auth Middleware
 * Inspired by ai-assistant-backend/src/middleware/auth.ts
 *
 * Reads Authorization: Bearer <token>
 * Attaches req.user = { userId, email, orgId, role }
 * Attaches req.org  = Organization document (lean)
 */
async function auth(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    // Tokens are accepted from the Authorization header only — never from the URL,
    // where they would leak into access logs, browser history and Referer headers.
    const token = authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : (typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"].trim() : null);

    if (!token) {
      return res.status(401).json({ error: "Authentication required. Please log in." });
    }

    if (token.startsWith(API_KEY_PREFIX)) {
      const path = (req.originalUrl || req.url || "").split("?")[0];
      if (!API_KEY_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
        return res.status(403).json({ error: "API keys can only be used with the data API (people, companies and email verification).", code: "API_KEY_NOT_ALLOWED" });
      }
      let ctx;
      try { ctx = await apiKeyContext(token); } catch (e) { return res.status(e.statusCode || 500).json({ error: e.message }); }
      if (!ctx) return res.status(401).json({ error: "Invalid or revoked API key.", code: "INVALID_API_KEY" });
      req.user = ctx;
      req.getUser = async () => User.findById(ctx.userId).lean();
      req.getOrg = async () => ctx.orgId ? Organization.findById(ctx.orgId).lean() : null;
      return next();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Session expired. Please log in again.", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ error: "Invalid token. Please log in again." });
    }

    if (!(await sessionValid(decoded))) {
      return res.status(401).json({ error: "You were signed out. Please log in again.", code: "SESSION_REVOKED" });
    }

    const { userId, orgId, role } = decoded;

    // Attach compact user context to request
    req.user = decoded;

    // Optionally fetch full user and org for routes that need it
    // (done lazily — only controllers that need it will call req.getUser())
    req.getUser = async () => User.findById(userId).lean();
    req.getOrg = async () => orgId ? Organization.findById(orgId).lean() : null;

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Same as auth but does NOT block if no token is present.
 * Sets req.user = null for unauthenticated requests.
 */
async function authOptional(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
  } catch {
    req.user = null;
  }

  next();
}

/**
 * Role guard middleware — must come after auth().
 * Usage: router.delete('/member', auth, requireRole('admin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}.`,
      });
    }
    next();
  };
}

/**
 * Tenant guard — must come after auth().
 * Tokens for users without an organisation carry orgId = null; a query filtered on a
 * null/undefined orgId can match unrelated documents, so such users are refused outright.
 */
function requireOrg(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required." });
  if (!req.user.orgId) {
    return res.status(403).json({ error: "An organisation is required to use this feature." });
  }
  next();
}

/**
 * Platform-administrator guard (the application owner, not an organisation admin).
 * Every registered user is "admin" of their own org, so role === "admin" is NOT sufficient
 * for platform-wide operations. Uses ADMIN_EMAIL (comma-separated) like featureFlags/analytics.
 */
function requirePlatformAdmin(req, res, next) {
  const email = (req.user?.email || "").toLowerCase().trim();
  if (!email) return res.status(401).json({ error: "Authentication required." });
  const admins = (process.env.ADMIN_EMAIL || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(email)) {
    return res.status(403).json({ error: "Access denied. Restricted to the application administrator." });
  }
  next();
}

module.exports = { auth, authOptional, requireRole, requireOrg, requirePlatformAdmin, hashApiKey, clearAuthCache, API_KEY_PREFIX };
