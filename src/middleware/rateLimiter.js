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
function createRateLimiter(maxRequests = 60, windowSeconds = 60) {
  return async (req, res, next) => {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    const identifier = `${ip}:${req.path}`;
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

module.exports = { createRateLimiter, pipelineLimiter, placesLimiter, generalLimiter };
