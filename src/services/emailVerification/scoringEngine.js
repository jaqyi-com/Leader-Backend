"use strict";

const { VERIFICATION_STATES, SMTP_RESULTS, FREEMAIL_DOMAINS } = require("./constants");

/**
 * Calculates the composite verification verdict and score from all stage signals.
 * 
 * @param {Object} signals
 * @param {string} signals.email
 * @param {string} signals.domain
 * @param {boolean} signals.syntaxValid
 * @param {string} [signals.syntaxReason]
 * @param {string|null} [signals.typoSuggestion]
 * @param {boolean} signals.domainValid
 * @param {string} [signals.domainReason]
 * @param {boolean} signals.mxValid
 * @param {string} [signals.mxReason]
 * @param {string|null} [signals.primaryMx]
 * @param {boolean} signals.disposable
 * @param {boolean} signals.roleAddress
 * @param {boolean|null} signals.catchAll
 * @param {string} signals.smtpResult          "accepted" | "rejected" | "unknown"
 * @param {number|null} [signals.smtpCode]
 * @param {string} [signals.smtpMessage]
 * @param {boolean} [signals.smtpGated]
 * @returns {Object} Composite verdict object
 */
function computeVerdict(signals) {
  const {
    email,
    domain,
    syntaxValid = false,
    syntaxReason = "",
    typoSuggestion = null,
    domainValid = false,
    domainReason = "",
    mxValid = false,
    mxReason = "",
    primaryMx = null,
    disposable = false,
    roleAddress = false,
    catchAll = null,
    smtpResult = SMTP_RESULTS.UNKNOWN,
    smtpCode = null,
    smtpMessage = "",
    smtpGated = false
  } = signals;

  let state = VERIFICATION_STATES.UNKNOWN;
  let score = 0.0;
  let reason = "";

  const isFreemail = FREEMAIL_DOMAINS.has(domain?.toLowerCase());

  // ── Stage 1: Syntax failure ────────────────────────────────────────────────
  if (!syntaxValid) {
    state = VERIFICATION_STATES.UNDELIVERABLE;
    score = 0.0;
    reason = syntaxReason || "Invalid email syntax";
  }
  // ── Stage 2 & 3: Domain or MX failure ──────────────────────────────────────
  else if (!domainValid || !mxValid) {
    state = VERIFICATION_STATES.UNDELIVERABLE;
    score = 0.0;
    reason = !domainValid ? (domainReason || "Domain does not exist") : (mxReason || "No valid MX records found for domain");
  }
  // ── Stage 4: Disposable domain ─────────────────────────────────────────────
  else if (disposable) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.20;
    reason = "Disposable or temporary email address";
  }
  // ── Stage 7: Conclusive SMTP Rejection (5xx) ──────────────────────────────
  else if (smtpResult === SMTP_RESULTS.REJECTED) {
    state = VERIFICATION_STATES.UNDELIVERABLE;
    score = 0.0;
    reason = smtpMessage || "Mailbox rejected by destination mail server (5xx)";
  }
  // ── Stage 6 & 7: Catch-All + SMTP Accepted ─────────────────────────────────
  else if (catchAll === true && smtpResult === SMTP_RESULTS.ACCEPTED) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.60;
    reason = "Domain is a catch-all server; mailbox accepted but cannot be individually confirmed";
  }
  // ── Explicit Non-Catch-All + SMTP Accepted (2xx) ──────────────────────────
  else if (catchAll === false && smtpResult === SMTP_RESULTS.ACCEPTED) {
    if (roleAddress) {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.80;
      reason = "Verified deliverable role/department address";
    } else {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.98;
      reason = "Mailbox exists and is confirmed deliverable via SMTP";
    }
  }
  // ── Major Freemail Domain (Gmail, Outlook, Yahoo) where SMTP is downweighted ─
  else if (isFreemail && (smtpResult === SMTP_RESULTS.UNKNOWN || smtpGated || smtpResult === SMTP_RESULTS.ACCEPTED)) {
    if (roleAddress) {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.75;
      reason = "Valid consumer/freemail domain role address with active MX";
    } else {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.85;
      reason = "Valid freemail domain with active MX records";
    }
  }
  // ── Catch-All is true without SMTP probe ───────────────────────────────────
  else if (catchAll === true) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.55;
    reason = "Catch-all domain; all inbound mail is accepted regardless of mailbox";
  }
  // ── Standard Domain with valid MX, non-disposable, SMTP unknown / gated ────
  else if (smtpResult === SMTP_RESULTS.UNKNOWN || smtpGated) {
    let baseScore = 0.82;
    if (roleAddress) baseScore -= 0.07;
    if (typoSuggestion) baseScore -= 0.15;

    state = VERIFICATION_STATES.DELIVERABLE;
    score = Number(baseScore.toFixed(2));
    reason = roleAddress
      ? "Valid business domain role address with verified MX records"
      : "Valid business domain with verified MX records";
  }
  // ── Fallback ───────────────────────────────────────────────────────────────
  else {
    state = VERIFICATION_STATES.UNKNOWN;
    score = 0.50;
    reason = "Verification inconclusive";
  }

  // Ensure score is bounded strictly [0.0, 1.0] and rounded to 2 decimals
  score = Math.max(0.0, Math.min(1.0, Number(score.toFixed(3))));

  return {
    email,
    syntax_valid: Boolean(syntaxValid),
    domain_valid: Boolean(domainValid),
    mx_valid: Boolean(mxValid),
    disposable: Boolean(disposable),
    role_address: Boolean(roleAddress),
    catch_all: catchAll,
    smtp_result: smtpResult,
    state,
    reason,
    score,
    details: {
      domain,
      primary_mx: primaryMx,
      typo_suggestion: typoSuggestion,
      smtp_code: smtpCode,
      smtp_gated: Boolean(smtpGated),
      is_freemail: isFreemail
    },
    checked_at: new Date().toISOString()
  };
}

module.exports = {
  computeVerdict
};
