"use strict";

const { VERIFICATION_STATES, SMTP_RESULTS, FREEMAIL_DOMAINS } = require("./constants");
const { isSecurityGateway } = require("./smtpVerifier");

/**
 * Calculates the composite verification verdict and score from all stage signals.
 * 
 * Strict Deliverability Rules:
 *   - DELIVERABLE (Score 0.90 - 0.99): Verified non-catch-all domain, SMTP 250 accepted, non-disposable, valid MX.
 *   - RISKY (Score 0.30 - 0.65): Catch-all domains, Security Gateways (Microsoft EOP/Mimecast DHA), Disposable, Role addresses.
 *   - UNDELIVERABLE (Score 0.0): Syntax error, no MX, domain offline, or SMTP 5xx permanent rejection.
 *   - UNKNOWN (Score 0.45 - 0.50): Port 25 connection timeout, 4xx tempfail, greylisted.
 * 
 * @param {Object} signals
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

  const isFreemail = FREEMAIL_DOMAINS.has(domain?.toLowerCase()?.trim());
  const isGateway  = isSecurityGateway(primaryMx);

  // ── Stage 1: Syntax Failure ────────────────────────────────────────────────
  if (!syntaxValid) {
    state = VERIFICATION_STATES.UNDELIVERABLE;
    score = 0.0;
    reason = syntaxReason || "Invalid email syntax";
  }
  // ── Stage 2 & 3: Domain or MX Record Failure ──────────────────────────────
  else if (!domainValid || !mxValid) {
    state = VERIFICATION_STATES.UNDELIVERABLE;
    score = 0.0;
    reason = !domainValid ? (domainReason || "Domain does not exist") : (mxReason || "No valid MX records found for domain");
  }
  // ── Stage 4: Disposable / Temporary Email ──────────────────────────────────
  else if (disposable) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.15;
    reason = "Disposable or temporary email address";
  }
  // ── Stage 7: Conclusive SMTP Rejection (5xx Code) ─────────────────────────
  else if (smtpResult === SMTP_RESULTS.REJECTED) {
    state = VERIFICATION_STATES.UNDELIVERABLE;
    score = 0.0;
    reason = smtpMessage || "Mailbox rejected by destination mail server (5xx user unknown)";
  }
  // ── Stage 6: Catch-All Domain (Accepts any email address) ─────────────────
  else if (catchAll === true) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.50;
    reason = "Domain is a catch-all server; accepts any mailbox prefix (high bounce risk)";
  }
  // ── Security Gateway (Microsoft EOP, Mimecast, Proofpoint, Barracuda) ─────
  else if (isGateway) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.60;
    reason = "Domain uses Directory Harvest Protection (Microsoft 365 / Security Gateway); simulated 250 OK returned";
  }
  // ── Explicit Non-Catch-All + SMTP Accepted (2xx Code) ──────────────────────
  else if (catchAll === false && smtpResult === SMTP_RESULTS.ACCEPTED) {
    if (roleAddress) {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.85;
      reason = "Verified deliverable role/department address";
    } else {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.98;
      reason = "Mailbox exists and is confirmed deliverable via SMTP Port 25";
    }
  }
  // ── Major Freemail Domain (Gmail, Outlook, Yahoo) ──────────────────────────
  else if (isFreemail && (smtpResult === SMTP_RESULTS.ACCEPTED || smtpResult === SMTP_RESULTS.UNKNOWN || smtpGated)) {
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
  // ── SMTP Probe Accepted (Without Catch-All Confirmation) ───────────────────
  else if (smtpResult === SMTP_RESULTS.ACCEPTED) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.65;
    reason = "SMTP accepted RCPT TO command, but catch-all status could not be verified";
  }
  // ── Inconclusive / Gated / Timeout SMTP Probing ───────────────────────────
  else if (smtpResult === SMTP_RESULTS.UNKNOWN || smtpGated) {
    state = VERIFICATION_STATES.UNKNOWN;
    score = 0.45;
    reason = roleAddress
      ? "Role address on business domain; SMTP probe inconclusive or timed out"
      : "Valid business domain with MX, but SMTP probing was inconclusive or timed out";
  }
  // ── Fallback ───────────────────────────────────────────────────────────────
  else {
    state = VERIFICATION_STATES.UNKNOWN;
    score = 0.40;
    reason = "Verification inconclusive";
  }

  // Ensure score is bounded strictly [0.0, 1.0] and rounded to 3 decimals
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
      is_freemail: isFreemail,
      is_security_gateway: isGateway
    },
    checked_at: new Date().toISOString()
  };
}

module.exports = {
  computeVerdict
};
