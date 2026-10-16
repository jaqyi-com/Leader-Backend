"use strict";

const { validateSyntax } = require("./syntaxValidator");
const { resolveDomainExistence, resolveMxRecords } = require("./dnsResolver");
const { isDisposableDomain } = require("./disposableDetector");
const { isRoleAddress } = require("./roleDetector");
const { detectCatchAll, getCachedCatchAll, setCatchAllCache } = require("./catchAllDetector");
const { probeSmtp, probeSmtpMailbox, isSmtpProbingEnabled, isFreemailDomain } = require("./smtpVerifier");
const { computeVerdict } = require("./scoringEngine");
const { cacheGet, cacheSet } = require("../../db/redis");
const { query } = require("../../db/cloudSql");
const { SMTP_RESULTS } = require("./constants");
const { isVpsConfigured, verifyViaVps } = require("./vpsVerifierClient");

const VERIFICATION_CACHE_TTL = 90 * 24 * 3600; // 90 days

/**
 * Checks if a verification record exists in Redis or Postgres within the 90-day TTL window.
 */
async function getCachedVerification(email) {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();
  const cacheKey = `email:verif:${cleanEmail}`;

  // 1. Redis Cache
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return { ...cached, _cached: true, _source: "redis" };
    }
  } catch (_) {}

  // 2. Postgres final.email_verifications
  try {
    const res = await query(
      `SELECT email, domain, state, reason, score, syntax_valid, domain_valid, mx_valid,
              disposable, role_address, catch_all, smtp_result, raw_details, checked_at, next_recheck_at
       FROM final.email_verifications
       WHERE email = $1 AND next_recheck_at > NOW()
       LIMIT 1`,
      [cleanEmail]
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      const result = {
        email: row.email,
        syntax_valid: row.syntax_valid,
        domain_valid: row.domain_valid,
        mx_valid: row.mx_valid,
        disposable: row.disposable,
        role_address: row.role_address,
        catch_all: row.catch_all,
        smtp_result: row.smtp_result,
        state: row.state,
        reason: row.reason,
        score: parseFloat(row.score),
        details: row.raw_details || {},
        checked_at: row.checked_at,
        _cached: true,
        _source: "postgres"
      };

      // Populate Redis
      try {
        await cacheSet(cacheKey, result, VERIFICATION_CACHE_TTL);
      } catch (_) {}

      return result;
    }
  } catch (_) {}

  return null;
}

// ── Bulk PostgreSQL Write Buffer ───────────────────────────────────────────
const dbWriteBuffer = [];
let isFlushingDb = false;

