"use strict";
// Mass-assignment / NoSQL-operator protection for JSON request bodies.
//
// Many routes pass req.body straight into Mongoose updates (findOneAndUpdate(filter, req.body)).
// Without this, a client could send {"orgId": "<other tenant>"} to move a record into another
// organisation, or {"$set": {...}} to inject update operators.
//
//  • top-level orgId / _id / __v / createdAt / updatedAt are removed (identity & tenancy are server-owned)
//  • any key beginning with "$" or containing "." is removed at every depth
//
// Routes where a body orgId is legitimate (e.g. /api/org/switch) are listed in SKIP_PREFIXES.

const SERVER_OWNED = new Set(["orgId", "_id", "__v", "createdAt", "updatedAt"]);
const SKIP_PREFIXES = ["/api/org", "/api/auth", "/api/payments"];

function clean(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith("$") || k.includes(".")) continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

function sanitizeBody(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object") return next();
  if (SKIP_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + "/"))) return next();

  const cleaned = clean(body);
  if (!Array.isArray(cleaned)) {
    for (const k of SERVER_OWNED) delete cleaned[k];
  }
  req.body = cleaned;
  next();
}

module.exports = { sanitizeBody, clean };
