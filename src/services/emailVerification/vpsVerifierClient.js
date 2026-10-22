"use strict";

const axios = require("axios");
const { VERIFICATION_STATES, SMTP_RESULTS } = require("./constants");

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Verifier servers, in the order they are tried: DOOTT_VERIFIER_URLS (comma-separated, e.g. the
 * less loaded server first), else DOOTT_VERIFIER_URL / VERIFIER_VPS_URL. All share one API key.
 */
function getVpsConfigs() {
  const raw = process.env.DOOTT_VERIFIER_URLS || process.env.DOOTT_VERIFIER_URL || process.env.VERIFIER_VPS_URL || "";
  const apiKey = process.env.DOOTT_API_KEY || process.env.VERIFIER_VPS_API_KEY || "";
  return raw.split(",").map((u) => u.trim().replace(/\/+$/, "")).filter(Boolean).map((baseUrl) => ({
    endpoint: baseUrl.endsWith("/v1/verify") ? baseUrl : `${baseUrl}/v1/verify`,
    apiKey,
  }));
}

function isVpsConfigured() {
  return getVpsConfigs().length > 0;
}

/**
 * Maps raw VPS verifier status and sub_status to LeadGenerator's standard verdict format.
 */
function normalizeVpsResponse(email, vpsData) {
  const statusStr = String(vpsData.status || "").toLowerCase().trim();
  const subStatus = String(vpsData.sub_status || "").toLowerCase().trim();
  const domain = email.split("@")[1]?.toLowerCase()?.trim() || "";
  const isCatchAll = vpsData.is_catch_all !== undefined ? vpsData.is_catch_all : null;
  const mxRecords = Array.isArray(vpsData.mx_records) ? vpsData.mx_records : [];
  const primaryMx = mxRecords[0] || null;

  let state = VERIFICATION_STATES.UNKNOWN;
  let score = 0.45;
  let reason = "";
  let smtpResult = SMTP_RESULTS.UNKNOWN;

  // 1. Deliverable / Valid - STRICT: ONLY when confirmed via conclusive SMTP 250 OK and non-catch-all
  if (statusStr === "valid" || statusStr === "deliverable") {
    if (vpsData.smtp_code === 250 && isCatchAll === false) {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = typeof vpsData.confidence === "number" ? Math.max(0.90, vpsData.confidence / 100) : 0.98;
      reason = "Mailbox exists and is confirmed deliverable via conclusive SMTP 250 OK";
      smtpResult = SMTP_RESULTS.ACCEPTED;
    } else if (isCatchAll === true) {
      state = VERIFICATION_STATES.RISKY;
      score = 0.50;
      reason = "Catch-all domain: destination server accepts all incoming addresses";
      smtpResult = SMTP_RESULTS.ACCEPTED;
    } else {
      state = VERIFICATION_STATES.RISKY;
      score = 0.65;
      reason = "SMTP accepted target recipient, but catch-all status unverified";
      smtpResult = SMTP_RESULTS.ACCEPTED;
    }
  }
  // 2. Undeliverable / Invalid
  else if (statusStr === "invalid" || statusStr === "undeliverable") {
    state = VERIFICATION_STATES.UNDELIVERABLE;
    score = 0.0;
    reason = vpsData.smtp_message
      ? `Mailbox rejected by destination mail server: ${vpsData.smtp_message}`
      : (subStatus === "user_not_found" ? "Mailbox does not exist (User unknown)" : "Email address is invalid/undeliverable");
    smtpResult = SMTP_RESULTS.INVALID;
  }
  // 3. Risky / Catch-All
  else if (statusStr === "risky") {
    state = VERIFICATION_STATES.RISKY;
    score = typeof vpsData.confidence === "number" ? vpsData.confidence / 100 : 0.50;
    if (isCatchAll || subStatus === "catch_all") {
      reason = "Catch-all domain: destination server accepts all incoming addresses";
    } else if (subStatus === "big_provider") {
      reason = "Domain hosted on major provider with strict inbound throttling";
    } else if (subStatus === "mailbox_full") {
      reason = "Mailbox quota exceeded / inbox full";
      smtpResult = SMTP_RESULTS.FULL;
    } else {
      reason = `Risky deliverability signal (${subStatus || "uncertain"})`;
    }
  }
  // 4. Unknown / IP Block / Timeout
  else {
    state = VERIFICATION_STATES.UNKNOWN;
    score = 0.45;
    if (subStatus === "bad_greeting" || /block|spamhaus|blacklist/i.test(vpsData.smtp_message || "")) {
      reason = `Mail server refused probe (IP/sender reputation): ${vpsData.smtp_message || "Policy refusal"}`;
      smtpResult = SMTP_RESULTS.BLOCKED;
    } else {
      reason = vpsData.smtp_message
        ? `SMTP probe inconclusive: ${vpsData.smtp_message}`
        : "Verification inconclusive via VPS verifier";
    }
  }

  score = Math.max(0.0, Math.min(1.0, Number(score.toFixed(3))));

  return {
    email,
    syntax_valid: Boolean(vpsData.syntax_valid !== false),
    domain_valid: Boolean(vpsData.mx_valid !== false),
    mx_valid: Boolean(vpsData.mx_valid !== false),
    disposable: Boolean(vpsData.is_disposable),
    role_address: Boolean(vpsData.is_role),
    catch_all: isCatchAll,
    smtp_result: smtpResult,
    state,
    reason,
    score,
    details: {
      domain,
      primary_mx: primaryMx,
      typo_suggestion: null,
      smtp_code: vpsData.smtp_code || null,
      smtp_gated: false,
      is_catch_all: isCatchAll,
      smtp_result: smtpResult,
      is_freemail: subStatus === "big_provider",
      is_security_gateway: false,
      is_trap: false,
      vps_verified: true,
      job_id: vpsData.job_id || null,
      cached: Boolean(vpsData.cached)
    },
    checked_at: vpsData.verified_at || new Date().toISOString()
  };
}

/**
 * Queries the Doott VPS Email Verifier API for a single email.
 * Returns normalized verdict object, or null if the VPS is unreachable or errors.
 */
async function verifyViaVps(email, options = {}) {
  const configs = getVpsConfigs();
  if (!configs.length) return null;

  // One time budget for the whole call: a server that errors or times out hands the rest of it to
  // the next one, so a busy or down server never makes the caller wait longer than before.
  const deadline = Date.now() + (options.timeoutMs || DEFAULT_TIMEOUT_MS);
  for (const config of configs) {
    const timeout = deadline - Date.now();
    if (timeout < 500) break;
    const headers = { "Content-Type": "application/json" };
    if (config.apiKey) headers["X-API-Key"] = config.apiKey;
    try {
      const response = await axios.post(config.endpoint, { email }, { headers, timeout });
      if (response.data && (response.data.status || response.data.state)) {
        return normalizeVpsResponse(email, response.data);
      }
    } catch (err) {
      // 4xx/5xx or timeout: try the next server
    }
  }
  return null; // no server answered: the caller falls back to the in-process check
}

module.exports = {
  isVpsConfigured,
  verifyViaVps,
  normalizeVpsResponse
};
