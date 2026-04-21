// ============================================================
// REDIS CLIENT — Upstash (HTTP-based, works in Vercel serverless)
// Falls back silently if credentials are not set.
// ============================================================

let redis = null;

try {
  const { Redis } = require("@upstash/redis");

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log("[Redis] ✅ Upstash Redis client initialized");
  } else {
    console.log("[Redis] ⚠️  No Redis credentials set — running without Redis cache");
  }
} catch (err) {
  console.warn(`[Redis] ⚠️  Failed to init Redis: ${err.message}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get a cached JSON value. Returns null if not cached or Redis is unavailable.
 */
async function cacheGet(key) {
  if (!redis) return null;
  try {
    return await redis.get(key); // Upstash auto-parses JSON
  } catch { return null; }
}

/**
 * Cache a JSON value with a TTL in seconds.
 */
async function cacheSet(key, value, ttlSeconds = 300) {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch { /* silent */ }
}

/**
 * Delete a cache key.
 */
async function cacheDel(key) {
  if (!redis) return;
  try { await redis.del(key); } catch { /* silent */ }
}

/**
 * Add members to a Redis Set (for deduplication).
 * @param {string} key  Redis SET key
 * @param {...string} members  Values to add
 */
async function setAdd(key, ...members) {
  if (!redis || !members.length) return;
  try { await redis.sadd(key, ...members); } catch { /* silent */ }
}

/**
 * Check if a value exists in a Redis Set.
 * Returns true/false, or null if Redis unavailable.
 */
async function setHas(key, member) {
  if (!redis) return null;
  try {
    const result = await redis.sismember(key, member);
    return result === 1;
  } catch { return null; }
}

/**
 * Sliding-window rate limit check using Redis INCR + EXPIRE.
 * Returns { allowed: boolean, count: number, limit: number }
 */
async function checkRateLimit(identifier, maxRequests = 60, windowSeconds = 60) {
  if (!redis) return { allowed: true, count: 0, limit: maxRequests };
  try {
    const key = `ratelimit:${identifier}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds); // set TTL on first request
    }
    return { allowed: count <= maxRequests, count, limit: maxRequests };
  } catch {
    return { allowed: true, count: 0, limit: maxRequests };
  }
}

/**
 * Atomically set a key only if it does NOT already exist.
 * Used for distributed mutex (crawl state).
 * Returns true if key was set (lock acquired), false if already existed.
 */
async function setNX(key, value, ttlSeconds = 600) {
  if (!redis) return true; // no Redis = always allow
  try {
    const result = await redis.set(key, value, { nx: true, ex: ttlSeconds });
    return result === "OK";
  } catch { return true; }
}

/**
 * Check if a key exists.
 */
async function exists(key) {
  if (!redis) return false;
  try {
    return (await redis.exists(key)) === 1;
  } catch { return false; }
}

module.exports = {
  redis,
  cacheGet,
  cacheSet,
  cacheDel,
  setAdd,
  setHas,
  checkRateLimit,
  setNX,
  exists,
};
