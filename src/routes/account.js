"use strict";
// Personal account settings: profile, password, sessions, API keys, account deletion.
// Mounted at /api/account behind the global JWT guard. API keys are refused here by the auth
// middleware (they only work on the data API), so every call below comes from a signed-in session.

const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const { User, Organization, Member, connectDB } = require("../db/mongoose");
const ApiKey = require("../db/models/apiKey");
const { McpGrant, McpAuthCode } = require("../db/models/mcpOAuth");
const { hashApiKey, clearAuthCache, API_KEY_PREFIX } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const authService = require("../services/authService");

const router = express.Router();
const MAX_KEYS = 10;

router.use(async (req, res, next) => {
  try { await connectDB(); } catch { /* checked below */ }
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
  if (req.user?.via === "api_key") return res.status(403).json({ error: "Account settings need a signed-in session, not an API key." });
  next();
});

const fail = (res, status, error, code) => res.status(status).json({ error, ...(code ? { code } : {}) });
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error("[account]", err.message);
  fail(res, 500, "Something went wrong. Please try again.");
});

async function me(req) {
  return User.findById(req.user.userId);
}

/** Bump tokenVersion (signing out every other session) and return a fresh token for this one. */
async function rotateSessions(user, req) {
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  clearAuthCache(user._id);
  return authService.generateToken(user, req.user.orgId, req.user.role);
}

function checkNewPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 128) return "Password must be at most 128 characters.";
  if (pw.trim().length === 0) return "Password cannot be only spaces.";
  return null;
}

// ── GET /api/account ─────────────────────────────────────────────────────────
router.get("/", wrap(async (req, res) => {
  const user = await me(req);
  if (!user) return fail(res, 404, "Account not found.");
  const activeKeys = await ApiKey.countDocuments({ userId: user._id, revokedAt: null });
  res.json({
    success: true,
    account: {
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      plan: user.plan,
      paidAt: user.paidAt,
      createdAt: user.createdAt,
      hasPassword: Boolean(user.passwordHash),
      googleLinked: Boolean(user.googleId),
      emailVerified: Boolean(user.isEmailVerified),
      apiKeys: activeKeys,
    },
  });
}));

// ── PATCH /api/account/profile ── { name } ───────────────────────────────────
router.patch("/profile", express.json(), wrap(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 80) return fail(res, 400, "Name must be 1 to 80 characters.");
  const user = await me(req);
  if (!user) return fail(res, 404, "Account not found.");
  user.name = name;
  await user.save();
  res.json({ success: true, user: user.toPublicProfile() });
}));

// ── POST /api/account/password ── { currentPassword?, newPassword } ───────────
// Accounts that sign in with Google and have no password can set one without a current password.
router.post("/password", authLimiter, express.json(), wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const problem = checkNewPassword(newPassword);
  if (problem) return fail(res, 400, problem);
  const user = await me(req);
  if (!user) return fail(res, 404, "Account not found.");
  if (user.passwordHash) {
    if (typeof currentPassword !== "string" || !currentPassword) return fail(res, 400, "Enter your current password.");
    if (!(await user.comparePassword(currentPassword))) return fail(res, 400, "Your current password is not correct.", "WRONG_PASSWORD");
    if (await user.comparePassword(newPassword)) return fail(res, 400, "The new password must be different from the current one.");
  }
  const hadPassword = Boolean(user.passwordHash);
  user.passwordHash = newPassword; // hashed by the pre-save hook
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  const token = await rotateSessions(user, req);
  res.json({ success: true, token, message: hadPassword ? "Password changed. Other devices were signed out." : "Password set. You can now also sign in with your email and password." });
}));

// ── POST /api/account/password/reset-link ── emails a reset link to the account's own address ──
router.post("/password/reset-link", authLimiter, wrap(async (req, res) => {
  const user = await me(req);
  if (!user) return fail(res, 404, "Account not found.");
  await authService.forgotPassword(user.email);
  res.json({ success: true, message: `We sent a password reset link to ${user.email}. It works for 1 hour.` });
}));

// ── POST /api/account/sessions/revoke-others ─────────────────────────────────
router.post("/sessions/revoke-others", wrap(async (req, res) => {
  const user = await me(req);
  if (!user) return fail(res, 404, "Account not found.");
  const token = await rotateSessions(user, req);
  res.json({ success: true, token, message: "Signed out of all other devices." });
}));

// ── API keys ─────────────────────────────────────────────────────────────────
const publicKey = (k) => ({ id: String(k._id), name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt });

router.get("/api-keys", wrap(async (req, res) => {
  const keys = await ApiKey.find({ userId: req.user.userId, revokedAt: null }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, keys: keys.map(publicKey), max: MAX_KEYS });
}));

router.post("/api-keys", express.json(), wrap(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 60) return fail(res, 400, "Give the key a name of 1 to 60 characters.");
  const count = await ApiKey.countDocuments({ userId: req.user.userId, revokedAt: null });
  if (count >= MAX_KEYS) return fail(res, 400, `You can have up to ${MAX_KEYS} keys. Revoke one you no longer use first.`);
  const key = API_KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
  const doc = await ApiKey.create({ userId: req.user.userId, name, prefix: key.slice(0, 12), keyHash: hashApiKey(key) });
  res.status(201).json({ success: true, key, apiKey: publicKey(doc) });
}));

router.delete("/api-keys/:id", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Key not found.");
  const r = await ApiKey.updateOne({ _id: req.params.id, userId: req.user.userId, revokedAt: null }, { revokedAt: new Date() });
  if (!r.matchedCount) return fail(res, 404, "Key not found.");
  clearAuthCache();
  res.json({ success: true });
}));

// ── DELETE /api/account ── { confirmEmail, password? } ────────────────────────
// Deletes the user, their memberships, API keys and Claude connections, and any organisation they own
// alone. Refused while they own an organisation that still has other members.
router.delete("/", authLimiter, express.json(), wrap(async (req, res) => {
  const user = await me(req);
  if (!user) return fail(res, 404, "Account not found.");
  const { confirmEmail, password } = req.body || {};
  if (String(confirmEmail || "").trim().toLowerCase() !== user.email) return fail(res, 400, "Type your email address exactly to confirm.");
  if (user.passwordHash && !(await user.comparePassword(String(password || "")))) return fail(res, 400, "Your password is not correct.", "WRONG_PASSWORD");

  const owned = await Organization.find({ ownerId: user._id }).select("_id name").lean();
  for (const org of owned) {
    const others = await Member.countDocuments({ orgId: org._id, userId: { $ne: user._id }, status: "active" });
    if (others > 0) {
      return fail(res, 409, `You own “${org.name}”, which still has ${others} other member${others === 1 ? "" : "s"}. Remove them in Settings → Members first.`, "ORG_HAS_MEMBERS");
    }
  }
  const ownedIds = owned.map((o) => o._id);
  await Member.deleteMany({ $or: [{ userId: user._id }, { orgId: { $in: ownedIds } }] });
  await Organization.deleteMany({ _id: { $in: ownedIds } });
  await ApiKey.deleteMany({ userId: user._id });
  await McpGrant.deleteMany({ userId: user._id });
  await McpAuthCode.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id });
  clearAuthCache(user._id);
  console.log(`[account] deleted user ${user._id}`);
  res.json({ success: true });
}));

module.exports = router;
