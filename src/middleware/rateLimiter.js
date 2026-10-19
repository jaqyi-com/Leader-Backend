// ============================================================
// RATE LIMITER MIDDLEWARE — Redis sliding-window
// Limits expensive endpoints to 60 req/min per IP.
// Falls through silently if Redis is unavailable.
// ============================================================

const { checkRateLimit } = require("../db/redis");

/**
 * Create a rate limiter middleware.
 * @param {number} maxRequests  Max requests allowed per window (default: 60)
 * @param {number} windowSeconds  Window size in seconds (default: 60)
 */
function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

/**
 * @param {number} maxRequests
 * @param {number} windowSeconds
 * @param {{ key?: (req: any) => string }} [opts]  custom bucket key (default: ip + path)
 */
function createRateLimiter(maxRequests = 60, windowSeconds = 60, opts = {}) {
  return async (req, res, next) => {
    const identifier = opts.key ? opts.key(req) : `${clientIp(req)}:${req.path}`;
    const { allowed, count, limit } = await checkRateLimit(identifier, maxRequests, windowSeconds);

    // Set standard rate limit headers
    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - count));
    res.setHeader("X-RateLimit-Window", `${windowSeconds}s`);

    if (!allowed) {
      return res.status(429).json({
        error: "Too many requests. Please wait a moment before trying again.",
        retryAfter: `${windowSeconds}s`,
      });
    }

    next();
  };
}

// Pre-built limiters for different tiers
const pipelineLimiter = createRateLimiter(30, 60);   // 30 req/min for pipeline (expensive)
const placesLimiter   = createRateLimiter(20, 60);   // 20 req/min for Google Places (API cost)
const generalLimiter  = createRateLimiter(120, 60);  // 120 req/min for general endpoints

// ── Limits promised in the public API docs (env overrides are for tests / tuning) ──────────
const envInt = (name, dflt) => parseInt(process.env[name], 10) || dflt;
const FIFTEEN_MIN = 15 * 60;

// Login / register / password reset: 20 per 15 min per IP, one shared bucket for all auth routes.
const authLimiter = createRateLimiter(envInt("RATE_LIMIT_AUTH_MAX", 20), FIFTEEN_MIN, {
  key: (req) => `auth:${clientIp(req)}`,
});

// Per-account login throttle: stops password guessing spread across many IPs.
const loginAccountLimiter = createRateLimiter(envInt("RATE_LIMIT_LOGIN_ACCOUNT_MAX", 10), FIFTEEN_MIN, {
  key: (req) => `login-acct:${String(req.body?.email || "").toLowerCase().trim().slice(0, 200) || clientIp(req)}`,
});

// Data/search endpoints: 300 per 15 min per signed-in user (falls back to IP).
const dataLimiter = createRateLimiter(envInt("RATE_LIMIT_DATA_MAX", 300), FIFTEEN_MIN, {
  key: (req) => `data:${req.user?.userId || clientIp(req)}`,
});

module.exports = {
  createRateLimiter, pipelineLimiter, placesLimiter, generalLimiter,
  authLimiter, loginAccountLimiter, dataLimiter,
};
