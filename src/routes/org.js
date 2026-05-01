const express = require("express");
const nodemailer = require("nodemailer");
const { auth, requireRole } = require("../middleware/auth");
const orgService = require("../services/orgService");

const router = express.Router();

// All org routes require authentication
router.use(auth);

// ── Get current org details ──────────────────────────────────────────────────
// GET /api/org
router.get("/", async (req, res) => {
  try {
    if (!req.user.orgId) {
      return res.status(400).json({ error: "No active organization. Please create or join one." });
    }
    const org = await orgService.getOrgById(req.user.orgId);
    res.json({ success: true, org });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Update org details ───────────────────────────────────────────────────────
// PATCH /api/org
router.patch("/", requireRole("admin"), async (req, res) => {
  try {
    const org = await orgService.updateOrg({
      orgId: req.user.orgId,
      updates: req.body,
    });
    res.json({ success: true, org });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Get all orgs the current user belongs to ─────────────────────────────────
// GET /api/org/mine
router.get("/mine", async (req, res) => {
  try {
    const orgs = await orgService.getUserOrgs(req.user.userId);
    res.json({ success: true, orgs });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Switch active org ─────────────────────────────────────────────────────────
// POST /api/org/switch
router.post("/switch", async (req, res) => {
  try {
    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: "orgId is required." });

    const result = await orgService.switchOrg({
      userId: req.user.userId,
      newOrgId: orgId,
    });
    res.json({ success: true, token: result.token, org: result.org });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── List org members ──────────────────────────────────────────────────────────
// GET /api/org/members
router.get("/members", async (req, res) => {
  try {
    const members = await orgService.getOrgMembers(req.user.orgId);
    res.json({ success: true, members });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Invite a member ───────────────────────────────────────────────────────────
// POST /api/org/members/invite
router.post("/members/invite", requireRole("admin"), async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const result = await orgService.inviteMember({
      orgId: req.user.orgId,
      email,
      role: role || "member",
      invitedByUserId: req.user.userId,
    });
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Update member role ────────────────────────────────────────────────────────
// PATCH /api/org/members/:userId/role
router.patch("/members/:userId/role", requireRole("admin"), async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "member", "viewer"].includes(role)) {
      return res.status(400).json({ error: "Role must be admin, member, or viewer." });
    }

    const member = await orgService.updateMemberRole({
      orgId: req.user.orgId,
      targetUserId: req.params.userId,
      newRole: role,
      requestingUserId: req.user.userId,
    });
    res.json({ success: true, member });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Remove a member ───────────────────────────────────────────────────────────
// DELETE /api/org/members/:userId
router.delete("/members/:userId", requireRole("admin"), async (req, res) => {
  try {
    const result = await orgService.removeMember({
      orgId: req.user.orgId,
      targetUserId: req.params.userId,
      requestingUserId: req.user.userId,
    });
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Update SMTP Settings ───────────────────────────────────────────────────────
// PUT /api/org/settings/smtp
router.put("/settings/smtp", requireRole("admin"), async (req, res) => {
  try {
    const { host, port, secure, user, pass, fromName, fromEmail } = req.body;
    
    // Allow pass to be omitted if just updating other settings
    const updates = {
      "smtpCredentials.host": host,
      "smtpCredentials.port": parseInt(port, 10),
      "smtpCredentials.secure": secure === "true" || secure === true,
      "smtpCredentials.user": user,
      "smtpCredentials.fromName": fromName,
      "smtpCredentials.fromEmail": fromEmail,
    };

    if (pass !== undefined && pass !== "") {
      updates["smtpCredentials.pass"] = pass;
    }

    const org = await orgService.updateOrg({
      orgId: req.user.orgId,
      updates,
    });
    
    // Obfuscate password in response
    if (org.smtpCredentials && org.smtpCredentials.pass) {
      org.smtpCredentials.pass = "********";
    }

    res.json({ success: true, org });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Test SMTP Connection ───────────────────────────────────────────────────────
// POST /api/org/settings/smtp/test
router.post("/settings/smtp/test", requireRole("admin"), async (req, res) => {
  try {
    const { host, port, secure, user, pass } = req.body;
    let actualPass = pass;

    // If pass is empty or masked, fetch the real one from DB
    if (!actualPass || actualPass === "********") {
      const { Organization } = require("../db/mongoose");
      const org = await Organization.findById(req.user.orgId).lean();
      if (org && org.smtpCredentials && org.smtpCredentials.pass) {
        actualPass = org.smtpCredentials.pass;
      } else {
        return res.status(400).json({ error: "Password is required to test connection." });
      }
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: secure === "true" || secure === true,
      auth: {
        user,
        pass: actualPass,
      },
    });

    await transporter.verify();
    
    res.json({ success: true, message: "Connection successful! Credentials are valid." });
  } catch (err) {
    res.status(400).json({ error: "Connection failed: " + err.message });
  }
});

module.exports = router;
