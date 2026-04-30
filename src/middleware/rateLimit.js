// ============================================================
// RATE LIMITER — Sliding Window Counter (Upstash Redis)
// ============================================================
// Algorithm: Sliding window counter keyed to:
//   ratelimit:{userId}:{windowMinute}
//
// On each request:
//   1. INCR the counter for the current minute bucket
//   2. SET EXPIRE to 2 minutes (auto-cleanup)
//   3. If count > LIMIT → reject with 429
//
// Why sliding window vs fixed window:
//   Fixed window resets hard at :00 — a burst at :59 + :00 doubles the rate.
//   Sliding window considers the last N seconds, preventing boundary abuse.
// ============================================================

"use strict";

const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Config ─────────────────────────────────────────────────────
const CHAT_LIMIT = 30;       // max LLM calls per window
const WINDOW_SECONDS = 60;   // 1-minute window

/**
 * Sliding window rate limiter middleware factory.
 * @param {number} limit  — requests allowed in the window
 * @param {number} windowSecs — window size in seconds
 */
function createRateLimiter(limit = CHAT_LIMIT, windowSecs = WINDOW_SECONDS) {
  return async function rateLimitMiddleware(req, res, next) {
    if (!process.env.UPSTASH_REDIS_REST_URL) {
      // Redis not configured — skip rate limiting gracefully
      return next();
    }

    try {
      const userId = req.user?.userId || req.ip || "anonymous";
      // Bucket key: changes every `windowSecs` seconds
      const windowKey = Math.floor(Date.now() / (windowSecs * 1000));
      const key = `ratelimit:chat:${userId}:${windowKey}`;

      // Atomically increment and get current count
      const count = await redis.incr(key);

      // Set expiry on first increment (2× window for safety)
      if (count === 1) {
        await redis.expire(key, windowSecs * 2);
      }

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - count));
      res.setHeader("X-RateLimit-Reset", (windowKey + 1) * windowSecs);

      if (count > limit) {
        const retryAfter = windowSecs - (Math.floor(Date.now() / 1000) % windowSecs);
        res.setHeader("Retry-After", retryAfter);
        return res.status(429).json({
          error: "Rate limit exceeded. Too many messages — please wait a moment.",
          retryAfter,
          limit,
          code: "RATE_LIMIT_EXCEEDED",
        });
      }

      next();
    } catch (err) {
      // Redis failure should not block the user
      console.warn("[RateLimit] Redis error, skipping rate limit:", err.message);
      next();
    }
  };
}

// Pre-built middleware for chat endpoint (30 msgs/min)
const chatRateLimit = createRateLimiter(30, 60);

// Pre-built middleware for knowledge ingestion (10 uploads/min)
const ingestRateLimit = createRateLimiter(10, 60);

module.exports = { chatRateLimit, ingestRateLimit, createRateLimiter };
