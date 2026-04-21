// ============================================================
// EMAIL VALIDATOR - Multi-layer email validation
// Syntax → Domain → MX Record → Disposable check
// ============================================================

const dns = require("dns").promises;
const validator = require("validator");
const logger = require("./logger").forAgent("EmailValidator");

// Known disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com",
  "throwaway.email", "yopmail.com", "sharklasers.com",
  "10minutemail.com", "trashmail.com", "maildrop.cc",
]);

// Common personal email domains (we prefer business emails)
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "aol.com", "protonmail.com", "live.com",
]);

class EmailValidator {
  /**
   * Full validation pipeline
   * Returns { valid: bool, confidence: 0-100, reason: string }
   */
  async validate(email) {
    if (!email || typeof email !== "string") {
      return { valid: false, confidence: 0, reason: "Empty or invalid input" };
    }

    const normalized = email.trim().toLowerCase();

    // Step 1: Syntax check
    if (!validator.isEmail(normalized)) {
      return { valid: false, confidence: 0, reason: "Invalid email syntax" };
    }

    const domain = normalized.split("@")[1];

    // Step 2: Disposable check
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return { valid: false, confidence: 0, reason: "Disposable email domain" };
    }

    // Step 3: Personal email (low confidence for B2B)
    if (PERSONAL_DOMAINS.has(domain)) {
      return {
        valid: true,
        confidence: 40,
        reason: "Personal email domain - low B2B confidence",
        isPersonal: true,
      };
    }

    // Step 4: MX record check
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return { valid: false, confidence: 0, reason: "No MX records found" };
      }

      // MX records found = domain can receive email
      return {
        valid: true,
        confidence: 85,
        reason: "Valid business email with MX records",
        mxCount: mxRecords.length,
      };
    } catch (dnsErr) {
      // DNS lookup failed - domain may not exist
      if (dnsErr.code === "ENOTFOUND" || dnsErr.code === "ENODATA") {
        return { valid: false, confidence: 0, reason: "Domain does not exist" };
      }
      // DNS timeout - still might be valid
      logger.warn(`DNS check failed for ${domain}: ${dnsErr.message}`);
      return {
        valid: true,
        confidence: 55,
        reason: "Could not verify MX - DNS timeout",
      };
    }
  }

  /**
   * Validate a batch of emails and return results
   */
  async validateBatch(emails) {
    const results = [];
    for (const email of emails) {
      const result = await this.validate(email);
      results.push({ email, ...result });
    }
    return results;
  }

  /**
   * Guess possible email formats for a contact
   */
  guessEmails(firstName, lastName, domain) {
    const f = firstName.toLowerCase().replace(/[^a-z]/g, "");
    const l = lastName.toLowerCase().replace(/[^a-z]/g, "");
    const fi = f[0] || "";
    const li = l[0] || "";

    return [
      `${f}.${l}@${domain}`,       // john.smith@company.com
      `${f}${l}@${domain}`,        // johnsmith@company.com
      `${fi}${l}@${domain}`,       // jsmith@company.com
      `${f}@${domain}`,            // john@company.com
      `${f}${li}@${domain}`,       // johns@company.com
      `${fi}.${l}@${domain}`,      // j.smith@company.com
      `${l}.${f}@${domain}`,       // smith.john@company.com
    ];
  }
}

module.exports = new EmailValidator();
