// ============================================================
// REDIS CLIENT — Upstash (HTTP-based) + In-Memory Fallback
// Provides seamless high-performance fallback when Upstash is
// unreachable or credentials are missing/expired.
// ============================================================

let redis = null;
let redisHealthy = false;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 60_000; // Recheck Upstash every 60s if down

// ── In-Memory Fallback Engine ─────────────────────────────────
const memoryCache = new Map();      // key -> { value, expiresAt }
const memorySets = new Map();       // key -> Set
const memoryRateLimits = new Map(); // key -> number[] (timestamps)
const MAX_MEMORY_KEYS = 5000;

// Periodic cleanup of expired memory keys every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryCache.entries()) {
    if (v.expiresAt <= now) memoryCache.delete(k);
  }
  for (const [k, timestamps] of memoryRateLimits.entries()) {
    const valid = timestamps.filter(t => now - t < 300_000);
    if (valid.length === 0) memoryRateLimits.delete(k);
    else memoryRateLimits.set(k, valid);
  }
}, 300_000);
if (cleanupTimer.unref) cleanupTimer.unref();

function evictOldestIfFull() {
  if (memoryCache.size >= MAX_MEMORY_KEYS) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
}

try {
  const { Redis } = require("@upstash/redis");

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    // Optimistically assume healthy until first operation
    redisHealthy = true;
    console.log("[Redis] Upstash client configured (with automatic in-memory fallback)");
  } else {
    console.log("[Redis] No Upstash credentials set — running with In-Memory cache & rate limiter");
  }
} catch (err) {
  console.warn(`[Redis] Failed to init Redis client: ${err.message} — using in-memory engine`);
}

function shouldAttemptRedis() {
  if (!redis) return false;
  if (redisHealthy) return true;
  if (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
    lastHealthCheck = Date.now();
    return true;
  }
  return false;
}

function markRedisFailure(err) {
  if (redisHealthy) {
    console.warn(`[Redis] ⚠️ Upstash connection failed (${err.message}). Seamlessly switched to In-Memory fallback.`);
    redisHealthy = false;
    lastHealthCheck = Date.now();
  }
}

function markRedisSuccess() {
  if (!redisHealthy) {
    console.log("[Redis] ✅ Upstash connection restored. Resuming distributed cloud cache.");
    redisHealthy = true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get a cached JSON value.
 */
async function cacheGet(key) {
  if (shouldAttemptRedis()) {
    try {
      const val = await redis.get(key);
      markRedisSuccess();
      if (val !== null && val !== undefined) return val;
    } catch (err) {
      markRedisFailure(err);
    }
  }

  // In-memory fallback
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.value;
}

/**
 * Cache a JSON value with a TTL in seconds.
 */
async function cacheSet(key, value, ttlSeconds = 300) {
  if (shouldAttemptRedis()) {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
      markRedisSuccess();
    } catch (err) {
      markRedisFailure(err);
    }
  }

  // Write to in-memory fallback
  evictOldestIfFull();
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });
}

/**
 * Delete a cache key.
 */
async function cacheDel(key) {
  if (shouldAttemptRedis()) {
    try {
      await redis.del(key);
      markRedisSuccess();
    } catch (err) {
      markRedisFailure(err);
    }
  }
  memoryCache.delete(key);
}

/**
 * Add members to a Set (for deduplication).
 */
async function setAdd(key, ...members) {
  if (!members.length) return;
  if (shouldAttemptRedis()) {
    try {
      await redis.sadd(key, ...members);
      markRedisSuccess();
    } catch (err) {
      markRedisFailure(err);
    }
  }

  let set = memorySets.get(key);
  if (!set) {
    set = new Set();
    memorySets.set(key, set);
  }
  for (const m of members) set.add(m);
}

/**
 * Check if a value exists in a Set.
 */
async function setHas(key, member) {
  if (shouldAttemptRedis()) {
    try {
      const result = await redis.sismember(key, member);
      markRedisSuccess();
      return result === 1;
    } catch (err) {
      markRedisFailure(err);
    }
  }

  const set = memorySets.get(key);
  return set ? set.has(member) : false;
}

/**
 * Sliding-window rate limit check using Redis or In-Memory fallback.
 * Returns { allowed: boolean, count: number, limit: number }
 */
async function checkRateLimit(identifier, maxRequests = 60, windowSeconds = 60) {
  if (shouldAttemptRedis()) {
    try {
      const key = `ratelimit:${identifier}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      markRedisSuccess();
      return { allowed: count <= maxRequests, count, limit: maxRequests };
    } catch (err) {
      markRedisFailure(err);
    }
  }

  // In-memory sliding window rate limiter
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  let timestamps = memoryRateLimits.get(identifier) || [];

  // Filter timestamps within current window
  timestamps = timestamps.filter(t => now - t < windowMs);

  const count = timestamps.length + 1;
  const allowed = count <= maxRequests;

  if (allowed) {
    timestamps.push(now);
    memoryRateLimits.set(identifier, timestamps);
  }

  return { allowed, count, limit: maxRequests };
}

/**
 * Atomically set a key only if it does NOT already exist.
 * Used for distributed mutex (crawl state).
 */
async function setNX(key, value, ttlSeconds = 600) {
  if (shouldAttemptRedis()) {
    try {
      const result = await redis.set(key, value, { nx: true, ex: ttlSeconds });
      markRedisSuccess();
      return result === "OK";
    } catch (err) {
      markRedisFailure(err);
    }
  }

  const item = memoryCache.get(key);
  const now = Date.now();
  if (item && item.expiresAt > now) {
    return false; // key already locked
  }

  evictOldestIfFull();
  memoryCache.set(key, {
    value,
    expiresAt: now + (ttlSeconds * 1000),
  });
  return true;
}

/**
 * Check if a key exists.
 */
async function exists(key) {
  if (shouldAttemptRedis()) {
    try {
      const res = await redis.exists(key);
      markRedisSuccess();
      return res === 1;
    } catch (err) {
      markRedisFailure(err);
    }
  }

  const item = memoryCache.get(key);
  if (!item) return false;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return false;
  }
  return true;
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
