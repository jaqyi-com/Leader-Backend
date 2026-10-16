"use strict";

const { VERIFICATION_STATES, SMTP_RESULTS, FREEMAIL_DOMAINS, TRAP_LOCAL_PARTS } = require("./constants");
const { isSecurityGateway } = require("./smtpVerifier");

/**
 * Calculates the composite verification verdict and score from all stage signals.
 * Aligned with reacher / AfterShip / ETL pipeline scoring.
 * 
 * Strict Deliverability Rules:
 *   - DELIVERABLE (Score 0.85 - 0.98): Verified non-catch-all domain, SMTP 250 accepted, non-disposable, valid MX.
 *   - RISKY (Score 0.15 - 0.65): Catch-all domains, mailbox full, disposable, accepted but unproven catch-all.
 *   - UNDELIVERABLE (Score 0.0): Syntax error, no MX, domain offline, or SMTP invalid/disabled mailbox.
 *   - UNKNOWN (Score 0.45): Port 25 connection timeout, greylisted, server IP reputation block.
 */
function computeVerdict(signals) {
  const {
    email,
    domain,
    localPart = "",
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
    smtpGated = false,
    blocked = false
  } = signals;

  let state = VERIFICATION_STATES.UNKNOWN;
  let score = 0.0;
  let reason = "";

  const cleanLocal = (localPart || email?.split("@")[0] || "").toLowerCase().trim();
  const isTrap = TRAP_LOCAL_PARTS ? TRAP_LOCAL_PARTS.has(cleanLocal.split("+")[0]) : false;
  const isFreemail = FREEMAIL_DOMAINS.has(domain?.toLowerCase()?.trim());
  const isGateway = isSecurityGateway(primaryMx);

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
  // ── Stage 7: Conclusive SMTP Rejection (Invalid or Disabled Mailbox) ────────
  else if (smtpResult === SMTP_RESULTS.INVALID || smtpResult === SMTP_RESULTS.REJECTED || smtpResult === SMTP_RESULTS.DISABLED) {
    state = VERIFICATION_STATES.UNDELIVERABLE;
    score = 0.0;
    reason = (smtpResult === SMTP_RESULTS.DISABLED ? "Mailbox disabled / inactive: " : "Mailbox rejected by destination mail server: ") + (smtpMessage || "5xx user unknown");
  }
  // ── Mailbox Full / Quota Exceeded ──────────────────────────────────────────
  else if (smtpResult === SMTP_RESULTS.FULL) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.30;
    reason = `Mailbox full / quota exceeded: ${smtpMessage || "552/452"}`;
  }
  // ── Stage 6: Catch-All Domain (Accepts any email address) ─────────────────
  else if (catchAll === true) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.50;
    reason = "Catch-all domain: destination server accepts all incoming addresses";
  }
  // ── Explicit Non-Catch-All + SMTP Accepted (2xx Code) ──────────────────────
  else if (catchAll === false && smtpResult === SMTP_RESULTS.ACCEPTED) {
    if (isTrap) {
      state = VERIFICATION_STATES.RISKY;
      score = 0.40;
      reason = "Possible spam-trap / abuse mailbox";
    } else if (roleAddress) {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.85;
      reason = "Verified deliverable role/department address";
    } else {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.98;
      reason = "Mailbox exists and is confirmed deliverable via SMTP Port 25 (random address rejected)";
    }
  }
  // ── Major Freemail Domain (Gmail, Outlook, Yahoo) ──────────────────────────
  // NEVER mark deliverable unless the specific mailbox was conclusively accepted via SMTP!
  else if (isFreemail) {
    if (smtpResult === SMTP_RESULTS.ACCEPTED && catchAll === false) {
      state = VERIFICATION_STATES.DELIVERABLE;
      score = 0.95;
      reason = "Freemail mailbox exists and is confirmed deliverable via SMTP";
    } else {
      state = VERIFICATION_STATES.RISKY;
      score = 0.50;
      reason = "Freemail domain with active MX, but specific mailbox is unverified (bounce risk)";
    }
  }
  // ── SMTP Probe Accepted (Without Catch-All Confirmation) ───────────────────
  else if (smtpResult === SMTP_RESULTS.ACCEPTED) {
    state = VERIFICATION_STATES.RISKY;
    score = 0.65;
    reason = "SMTP accepted target recipient, but catch-all status could not be verified";
  }
  // ── Server Refusal / IP Reputation Block (Never mark invalid!) ─────────────
  else if (smtpResult === SMTP_RESULTS.BLOCKED || blocked) {
    state = VERIFICATION_STATES.UNKNOWN;
    score = 0.45;
    reason = `Mail server refused probe (IP/sender reputation): ${smtpMessage || "Policy refusal"}`;
  }
  // ── Inconclusive / Gated / Timeout SMTP Probing ───────────────────────────
  else {
    state = VERIFICATION_STATES.UNKNOWN;
    score = 0.45;
    reason = smtpMessage
      ? `MX ok, SMTP inconclusive: ${smtpMessage}`
      : "Valid domain and MX, but SMTP verification timed out or was inconclusive";
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
      is_catch_all: catchAll,
      smtp_result: smtpResult,
      is_freemail: isFreemail,
      is_security_gateway: isGateway,
      is_trap: isTrap
    },
    checked_at: new Date().toISOString()
  };
}

module.exports = {
  computeVerdict
};
