const jwt = require("jsonwebtoken");
const { User, Organization, Member } = require("../db/mongoose");

const JWT_SECRET = process.env.JWT_SECRET || "changeme-secret";

/**
 * JWT Auth Middleware
 * Inspired by ai-assistant-backend/src/middleware/auth.ts
 *
 * Reads Authorization: Bearer <token>
 * Attaches req.user = { userId, email, orgId, role }
 * Attaches req.org  = Organization document (lean)
 */
async function auth(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.query.token;

    if (!token) {
      return res.status(401).json({ error: "Authentication required. Please log in." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Session expired. Please log in again.", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ error: "Invalid token. Please log in again." });
    }

    const { userId, orgId, role } = decoded;

    // Attach compact user context to request
    req.user = decoded;

    // Optionally fetch full user and org for routes that need it
    // (done lazily — only controllers that need it will call req.getUser())
    req.getUser = async () => User.findById(userId).lean();
    req.getOrg = async () => orgId ? Organization.findById(orgId).lean() : null;

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Same as auth but does NOT block if no token is present.
 * Sets req.user = null for unauthenticated requests.
 */
async function authOptional(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.query.token;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    req.user = null;
  }

  next();
}

/**
 * Role guard middleware — must come after auth().
 * Usage: router.delete('/member', auth, requireRole('admin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}.`,
      });
    }
    next();
  };
}

module.exports = { auth, authOptional, requireRole };
