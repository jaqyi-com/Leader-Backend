"use strict";
// Small helpers for tenant-safe request handling.

/** Escape user input before building a RegExp (prevents ReDoS / regex injection). */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Copy only the allowed fields (an array or Set of field names) from an untrusted object.
 * Drops operator keys ($set, $where, …), identity/tenant fields and timestamps so a client
 * can never reassign orgId, _id or overwrite internal state via mass assignment.
 */
const PROTECTED_FIELDS = new Set(["_id", "__v", "id", "orgId", "createdAt", "updatedAt"]);

function pickModelFields(body, allowedFields, { extraProtected = [] } = {}) {
  const allowed = new Set(allowedFields);
  const out = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  const blocked = new Set([...PROTECTED_FIELDS, ...extraProtected]);
  for (const key of Object.keys(body)) {
    if (key.startsWith("$") || key.includes(".")) continue;
    if (blocked.has(key)) continue;
    if (!allowed.has(key)) continue;
    out[key] = body[key];
  }
  return out;
}

/** Parse ?page / ?limit into safe integers. */
function parsePaging(query, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit };
}

module.exports = { escapeRegex, pickModelFields, parsePaging };
