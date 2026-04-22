const { User, Organization, Member } = require("../db/mongoose");

// ── Get org by ID ────────────────────────────────────────────────────────────
async function getOrgById(orgId) {
  const org = await Organization.findById(orgId).lean();
  if (!org) {
    const err = new Error("Organization not found.");
    err.statusCode = 404;
    throw err;
  }
  return org;
}

// ── Get all members of an org (populated) ───────────────────────────────────
async function getOrgMembers(orgId) {
  const members = await Member.find({ orgId })
    .populate("userId", "name email avatar isEmailVerified createdAt")
    .populate("invitedBy", "name email")
    .lean();

  return members.map((m) => ({
    _id: m._id,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    invitedAt: m.createdAt,
    inviteEmail: m.inviteEmail,
    invitedBy: m.invitedBy,
    user: m.userId, // populated user doc
  }));
}

// ── Invite member by email ───────────────────────────────────────────────────
async function inviteMember({ orgId, email, role = "member", invitedByUserId }) {
  const org = await Organization.findById(orgId).lean();
  if (!org) {
    const err = new Error("Organization not found.");
    err.statusCode = 404;
    throw err;
  }

  const crypto = require("crypto");
  const nodemailer = require("nodemailer");

  // Check if there's already an existing user with this email
  const existingUser = await User.findOne({ email: email.toLowerCase() }).lean();

  // Check if already a member
  if (existingUser) {
    const alreadyMember = await Member.findOne({ orgId, userId: existingUser._id }).lean();
    if (alreadyMember && alreadyMember.status === "active") {
      const err = new Error("This user is already a member of the organization.");
      err.statusCode = 409;
      throw err;
    }
    if (alreadyMember) {
      // Re-send invite
      alreadyMember.inviteToken = crypto.randomBytes(32).toString("hex");
      alreadyMember.inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await Member.findByIdAndUpdate(alreadyMember._id, {
        inviteToken: alreadyMember.inviteToken,
        inviteTokenExpires: alreadyMember.inviteTokenExpires,
      });
      await sendInviteEmail({ email, org, inviteToken: alreadyMember.inviteToken });
      return { message: "Invite re-sent." };
    }
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await Member.create({
    orgId,
    userId: existingUser?._id || undefined,
    role,
    status: "invited",
    invitedBy: invitedByUserId,
    inviteEmail: email.toLowerCase(),
    inviteToken,
    inviteTokenExpires,
  });

  await sendInviteEmail({ email, org, inviteToken });
  return { message: "Invite sent." };
}

// ── Accept invite (join org) ─────────────────────────────────────────────────
async function acceptInvite({ inviteToken, userId }) {
  const member = await Member.findOne({
    inviteToken,
    inviteTokenExpires: { $gt: new Date() },
  });

  if (!member) {
    const err = new Error("Invite link is invalid or has expired.");
    err.statusCode = 400;
    throw err;
  }

  member.userId = userId;
  member.status = "active";
  member.joinedAt = new Date();
  member.inviteToken = null;
  member.inviteTokenExpires = null;
  await member.save();

  // Update user's defaultOrgId if not set
  await User.findByIdAndUpdate(userId, {
    $setOnInsert: { defaultOrgId: member.orgId },
  });

  return member;
}

// ── Update member role ───────────────────────────────────────────────────────
async function updateMemberRole({ orgId, targetUserId, newRole, requestingUserId }) {
  // Prevent self-demotion if last admin
  if (targetUserId.toString() === requestingUserId.toString() && newRole !== "admin") {
    const adminCount = await Member.countDocuments({ orgId, role: "admin", status: "active" });
    if (adminCount <= 1) {
      const err = new Error("You are the last admin. Transfer ownership before changing your role.");
      err.statusCode = 400;
      throw err;
    }
  }

  const member = await Member.findOneAndUpdate(
    { orgId, userId: targetUserId },
    { role: newRole },
    { new: true }
  );

  if (!member) {
    const err = new Error("Member not found.");
    err.statusCode = 404;
    throw err;
  }

  return member;
}

// ── Remove member ────────────────────────────────────────────────────────────
async function removeMember({ orgId, targetUserId, requestingUserId }) {
  if (targetUserId.toString() === requestingUserId.toString()) {
    const err = new Error("You cannot remove yourself. Use 'Leave Organization' instead.");
    err.statusCode = 400;
    throw err;
  }

  const deleted = await Member.findOneAndDelete({ orgId, userId: targetUserId });
  if (!deleted) {
    const err = new Error("Member not found.");
    err.statusCode = 404;
    throw err;
  }

  return { message: "Member removed." };
}

// ── Switch active org (returns a new token) ──────────────────────────────────
async function switchOrg({ userId, newOrgId }) {
  const member = await Member.findOne({ orgId: newOrgId, userId, status: "active" }).lean();
  if (!member) {
    const err = new Error("You are not a member of this organization.");
    err.statusCode = 403;
    throw err;
  }

  await User.findByIdAndUpdate(userId, { defaultOrgId: newOrgId });

  const { generateToken } = require("./authService");
  const user = await User.findById(userId).lean();
  const token = generateToken(user, newOrgId, member.role);
  const org = await Organization.findById(newOrgId).lean();

  return { token, org };
}

// ── Update org details ───────────────────────────────────────────────────────
async function updateOrg({ orgId, updates }) {
  const allowed = ["name", "logo", "website", "industry"];
  const clean = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) clean[key] = updates[key];
  }
  const org = await Organization.findByIdAndUpdate(orgId, clean, { new: true }).lean();
  return org;
}

// ── Get user's orgs ──────────────────────────────────────────────────────────
async function getUserOrgs(userId) {
  const memberships = await Member.find({ userId, status: "active" })
    .populate("orgId")
    .lean();

  return memberships.map((m) => ({
    org: m.orgId,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
}

// ── Helper: Send invite email ────────────────────────────────────────────────
async function sendInviteEmail({ email, org, inviteToken }) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const link = `${frontendUrl}/invite?token=${inviteToken}`;

  try {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "Leader"}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: `You've been invited to ${org.name} on Leader`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#f0f0f8;padding:40px;border-radius:16px;border:1px solid rgba(255,255,255,0.07)">
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;">You're invited to <span style="color:#6c63ff">${org.name}</span></h2>
          <p style="color:#8888a8;margin:0 0 28px;font-size:14px;">You've been added to the Leader workspace for <strong>${org.name}</strong>. Click below to accept your invitation.</p>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c63ff,#8b5cf6);color:#fff;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;">Accept Invitation</a>
          <p style="color:#55556a;font-size:12px;margin-top:28px;">This link expires in 7 days.</p>
        </div>
      `,
    });
  } catch (e) {
    console.error("[OrgService] Failed to send invite email:", e.message);
  }
}

module.exports = {
  getOrgById,
  getOrgMembers,
  inviteMember,
  acceptInvite,
  updateMemberRole,
  removeMember,
  switchOrg,
  updateOrg,
  getUserOrgs,
};