async function flushDbBuffer() {
  if (dbWriteBuffer.length === 0 || isFlushingDb) return;
  isFlushingDb = true;

  try {
    const batch = dbWriteBuffer.splice(0, 100);
    if (batch.length === 0) return;

    const values = [];
    const params = [];
    let pIdx = 1;

    for (const v of batch) {
      const cleanEmail = (v.email || "").toLowerCase().trim();
      if (!cleanEmail) continue;
      const domain = v.details?.domain || cleanEmail.split("@")[1] || "";
      values.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7}, $${pIdx+8}, $${pIdx+9}, $${pIdx+10}, $${pIdx+11}, $${pIdx+12}, NOW(), NOW() + INTERVAL '90 days')`);
      params.push(
        cleanEmail,
        domain,
        v.state,
        v.reason,
        v.score,
        v.syntax_valid,
        v.domain_valid,
        v.mx_valid,
        v.disposable,
        v.role_address,
        v.catch_all,
        v.smtp_result,
        JSON.stringify(v.details || {})
      );
      pIdx += 13;
    }

    if (values.length > 0) {
      const sql = `
        INSERT INTO final.email_verifications (
          email, domain, state, reason, score,
          syntax_valid, domain_valid, mx_valid, disposable,
          role_address, catch_all, smtp_result, raw_details,
          checked_at, next_recheck_at
        ) VALUES ${values.join(", ")}
        ON CONFLICT (email) DO UPDATE SET
          domain = EXCLUDED.domain,
          state = EXCLUDED.state,
          reason = EXCLUDED.reason,
          score = EXCLUDED.score,
          syntax_valid = EXCLUDED.syntax_valid,
          domain_valid = EXCLUDED.domain_valid,
          mx_valid = EXCLUDED.mx_valid,
          disposable = EXCLUDED.disposable,
          role_address = EXCLUDED.role_address,
          catch_all = EXCLUDED.catch_all,
          smtp_result = EXCLUDED.smtp_result,
          raw_details = EXCLUDED.raw_details,
          checked_at = NOW(),
          next_recheck_at = NOW() + INTERVAL '90 days'
      `;

      await query(sql, params);
    }
  } catch (err) {
    console.warn(`[Pipeline] Warning flushing batch verifications to DB: ${err.message}`);
  } finally {
    isFlushingDb = false;
    if (dbWriteBuffer.length > 0) {
      const t = setTimeout(flushDbBuffer, 50);
      if (t && t.unref) t.unref();
    }
  }
}

// Auto flush every 500ms
if (typeof setInterval === "function") {
  const flushTimer = setInterval(flushDbBuffer, 500);
  if (flushTimer && flushTimer.unref) flushTimer.unref();
}

/**
 * Persists verification verdict to PostgreSQL (via bulk buffer) and Redis.
 */
async function saveVerificationResult(verdict) {
  if (!verdict || !verdict.email) return;
  const cleanEmail = verdict.email.toLowerCase().trim();
  const cacheKey = `email:verif:${cleanEmail}`;

  // 1. Instant Cache in Redis
  try {
    await cacheSet(cacheKey, verdict, VERIFICATION_CACHE_TTL);
  } catch (_) {}

  // 2. Queue for bulk DB upsert
  dbWriteBuffer.push(verdict);
  if (dbWriteBuffer.length >= 100) {
    flushDbBuffer().catch(() => {});
  }
}

/**
 * Primary Email Verification Pipeline
 * 
 * Runs stages 1-7 in order with smart short-circuiting.
 * 
 * @param {string} rawEmail           The target email address
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh=false] Skip cache lookup
 * @param {boolean} [options.skipSmtp=false]     Explicitly skip SMTP stage
 * @returns {Promise<Object>} Final composite verdict object
 */
async function verifyEmail(rawEmail, options = {}) {
  const { forceRefresh = false, skipSmtp = false } = options;

  if (!rawEmail || typeof rawEmail !== "string") {
    return computeVerdict({
      email: String(rawEmail || ""),
      syntaxValid: false,
      syntaxReason: "Email address is missing or not a string"
    });
  }

  const cleanEmail = rawEmail.trim().toLowerCase();

  // 0. Cache check (unless forceRefresh is true)
  if (!forceRefresh) {
    const cached = await getCachedVerification(cleanEmail);
    if (cached) return cached;
  }

  // ── Stage 1: Syntax Validation & Typo-Correction ─────────────────────────
  const syntax = validateSyntax(cleanEmail);
  if (!syntax.valid) {
    const verdict = computeVerdict({
      email: cleanEmail,
      domain: syntax.domain || "",
      syntaxValid: false,
      syntaxReason: syntax.reason,
      typoSuggestion: syntax.typoSuggestion
    });
    await saveVerificationResult(verdict);
    return verdict;
  }

  const { email, localPart, domain, typoSuggestion } = syntax;

  // ── Primary Engine: Production Doott Cloud VPS Verifier ──────────────────
  // Fast Reacher engine on static datacenter IP with reverse DNS (verify.doott.world)
  // Completely avoids Port 25 residential ISP / Vercel serverless blocking
  if (isVpsConfigured() && !options.skipVps) {
    const vpsVerdict = await verifyViaVps(email, { timeoutMs: options.timeoutMs || 8000 });
    if (vpsVerdict) {
      if (typoSuggestion) {
        vpsVerdict.details.typo_suggestion = typoSuggestion;
      }
      await saveVerificationResult(vpsVerdict);
      return vpsVerdict;
    }
  }

  // ── Stage 2: Domain Existence (A / AAAA) ─────────────────────────────────
  const domainInfo = await resolveDomainExistence(domain);
  if (!domainInfo.valid) {
    const verdict = computeVerdict({
      email,
      domain,
      syntaxValid: true,
      typoSuggestion,
      domainValid: false,
      domainReason: domainInfo.reason,
      mxValid: false
    });
    await saveVerificationResult(verdict);
    return verdict;
  }

  // ── Stage 3: MX Lookup & RFC 5321 Fallback ──────────────────────────────
  const mxInfo = await resolveMxRecords(domain);
  if (!mxInfo.valid) {
    const verdict = computeVerdict({
      email,
      domain,
      syntaxValid: true,
      typoSuggestion,
      domainValid: true,
      mxValid: false,
      mxReason: mxInfo.reason
    });
    await saveVerificationResult(verdict);
    return verdict;
  }

  const primaryMx = mxInfo.primaryMx;

  // ── Stage 4: Disposable Domain Detection ─────────────────────────────────
  const isDisposable = await isDisposableDomain(domain);

  // ── Stage 5: Role-Address Detection ──────────────────────────────────────
  const roleAddress = isRoleAddress(localPart);

  // If disposable, we can short-circuit before SMTP probing
  if (isDisposable) {
    const verdict = computeVerdict({
      email,
      domain,
      syntaxValid: true,
      typoSuggestion,
      domainValid: true,
      mxValid: true,
      primaryMx,
      disposable: true,
      roleAddress,
      catchAll: null,
      smtpResult: SMTP_RESULTS.UNKNOWN
    });
    await saveVerificationResult(verdict);
    return verdict;
  }

  // ── Stage 6 & 7: Unified Single-Session SMTP Probe & Catch-All Resolution ─
  // Probes both random mailbox (if catch-all unproven) and target recipient in ONE TCP session
  let catchAll = null;
  let smtpResult = SMTP_RESULTS.UNKNOWN;
  let smtpCode = null;
  let smtpMessage = "";
  let smtpGated = !isSmtpProbingEnabled();
  let blocked = false;
  let activeMx = primaryMx;

  // 1. Check cached catch-all status for this domain (memory -> Redis -> Postgres)
  const cachedCatchAll = await getCachedCatchAll(domain);
  const knownCatchAll = cachedCatchAll ? cachedCatchAll.isCatchAll : null;

  // 2. Build prioritized MX host list (tries up to 3 MX servers on timeout/failure)
  const mxHosts = (mxInfo.mxRecords && mxInfo.mxRecords.length > 0)
    ? mxInfo.mxRecords.map(r => r.exchange).filter(Boolean)
    : (primaryMx ? [primaryMx] : []);

  if (isSmtpProbingEnabled() && !skipSmtp && mxHosts.length > 0) {
    const probe = await probeSmtp(email, domain, mxHosts, {
      knownCatchAll,
      timeoutMs: options.timeoutMs || 4000,
      socks5: options.socks5
    });

    smtpResult = probe.smtpResult;
    smtpCode = probe.code;
    smtpMessage = probe.message;
    smtpGated = probe.smtpGated;
    catchAll = probe.catchAll;
    activeMx = probe.primaryMx || primaryMx;
    blocked = probe.blocked;

    // Cache newly discovered catch-all state across memory, Redis & DB
    if (knownCatchAll === null && catchAll !== null) {
      setCatchAllCache(domain, catchAll, "Discovered via unified single-session random probe", probe.code).catch(() => {});
    }
  } else {
    catchAll = knownCatchAll;
  }

  // ── Compute Final Composite Verdict ──────────────────────────────────────
  const verdict = computeVerdict({
    email,
    domain,
    localPart,
    syntaxValid: true,
    syntaxReason: syntax.reason,
    typoSuggestion,
    domainValid: true,
    domainReason: domainInfo.reason,
    mxValid: true,
    mxReason: mxInfo.reason,
    primaryMx: activeMx,
    disposable: isDisposable,
    roleAddress,
    catchAll,
    smtpResult,
    smtpCode,
    smtpMessage,
    smtpGated,
    blocked
  });

  await saveVerificationResult(verdict);
  return verdict;
}

module.exports = {
  verifyEmail,
  getCachedVerification,
  saveVerificationResult,
  flushDbBuffer
};
