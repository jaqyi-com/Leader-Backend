"use strict";

const { ROLE_PREFIXES } = require("./constants");

// Custom runtime extendable set
const dynamicRolePrefixes = new Set(ROLE_PREFIXES.map(p => p.toLowerCase()));

/**
 * Stage 5: Role-Address Detection
 * Determines whether the local-part of an email is a generic departmental/role address.
 * 
 * NOTE: Flagging role_address does NOT invalidate the email. It provides a separate boolean signal.
 * 
 * @param {string} localPart  e.g. "support", "sales.team", "info+campaign"
 * @returns {boolean}
 */
function isRoleAddress(localPart) {
  if (!localPart || typeof localPart !== "string") return false;
  
  // Normalize local part: lowercase, strip plus-addressing
  const clean = localPart.toLowerCase().split("+")[0].trim();
  
  // 1. Direct match (e.g. "admin", "sales", "info")
  if (dynamicRolePrefixes.has(clean)) {
    return true;
  }

  // 2. Tokenized match on separators: ".", "-", "_", "/"
  // e.g. "sales-team", "info.us", "support_desk", "no-reply"
  const tokens = clean.split(/[.\-_/]/);
  for (const token of tokens) {
    if (dynamicRolePrefixes.has(token)) {
      return true;
    }
  }

  // 3. Common composite patterns (e.g. "contactus", "careersteam")
  for (const prefix of dynamicRolePrefixes) {
    if (clean.startsWith(prefix) && clean.length <= prefix.length + 6) {
      return true;
    }
  }

  return false;
}

/**
 * Extend role prefixes at runtime.
 */
function addCustomRolePrefix(prefix) {
  if (!prefix || typeof prefix !== "string") return;
  dynamicRolePrefixes.add(prefix.toLowerCase().trim());
}

/**
 * Get current list of all active role prefixes.
 */
function getActiveRolePrefixes() {
  return Array.from(dynamicRolePrefixes);
}

module.exports = {
  isRoleAddress,
  addCustomRolePrefix,
  getActiveRolePrefixes
};
