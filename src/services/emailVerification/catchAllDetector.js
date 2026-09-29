"use strict";

const crypto = require("crypto");
const { cacheGet, cacheSet } = require("../../db/redis");
const { query } = require("../../db/cloudSql");
const { probeSmtpMailbox, isSmtpProbingEnabled, isSecurityGateway } = require("./smtpVerifier");

const CATCH_ALL_CACHE_TTL = 7 * 24 * 3600; // 7 days

/**
 * Stage 6: Dual-Probe Catch-All Domain Detection
 * Probes the MX host with TWO randomly generated non-existent mailboxes.
 * 
 * Logic:
 *   - If MX belongs to a known Security Gateway (Microsoft EOP / Mimecast / Proofpoint) -> Catch-All / DHA Shielded.
 *   - Send Probe 1 (`probe_a_<hash>@domain`). If 5xx -> isCatchAll = false.
 *   - If Probe 1 is 250 OK, send Probe 2 (`probe_b_<hash>@domain`).
 *   - If Probe 2 ALSO returns 250 OK -> isCatchAll = true (100% confirmed catch-all).
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

  // 3. Security Gateway Check (Microsoft 365, Mimecast, Proofpoint, Barracuda)
  if (isSecurityGateway(primaryMx)) {
    const gatewayVerdict = {
      isCatchAll: true,
      reason: "Domain uses Enterprise Security Gateway (Microsoft EOP / Mimecast / Proofpoint) with Directory Harvest Protection",
      probeCode: 250
    };
    try {
      await cacheSet(cacheKey, gatewayVerdict, CATCH_ALL_CACHE_TTL);
    } catch (_) {}
    return gatewayVerdict;
  }

  // If SMTP probing is disabled or no MX host is available
  if (!isSmtpProbingEnabled() || !primaryMx) {
    return {
      isCatchAll: null,
      reason: !primaryMx ? "No MX host available for probe" : "Catch-all probing skipped (SMTP probes disabled via config)",
      probeCode: null
    };
  }

  // 4. Dual-probe random address generation
  const hash1 = crypto.randomBytes(6).toString("hex");
  const hash2 = crypto.randomBytes(6).toString("hex");
  const probeEmail1 = `probe_a_${hash1}@${cleanDomain}`;
  const probeEmail2 = `probe_b_${hash2}@${cleanDomain}`;

  try {
    // Probe 1
    const res1 = await probeSmtpMailbox(primaryMx, probeEmail1, 5000);

    if (res1.result === "rejected") {
      // 5xx rejection means server rejects non-existent mailboxes (Explicit only)
      const verdict = { isCatchAll: false, reason: "Domain rejected Probe 1 (Non-catch-all server)", probeCode: res1.code };
      await cacheSet(cacheKey, verdict, CATCH_ALL_CACHE_TTL);
      return verdict;
    }

    if (res1.result !== "accepted") {
      // 4xx or timeout
      return { isCatchAll: null, reason: `Probe 1 inconclusive: ${res1.message}`, probeCode: res1.code };
    }

    // Probe 1 returned 250 OK → Confirm with Probe 2 to rule out transient 250
    const res2 = await probeSmtpMailbox(primaryMx, probeEmail2, 5000);

    let isCatchAll = null;
    let reason = "";

    if (res2.result === "accepted") {
      isCatchAll = true;
      reason = "Domain accepted dual non-existent probes (Confirmed Catch-All server)";
    } else if (res2.result === "rejected") {
      isCatchAll = false;
      reason = "Probe 2 rejected after Probe 1 accepted (Inconsistent server response)";
    } else {
      isCatchAll = true; // Fallback to catch-all on probe 1 accept
      reason = "Probe 1 accepted random email; Probe 2 inconclusive (Catch-all assumed)";
    }

    const verdict = { isCatchAll, reason, probeCode: res2.code || res1.code };

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
