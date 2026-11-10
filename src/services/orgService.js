const crypto = require("crypto");
const db = require("../db/appDb");

const notFound = (msg) => Object.assign(new Error(msg), { statusCode: 404 });

// ── Get org by ID ────────────────────────────────────────────────────────────
async function getOrgById(orgId) {
  const org = await db.findOrgById(orgId);
  if (!org) throw notFound("Organization not found.");
  return org;
}

const userBrief = (prefix, row) => (row[prefix + "Id"] ? {
  _id: row[prefix + "Id"], name: row[prefix + "Name"], email: row[prefix + "Email"],
  ...(prefix === "u" ? { avatar: row.uAvatar, isEmailVerified: row.uIsEmailVerified, createdAt: row.uCreatedAt } : {}),
} : null);

// ── Get all members of an org (with user details) ───────────────────────────
async function getOrgMembers(orgId) {
  const rows = await db.many(
    `SELECT m.*, u.id AS u_id, u.name AS u_name, u.email AS u_email, u.avatar AS u_avatar,
            u.is_email_verified AS u_is_email_verified, u.created_at AS u_created_at,
            i.id AS i_id, i.name AS i_name, i.email AS i_email
       FROM app.members m
       LEFT JOIN app.users u ON u.id = m.user_id
       LEFT JOIN app.users i ON i.id = m.invited_by
      WHERE m.org_id = $1
      ORDER BY m.created_at ASC`,
    [String(orgId)]
  );
  return rows.map((m) => ({
    _id: m._id,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    invitedAt: m.createdAt,
    inviteEmail: m.inviteEmail,
    invitedBy: userBrief("i", m),
    user: userBrief("u", m),
  }));
}

// ── Invite member by email ───────────────────────────────────────────────────
async function inviteMember({ orgId, email, role = "member", invitedByUserId }) {
  const org = await db.findOrgById(orgId);
  if (!org) throw notFound("Organization not found.");

  const existingUser = await db.findUserByEmail(email);

  if (existingUser) {
    const alreadyMember = await db.one("SELECT * FROM app.members WHERE org_id = $1 AND user_id = $2", [String(orgId), existingUser._id]);
    if (alreadyMember && alreadyMember.status === "active") {
      const err = new Error("This user is already a member of the organization.");
      err.statusCode = 409;
      throw err;
    }
    if (alreadyMember) {
      // Re-send invite
      const inviteToken = crypto.randomBytes(32).toString("hex");
      await db.update("members", { _id: alreadyMember._id }, {
        inviteToken, inviteTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await sendInviteEmail({ email, org, inviteToken });
      return { message: "Invite re-sent." };
    }
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  await db.insert("members", {
    orgId: String(orgId),
    userId: existingUser?._id || null,
    role,
    status: "invited",
    invitedBy: invitedByUserId ? String(invitedByUserId) : null,
    inviteEmail: email.toLowerCase(),
    inviteToken,
    inviteTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  await sendInviteEmail({ email, org, inviteToken });
  return { message: "Invite sent." };
}

// ── Accept invite (join org) ─────────────────────────────────────────────────
async function acceptInvite({ inviteToken, userId }) {
  const member = await db.one("SELECT * FROM app.members WHERE invite_token = $1 AND invite_token_expires > now()", [String(inviteToken)]);
  if (!member) {
    const err = new Error("Invite link is invalid or has expired.");
    err.statusCode = 400;
    throw err;
  }
  const [updated] = await db.update("members", { _id: member._id }, {
    userId: String(userId), status: "active", joinedAt: new Date(), inviteToken: null, inviteTokenExpires: null,
  });
  // Give the user a default org if they have none
  await db.exec("UPDATE app.users SET default_org_id = $2, updated_at = now() WHERE id = $1 AND default_org_id IS NULL", [String(userId), member.orgId]);
  return updated;
}

// ── Update member role ───────────────────────────────────────────────────────
async function updateMemberRole({ orgId, targetUserId, newRole, requestingUserId }) {
  // Prevent self-demotion if last admin
  if (targetUserId.toString() === requestingUserId.toString() && newRole !== "admin") {
    const r = await db.one("SELECT count(*)::int AS n FROM app.members WHERE org_id = $1 AND role = 'admin' AND status = 'active'", [String(orgId)]);
    if (r.n <= 1) {
      const err = new Error("You are the last admin. Transfer ownership before changing your role.");
      err.statusCode = 400;
      throw err;
    }
  }
  const [member] = await db.update("members", { orgId: String(orgId), userId: String(targetUserId) }, { role: newRole });
  if (!member) throw notFound("Member not found.");
  return member;
}

// ── Remove member ────────────────────────────────────────────────────────────
async function removeMember({ orgId, targetUserId, requestingUserId }) {
  if (targetUserId.toString() === requestingUserId.toString()) {
    const err = new Error("You cannot remove yourself. Use 'Leave Organization' instead.");
    err.statusCode = 400;
    throw err;
  }
  const n = await db.exec("DELETE FROM app.members WHERE org_id = $1 AND user_id = $2", [String(orgId), String(targetUserId)]);
  if (!n) throw notFound("Member not found.");
  return { message: "Member removed." };
}

// ── Switch active org (returns a new token) ──────────────────────────────────
async function switchOrg({ userId, newOrgId }) {
  const member = await db.one("SELECT * FROM app.members WHERE org_id = $1 AND user_id = $2 AND status = 'active'", [String(newOrgId), String(userId)]);
  if (!member) {
    const err = new Error("You are not a member of this organization.");
    err.statusCode = 403;
    throw err;
  }
  const [user] = await db.update("users", { _id: String(userId) }, { defaultOrgId: String(newOrgId) });
  const { generateToken } = require("./authService");
  const token = generateToken(user, newOrgId, member.role);
  const org = await db.findOrgById(newOrgId);
  return { token, org };
}

// ── Update org details ───────────────────────────────────────────────────────
async function updateOrg({ orgId, updates }) {
  const allowed = ["name", "logo", "website", "industry"];
  const clean = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) clean[key] = updates[key];
  }
  if (!Object.keys(clean).length) return db.findOrgById(orgId);
  const [org] = await db.update("organizations", { _id: String(orgId) }, clean);
  return org || null;
}

// ── Get user's orgs ──────────────────────────────────────────────────────────
async function getUserOrgs(userId) {
  const rows = await db.many(
    `SELECT m.role AS m_role, m.joined_at AS m_joined_at, o.*
       FROM app.members m JOIN app.organizations o ON o.id = m.org_id
      WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY m.created_at ASC`,
    [String(userId)]
  );
  return rows.map(({ mRole, mJoinedAt, ...org }) => ({ org, role: mRole, joinedAt: mJoinedAt }));
}

// ── Helper: Send invite email ────────────────────────────────────────────────
async function sendInviteEmail({ email, org, inviteToken }) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const link = `${frontendUrl}/invite?token=${inviteToken}`;

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
