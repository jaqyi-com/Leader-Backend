"use strict";

const crypto = require("crypto");
const { cacheGet, cacheSet } = require("../../db/redis");
const { query } = require("../../db/cloudSql");
const { isFreemailDomain, singleSmtpSession, classifyReply, isSmtpProbingEnabled } = require("./smtpVerifier");
const { SMTP_RESULTS } = require("./constants");

const CATCH_ALL_CACHE_TTL = 7 * 24 * 3600; // 7 days
const LOCAL_CATCH_ALL_CACHE = new Map();

/**
 * Checks in-memory, Redis, and Postgres for known catch-all status of a domain.
 */
async function getCachedCatchAll(domain) {
  if (!domain) return null;
  const cleanDomain = domain.toLowerCase().trim();

  // 0. Fast Freemail Check: Freemail providers (Gmail, Outlook, Yahoo) are never catch-all
  if (isFreemailDomain(cleanDomain)) {
    return { isCatchAll: false, reason: "Freemail domain (Non-catch-all)", probeCode: 250 };
  }

  // 1. Fast In-Memory Cache
  if (LOCAL_CATCH_ALL_CACHE.has(cleanDomain)) {
    return LOCAL_CATCH_ALL_CACHE.get(cleanDomain);
  }

  const cacheKey = `domain:catch_all:${cleanDomain}`;

  // 2. Redis domain-level cache
  try {
    const cached = await cacheGet(cacheKey);
    if (cached !== null && cached !== undefined) {
      const res = {
        isCatchAll: typeof cached === "object" ? cached.isCatchAll : cached,
        reason: "Loaded from Redis domain catch-all cache",
        probeCode: typeof cached === "object" ? cached.probeCode : null,
        _cached: true
      };
      LOCAL_CATCH_ALL_CACHE.set(cleanDomain, res);
      return res;
    }
  } catch (_) {}

  // 3. Postgres final.domain_cache
  try {
    const dbRes = await query(
      "SELECT is_catch_all FROM final.domain_cache WHERE domain = $1 AND is_catch_all IS NOT NULL",
      [cleanDomain]
    );
    if (dbRes.rows.length > 0 && dbRes.rows[0].is_catch_all !== null) {
      const isCatchAll = dbRes.rows[0].is_catch_all;
      const res = { isCatchAll, reason: "Loaded from database domain cache", probeCode: null };
      LOCAL_CATCH_ALL_CACHE.set(cleanDomain, res);
      try {
        await cacheSet(cacheKey, res, CATCH_ALL_CACHE_TTL);
      } catch (_) {}
      return res;
    }
  } catch (_) {}

  return null;
}

/**
 * Persists catch-all verdict in memory, Redis, and PostgreSQL.
 */
async function setCatchAllCache(domain, isCatchAll, reason = "", probeCode = null) {
  if (!domain || isCatchAll === null || isCatchAll === undefined) return;
  const cleanDomain = domain.toLowerCase().trim();
  const verdict = { isCatchAll, reason, probeCode };

  LOCAL_CATCH_ALL_CACHE.set(cleanDomain, verdict);

  const cacheKey = `domain:catch_all:${cleanDomain}`;
  try {
    await cacheSet(cacheKey, verdict, CATCH_ALL_CACHE_TTL);
    await query(
      `INSERT INTO final.domain_cache (domain, is_catch_all, cached_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '7 days')
       ON CONFLICT (domain) DO UPDATE SET is_catch_all = EXCLUDED.is_catch_all, cached_at = NOW()`,
      [cleanDomain, isCatchAll]
    );
  } catch (_) {}
}

/**
 * Stage 6: Catch-All Domain Detection.
 * Checks cache first; if miss, probes random mailbox on MX host.
 */
async function detectCatchAll(domain, primaryMx) {
  if (!domain) {
    return { isCatchAll: null, reason: "No domain provided", probeCode: null };
  }

  const cleanDomain = domain.toLowerCase().trim();
  const cached = await getCachedCatchAll(cleanDomain);
  if (cached) return cached;

  if (!isSmtpProbingEnabled() || !primaryMx) {
    return {
      isCatchAll: null,
      reason: !primaryMx ? "No MX host available for probe" : "Catch-all probing skipped (SMTP probes disabled)",
      probeCode: null
    };
  }

  // Fast single probe with random address
  const randomAddr = `${crypto.randomBytes(6).toString("hex")}.${crypto.randomBytes(3).toString("hex")}@${cleanDomain}`;
  try {
    const res = await singleSmtpSession(primaryMx, [randomAddr], { timeoutMs: 3500 });
    if (!res || !res.ok) {
      return {
        isCatchAll: null,
        reason: res?.error || "Catch-all probe connection failed",
        probeCode: null,
        port25Blocked: !res?.ok
      };
    }

    const reply = res.replies[0];
    const rclass = classifyReply(reply?.code || 0, reply?.text || "");

    let isCatchAll = null;
    let reason = "";

    if (rclass === SMTP_RESULTS.ACCEPTED) {
      isCatchAll = true;
      reason = "Domain accepted random non-existent mailbox (Catch-All server)";
    } else if (rclass === SMTP_RESULTS.INVALID || rclass === SMTP_RESULTS.DISABLED) {
      isCatchAll = false;
      reason = "Domain rejected random address (Non-catch-all server)";
    } else {
      isCatchAll = null;
      reason = `Inconclusive catch-all response: ${reply?.text || "Unknown"}`;
    }

    if (isCatchAll !== null) {
      await setCatchAllCache(cleanDomain, isCatchAll, reason, reply?.code);
    }

    return { isCatchAll, reason, probeCode: reply?.code || null };
  } catch (err) {
    return { isCatchAll: null, reason: `Catch-all probe failed: ${err.message}`, probeCode: null };
  }
}

module.exports = {
  detectCatchAll,
  getCachedCatchAll,
  setCatchAllCache,
  LOCAL_CATCH_ALL_CACHE
};
