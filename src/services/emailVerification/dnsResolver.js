"use strict";

const dns = require("dns").promises;
const { cacheGet, cacheSet } = require("../../db/redis");
const { query } = require("../../db/cloudSql");

const DNS_A_CACHE_TTL = 3600;         // 1 hour
const DNS_MX_CACHE_TTL = 86400;       // 24 hours
const DNS_LOOKUP_TIMEOUT = 4000;      // 4s timeout

/**
 * Wraps a promise with a timeout.
 */
function withTimeout(promise, ms, operationName = "DNS operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        const err = new Error(`${operationName} timed out after ${ms}ms`);
        err.code = "ETIMEOUT";
        reject(err);
      }, ms);
      // unref timer so process doesn't hang
      if (timer.unref) timer.unref();
    })
  ]);
}

/**
 * Stage 2: Domain Existence (A / AAAA records)
 */
async function resolveDomainExistence(domain) {
  if (!domain) return { valid: false, ips: [], reason: "Empty domain" };
  const cleanDomain = domain.toLowerCase().trim();

  // 1. Check Redis Cache
  const cacheKey = `domain:dns:${cleanDomain}`;
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return { ...cached, _cached: true };
    }
  } catch (_) {}

  // 2. Perform DNS A / AAAA Lookup
  const ips = [];
  let domainValid = false;
  let reason = "";

  try {
    const [aRecords, aaaaRecords] = await Promise.allSettled([
      withTimeout(dns.resolve4(cleanDomain), DNS_LOOKUP_TIMEOUT, `DNS A lookup for ${cleanDomain}`),
      withTimeout(dns.resolve6(cleanDomain), DNS_LOOKUP_TIMEOUT, `DNS AAAA lookup for ${cleanDomain}`)
    ]);

    if (aRecords.status === "fulfilled" && Array.isArray(aRecords.value)) {
      ips.push(...aRecords.value);
    }
    if (aaaaRecords.status === "fulfilled" && Array.isArray(aaaaRecords.value)) {
      ips.push(...aaaaRecords.value);
    }

    if (ips.length > 0) {
      domainValid = true;
      reason = `Domain exists with ${ips.length} IP record(s)`;
    } else {
      // Try generic lookup as fallback
      try {
        const lookup = await withTimeout(dns.lookup(cleanDomain), DNS_LOOKUP_TIMEOUT, `DNS lookup for ${cleanDomain}`);
        if (lookup && lookup.address) {
          ips.push(lookup.address);
          domainValid = true;
          reason = `Domain exists (${lookup.address})`;
        } else {
          domainValid = false;
          reason = "Domain has no active A or AAAA records";
        }
      } catch (err) {
        domainValid = false;
        reason = err.code === "ENOTFOUND" || err.code === "ENODATA" ? "Domain does not exist" : `DNS lookup failed (${err.message})`;
      }
    }
  } catch (err) {
    domainValid = false;
    reason = err.code === "ENOTFOUND" ? "Domain does not exist" : `DNS error (${err.message})`;
  }

  const result = {
    valid: domainValid,
    ips,
    reason,
    domain: cleanDomain
  };

  // Cache in Redis
  try {
    await cacheSet(cacheKey, result, DNS_A_CACHE_TTL);
  } catch (_) {}

  return result;
}

/**
 * Stage 3: MX Record Lookup (sorted by priority + RFC 5321 A-record fallback)
 */
async function resolveMxRecords(domain) {
  if (!domain) return { valid: false, mxRecords: [], primaryMx: null, reason: "Empty domain" };
  const cleanDomain = domain.toLowerCase().trim();

  // 1. Check Redis Cache
  const cacheKey = `domain:mx:${cleanDomain}`;
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return { ...cached, _cached: true };
    }
  } catch (_) {}

  // 2. Check Postgres domain_cache
  try {
    const pgRes = await query(
      "SELECT mx_records, has_mx, is_catch_all, is_disposable FROM final.domain_cache WHERE domain = $1 AND expires_at > NOW()",
      [cleanDomain]
    );
    if (pgRes.rows.length > 0 && pgRes.rows[0].has_mx) {
      const row = pgRes.rows[0];
      const records = row.mx_records || [];
      const cachedResult = {
        valid: row.has_mx,
        mxRecords: records,
        primaryMx: records[0]?.exchange || null,
        isFallbackA: false,
        reason: "Valid MX records found in domain cache",
        domain: cleanDomain
      };
      await cacheSet(cacheKey, cachedResult, DNS_MX_CACHE_TTL);
      return cachedResult;
    }
  } catch (_) {}

  // 3. Perform DNS MX Query
  let mxRecords = [];
  let primaryMx = null;
  let hasMx = false;
  let isFallbackA = false;
  let reason = "";

  try {
    const rawMx = await withTimeout(
      dns.resolveMx(cleanDomain),
      DNS_LOOKUP_TIMEOUT,
      `MX lookup for ${cleanDomain}`
    );

    if (Array.isArray(rawMx) && rawMx.length > 0) {
      // Sort by priority ascending (lowest priority number = most preferred host)
      mxRecords = rawMx.sort((a, b) => a.priority - b.priority);
      primaryMx = mxRecords[0].exchange;
      hasMx = true;
      reason = `Found ${mxRecords.length} MX record(s); primary: ${primaryMx}`;
    }
  } catch (err) {
    // If no MX records exist (ENODATA or ENOTFOUND), check RFC 5321 Section 5.1 A-record fallback
    if (err.code === "ENODATA" || err.code === "ENOTFOUND") {
      const domainInfo = await resolveDomainExistence(cleanDomain);
      if (domainInfo.valid && domainInfo.ips.length > 0) {
        hasMx = true;
        isFallbackA = true;
        primaryMx = cleanDomain;
        mxRecords = [{ exchange: cleanDomain, priority: 0 }];
        reason = `RFC 5321 fallback: No MX record, domain A-record used as mail destination (${cleanDomain})`;
      } else {
        hasMx = false;
        reason = "Domain does not have MX records or valid A fallback";
      }
    } else {
      hasMx = false;
      reason = `MX query error: ${err.message}`;
    }
  }

  const result = {
    valid: hasMx,
    mxRecords,
    primaryMx,
    isFallbackA,
    reason,
    domain: cleanDomain
  };

  // Cache in Redis
  try {
    await cacheSet(cacheKey, result, DNS_MX_CACHE_TTL);
  } catch (_) {}

  // Persist / upsert in Postgres final.domain_cache
  try {
    await query(
      `INSERT INTO final.domain_cache (domain, mx_records, has_mx, cached_at, expires_at)
       VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '7 days')
       ON CONFLICT (domain) DO UPDATE
       SET mx_records = EXCLUDED.mx_records,
           has_mx = EXCLUDED.has_mx,
           cached_at = NOW(),
           expires_at = NOW() + INTERVAL '7 days'`,
      [cleanDomain, JSON.stringify(mxRecords), hasMx]
    );
  } catch (_) {}

  return result;
}

module.exports = {
  resolveDomainExistence,
  resolveMxRecords
};
