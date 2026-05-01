const express = require("express");
const { google } = require("googleapis");
const { auth } = require("../middleware/auth");
const { Organization } = require("../db/mongoose");

const router = express.Router();

function getOAuthClient(req) {
  let redirectUri = process.env.GOOGLE_OAUTH_REDIRECT;
  if (!redirectUri && req) {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers.host;
    redirectUri = `${protocol}://${host}/api/gmail/callback`;
  } else if (!redirectUri) {
    redirectUri = "http://localhost:3001/api/gmail/callback";
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

// ── GET /api/gmail/auth ───────────────────────────────────────────────────────
router.get("/auth-url", auth, (req, res) => {
  const state = req.user.orgId;
  const scopes = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email"
  ];

  const oauth2Client = getOAuthClient(req);

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: state,
    prompt: "consent", 
  });

  res.json({ success: true, url });
});

// ── GET /api/gmail/callback ───────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5174"}/app/settings?error=gmail_auth_failed`);
  }

  if (!code || !state) {
    return res.status(400).send("Missing code or state parameter.");
  }

  const orgId = state;
  const oauth2Client = getOAuthClient(req);

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
