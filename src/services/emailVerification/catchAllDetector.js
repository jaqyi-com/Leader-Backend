"use strict";

const crypto = require("crypto");
const { cacheGet, cacheSet } = require("../../db/redis");
const { query } = require("../../db/cloudSql");
const { probeSmtpMailbox, isSmtpProbingEnabled } = require("./smtpVerifier");

const CATCH_ALL_CACHE_TTL = 7 * 24 * 3600; // 7 days

/**
 * Stage 6: Catch-All Domain Detection
 * Probes the MX host with a randomly generated non-existent mailbox.
 * If accepted -> catch_all = true (domain accepts any mailbox).
 * If rejected -> catch_all = false (domain verifies specific mailboxes).
 * 
 * @param {string} domain       Target domain (e.g. "acme.com")
 * @param {string} primaryMx    Primary MX host (e.g. "mail.acme.com")
 * @returns {Promise<{ isCatchAll: boolean|null, reason: string, probeCode: number|null }>}
 */
async function detectCatchAll(domain, primaryMx) {
  if (!domain) {
    return { isCatchAll: null, reason: "No domain provided", probeCode: null };
  }

  const cleanDomain = domain.toLowerCase().trim();
  const cacheKey = `domain:catch_all:${cleanDomain}`;

  // 1. Check Redis domain-level cache
  try {
    const cached = await cacheGet(cacheKey);
    if (cached !== null && cached !== undefined) {
      return {
        isCatchAll: typeof cached === "object" ? cached.isCatchAll : cached,
        reason: "Loaded from domain catch-all cache",
        probeCode: typeof cached === "object" ? cached.probeCode : null,
        _cached: true
      };
    }
  } catch (_) {}

  // 2. Check Postgres final.domain_cache
  try {
    const dbRes = await query(
      "SELECT is_catch_all FROM final.domain_cache WHERE domain = $1 AND is_catch_all IS NOT NULL",
      [cleanDomain]
    );
    if (dbRes.rows.length > 0 && dbRes.rows[0].is_catch_all !== null) {
      const isCatchAll = dbRes.rows[0].is_catch_all;
      const result = { isCatchAll, reason: "Loaded from database domain cache", probeCode: null };
      await cacheSet(cacheKey, result, CATCH_ALL_CACHE_TTL);
      return result;
    }
  } catch (_) {}

  // If SMTP probing is disabled or no MX host is available
  if (!isSmtpProbingEnabled() || !primaryMx) {
    return {
      isCatchAll: null,
      reason: !primaryMx ? "No MX host available for probe" : "Catch-all probing skipped (SMTP probes disabled via config)",
      probeCode: null
    };
  }

  // 3. Generate randomized, non-existent mailbox probe address
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const randomProbeEmail = `probe_${randomSuffix}@${cleanDomain}`;

  try {
    const probeResult = await probeSmtpMailbox(primaryMx, randomProbeEmail, 5000);

    let isCatchAll = null;
    let reason = "";

    if (probeResult.result === "accepted") {
      // If a non-existent random string is accepted, the domain is a catch-all server
      isCatchAll = true;
      reason = "Domain accepted random non-existent mailbox (Catch-All enabled)";
    } else if (probeResult.result === "rejected") {
      // 5xx rejection means server rejects non-existent mailboxes
      isCatchAll = false;
      reason = "Domain rejected random non-existent mailbox (Explicit mailboxes only)";
    } else {
      // 4xx or timeout
      isCatchAll = null;
      reason = `Catch-all probe inconclusive: ${probeResult.message}`;
    }

    const verdict = {
      isCatchAll,
      reason,
      probeCode: probeResult.code
    };

    // Cache in Redis if conclusive
    if (isCatchAll !== null) {
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

    return verdict;
  } catch (err) {
    return {
      isCatchAll: null,
      reason: `Catch-all check failed: ${err.message}`,
      probeCode: null
    };
  }
}

module.exports = {
  detectCatchAll
};
