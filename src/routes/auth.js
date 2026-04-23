const express = require("express");
const passport = require("passport");
const authService = require("../services/authService");
const { auth } = require("../middleware/auth");

const router = express.Router();

// ── Register with Email ──────────────────────────────────────────────────────
// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, orgName } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const result = await authService.registerWithEmail({ name, email, password, orgName });
    res.status(201).json({
      success: true,
      message: "Account created! Please check your email to verify your account.",
      user: result.user,
      org: result.org,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Login with Email ─────────────────────────────────────────────────────────
// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const result = await authService.loginWithEmail({ email, password });
    res.json({
      success: true,
      token: result.token,
      user: result.user,
      org: result.org,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code,
    });
  }
});

// ── Verify Email ─────────────────────────────────────────────────────────────
// GET /api/auth/verify-email?token=<token>
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: "Verification token is required." });
    }

    const result = await authService.verifyEmail(token);
    res.json({
      success: true,
      message: "Email verified! You are now logged in.",
      token: result.token,
      user: result.user,
      org: result.org,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Resend Verification Email ─────────────────────────────────────────────────
// POST /api/auth/resend-verification
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });
    await authService.resendVerificationEmail(email);
    res.json({ success: true, message: "If an unverified account exists, a new verification email has been sent." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Forgot Password ───────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });
    await authService.forgotPassword(email);
    // Always respond with success (don't reveal if account exists)
    res.json({ success: true, message: "If an account exists for that email, a password reset link has been sent." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reset Password ────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and new password are required." });
    const result = await authService.resetPassword(token, password);
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Get current user ─────────────────────────────────────────────────────────
// GET /api/auth/me
router.get("/me", auth, async (req, res) => {
  try {
    const user = await req.getUser();
    const org = await req.getOrg();
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ success: true, user, org });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Logout ───────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// JWT is stateless — client just drops the token.
// This endpoint exists for future token blacklisting or session clearing.
router.post("/logout", auth, (req, res) => {
  res.json({ success: true, message: "Logged out successfully." });
});

// ── Google OAuth — Initiate ──────────────────────────────────────────────────
// GET /api/auth/google
router.get(
  "/google",
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(501).json({ error: "Google OAuth is not configured yet. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env." });
    }
    next();
  },
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

// ── Google OAuth — Callback ──────────────────────────────────────────────────
// GET /api/auth/google/callback
router.get(
  "/google/callback",
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5174"}/login?error=google_not_configured`);
    }
    next();
  },
  passport.authenticate("google", { session: false, failureRedirect: "/login?error=google_failed" }),
  (req, res) => {
    // req.user is set by passport strategy to { token, user, org }
    const { token } = req.user;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";
    // Redirect to frontend with token in query (frontend stores in localStorage)
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
);

module.exports = router;
