const express = require("express");
const { google } = require("googleapis");
const { auth } = require("../middleware/auth");
const { Organization } = require("../db/mongoose");

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT || "http://localhost:3001/api/gmail/callback"
);

// ── GET /api/gmail/auth ───────────────────────────────────────────────────────
// Step 1: Redirect to Google's OAuth consent screen
// We expect this to be called from the frontend, but we need the user's token or orgId.
// The frontend can pass the token as a query param, or we can use cookies.
// Alternatively, since it's a redirect, the frontend can fetch an auth URL from us first.
router.get("/auth-url", auth, (req, res) => {
  // Pass the orgId in the 'state' parameter so we get it back in the callback
  const state = req.user.orgId;
  
  const scopes = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email"
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: state,
    prompt: "consent", // Force consent to ensure we get a refresh token
  });

  res.json({ success: true, url });
});

// ── GET /api/gmail/callback ───────────────────────────────────────────────────
// Step 2: Handle the OAuth callback
router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5174"}/app/settings?error=gmail_auth_failed`);
  }

  if (!code || !state) {
    return res.status(400).send("Missing code or state parameter.");
  }

  const orgId = state;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user's email
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    // Save tokens to Organization
    await Organization.findByIdAndUpdate(orgId, {
      "gmailIntegration.email": email,
      "gmailIntegration.accessToken": tokens.access_token,
      "gmailIntegration.refreshToken": tokens.refresh_token,
      "gmailIntegration.expiryDate": tokens.expiry_date,
    });

    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5174"}/app/settings?success=gmail_connected`);
  } catch (err) {
    console.error("[GmailAuth] Callback Error:", err.message);
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5174"}/app/settings?error=gmail_auth_failed`);
  }
});

// ── DELETE /api/gmail/disconnect ──────────────────────────────────────────────
router.delete("/disconnect", auth, async (req, res) => {
  try {
    await Organization.findByIdAndUpdate(req.user.orgId, {
      $unset: { gmailIntegration: 1 }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/gmail/status ─────────────────────────────────────────────────────
router.get("/status", auth, async (req, res) => {
  try {
    const org = await Organization.findById(req.user.orgId).lean();
    if (org?.gmailIntegration?.email) {
      res.json({ success: true, connected: true, email: org.gmailIntegration.email });
    } else {
      res.json({ success: true, connected: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
