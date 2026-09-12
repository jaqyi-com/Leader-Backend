"use strict";

const validator = require("validator");
const { COMMON_DOMAINS } = require("./constants");

/**
 * Calculates the Levenshtein distance between two strings.
 */
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = [];
  for (let i = 0; i <= b.length; i++) {
    row[i] = i;
  }

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      let val;
      if (a[i - 1] === b[j - 1]) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Suggests a typo correction for the domain if Levenshtein distance is 1 (or 2 for longer domains).
 */
function suggestDomainCorrection(domain) {
  if (!domain || typeof domain !== "string") return null;
  const cleanDomain = domain.toLowerCase().trim();

  // If already matches a known domain, no suggestion needed
  if (COMMON_DOMAINS.includes(cleanDomain)) {
    return null;
  }

  let bestMatch = null;
  let minDistance = Infinity;

  for (const common of COMMON_DOMAINS) {
    const dist = levenshteinDistance(cleanDomain, common);
    // Allow distance 1 for all domains, distance 2 only for domains >= 7 chars
    const maxAllowedDist = common.length >= 7 ? 2 : 1;
    if (dist > 0 && dist <= maxAllowedDist && dist < minDistance) {
      minDistance = dist;
      bestMatch = common;
    }
  }

  return bestMatch;
}

/**
 * Normalizes email address.
 * - Trims whitespace
 * - Converts domain to lowercase
 * - Strips or detects plus-addressing (tag)
 */
function normalizeEmail(rawEmail) {
  if (!rawEmail || typeof rawEmail !== "string") {
    return { valid: false, email: "", localPart: "", domain: "", cleanEmail: "" };
  }

  const trimmed = rawEmail.trim();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return { valid: false, email: trimmed, localPart: "", domain: "", cleanEmail: trimmed };
  }

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1).toLowerCase();
  const normalized = `${localPart}@${domain}`;

  // Check plus addressing (e.g. user+newsletter@domain.com)
  const baseLocalPart = localPart.includes("+") ? localPart.split("+")[0] : localPart;
  const canonicalEmail = `${baseLocalPart}@${domain}`;

  return {
    valid: true,
    email: normalized,
    originalEmail: rawEmail,
    localPart,
    baseLocalPart,
    domain,
    canonicalEmail
  };
}

/**
 * RFC 5321/5322 compliant syntax validator.
 */
function validateSyntax(rawEmail) {
  if (!rawEmail || typeof rawEmail !== "string") {
    return {
      valid: false,
      reason: "Email is required and must be a string",
      email: "",
      domain: "",
      localPart: "",
      typoSuggestion: null
    };
  }

  const normalized = normalizeEmail(rawEmail);
  if (!normalized.valid) {
    return {
      valid: false,
      reason: "Missing '@' sign or invalid email format",
      email: rawEmail,
      domain: "",
      localPart: "",
      typoSuggestion: null
    };
  }

  const { email, localPart, domain } = normalized;

  // RFC 5321 Length Limits
  // Total email <= 254 octets
  if (email.length > 254) {
    return { valid: false, reason: "Email exceeds maximum length of 254 characters", email, domain, localPart, typoSuggestion: null };
  }
  // Local part <= 64 octets
  if (localPart.length > 64) {
    return { valid: false, reason: "Local-part exceeds maximum length of 64 characters", email, domain, localPart, typoSuggestion: null };
  }
  // Domain part <= 255 octets
  if (domain.length > 255) {
    return { valid: false, reason: "Domain exceeds maximum length of 255 characters", email, domain, localPart, typoSuggestion: null };
  }

  // Check validator.js RFC email parser
  const isRFCValid = validator.isEmail(email, {
    allow_utf8_local_part: false,
    require_tld: true,
    ignore_max_length: false,
    allow_ip_domain: false
  });

  if (!isRFCValid) {
    return {
      valid: false,
      reason: "Email does not conform to RFC 5321/5322 format",
      email,
      domain,
      localPart,
      typoSuggestion: null
    };
  }

  // Additional granular RFC structure rules
  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    return { valid: false, reason: "Local-part cannot start or end with a period", email, domain, localPart, typoSuggestion: null };
  }
  if (localPart.includes("..")) {
    return { valid: false, reason: "Local-part cannot contain consecutive periods", email, domain, localPart, typoSuggestion: null };
  }

  const domainLabels = domain.split(".");
  if (domainLabels.length < 2) {
    return { valid: false, reason: "Domain must contain a valid TLD", email, domain, localPart, typoSuggestion: null };
  }

  for (const label of domainLabels) {
    if (!label || label.length > 63) {
      return { valid: false, reason: "Domain label is empty or exceeds 63 characters", email, domain, localPart, typoSuggestion: null };
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return { valid: false, reason: "Domain label cannot start or end with a hyphen", email, domain, localPart, typoSuggestion: null };
    }
  }

  const tld = domainLabels[domainLabels.length - 1];
  if (tld.length < 2 || !/^[a-z]{2,24}$/i.test(tld)) {
    return { valid: false, reason: "Domain TLD is invalid", email, domain, localPart, typoSuggestion: null };
  }

  // Stage 1 Typo Correction Suggestion
  const suggestedDomain = suggestDomainCorrection(domain);
  const typoSuggestion = suggestedDomain ? `${localPart}@${suggestedDomain}` : null;

  return {
    valid: true,
    reason: typoSuggestion ? `Valid syntax (Suggested correction: ${typoSuggestion})` : "Valid syntax",
    email,
    localPart,
    domain,
    typoSuggestion
  };
}

module.exports = {
  validateSyntax,
  normalizeEmail,
  suggestDomainCorrection,
  levenshteinDistance
};
