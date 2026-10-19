"use strict";
// Server-side access policy for the data/search APIs.
//
//   DATA_ACCESS_POLICY=open  every signed-in user may search (default — current behaviour)
//   DATA_ACCESS_POLICY=paid  only paying users (plan "lifetime") and platform admins may search;
//                            free accounts get HTTP 402
//
// The frontend FeatureGate only hides menu items; this is the check that actually protects the data.

const { User } = require("../db/mongoose");

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // userId -> { plan, at }

const adminEmails = () =>
  (process.env.ADMIN_EMAIL || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

async function planOf(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.plan;
  const u = await User.findById(userId).select("plan").lean();
  const plan = u ? u.plan : null;
  cache.set(userId, { plan, at: Date.now() });
  return plan;
}

async function requirePaidAccess(req, res, next) {
  if (String(process.env.DATA_ACCESS_POLICY || "open").toLowerCase() !== "paid") return next();
  try {
    const email = String(req.user?.email || "").toLowerCase();
    if (email && adminEmails().includes(email)) return next();
    const plan = req.user?.userId ? await planOf(String(req.user.userId)) : null;
    if (plan === "lifetime") return next();
    return res.status(402).json({
      error: "Your account does not include data access. Please upgrade to continue.",
      code: "UPGRADE_REQUIRED",
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { requirePaidAccess };
