const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { User, Organization, Member } = require("../db/mongoose");

const JWT_SECRET = process.env.JWT_SECRET || "changeme-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// ── Email transporter (reuses existing SMTP config) ─────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── Token generation ─────────────────────────────────────────────────────────
function generateToken(user, orgId, role = "member") {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      orgId: orgId ? orgId.toString() : null,
      role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ── Email / Password Registration ────────────────────────────────────────────
async function registerWithEmail({ name, email, password, orgName }) {
  // Check if user already exists
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err = new Error("An account with this email already exists.");
    err.statusCode = 409;
    throw err;
  }

  // Build org slug from org name
  const slug = await generateUniqueSlug(orgName || name + "'s Org");

  // Create user (passwordHash will be bcrypt'd via pre-save hook)
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const user = new User({
    name,
    email: email.toLowerCase(),
    passwordHash: password,
    isEmailVerified: false,
    emailVerifyToken: verifyToken,
    emailVerifyTokenExpires: verifyExpires,
  });
  await user.save();

  // Create org
  const org = await Organization.create({
    name: orgName || `${name}'s Organization`,
    slug,
    ownerId: user._id,
  });

  // Make user admin member of org
  await Member.create({
    orgId: org._id,
    userId: user._id,
    role: "admin",
    status: "active",
    joinedAt: new Date(),
  });

  // Set default org
  user.defaultOrgId = org._id;
  await user.save();

  // Send verification email
  await sendVerificationEmail(user, verifyToken);

  return { user: user.toPublicProfile(), org };
}

// ── Email / Password Login ───────────────────────────────────────────────────
async function loginWithEmail({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const err = new Error("Invalid email or password.");
    err.statusCode = 401;
    throw err;
  }

  if (!user.isEmailVerified) {
    const err = new Error("Please verify your email before logging in.");
    err.statusCode = 403;
    err.code = "EMAIL_NOT_VERIFIED";
    throw err;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const err = new Error("Invalid email or password.");
    err.statusCode = 401;
    throw err;
  }

  // Get the user's active org membership
  const member = await Member.findOne({ userId: user._id, status: "active" })
    .sort({ createdAt: 1 }) // oldest = their first/default org
    .lean();

  const orgId = user.defaultOrgId || member?.orgId || null;
  const role = member?.role || "member";

  const token = generateToken(user, orgId, role);

  const org = orgId ? await Organization.findById(orgId).lean() : null;

  return { token, user: user.toPublicProfile(), org };
}

// ── Google OAuth ─────────────────────────────────────────────────────────────
async function handleGoogleOAuth({ googleId, email, name, avatar }) {
  // Try to find existing user by googleId or email
  let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

  if (!user) {
    // New Google user — create user + org
    const slug = await generateUniqueSlug(name + "'s Org");

    user = new User({
      name,
      email: email.toLowerCase(),
      googleId,
      avatar,
      isEmailVerified: true, // Google-verified
    });
    await user.save();

    const org = await Organization.create({
      name: `${name}'s Organization`,
      slug,
      ownerId: user._id,
    });

    await Member.create({
      orgId: org._id,
      userId: user._id,
      role: "admin",
      status: "active",
      joinedAt: new Date(),
    });

    user.defaultOrgId = org._id;
    await user.save();
  } else {
    // Link googleId if missing (user registered via email first)
    if (!user.googleId) {
      user.googleId = googleId;
      if (avatar) user.avatar = avatar;
      user.isEmailVerified = true;
      await user.save();
    }
  }

  const member = await Member.findOne({ userId: user._id, status: "active" })
    .sort({ createdAt: 1 })
    .lean();

  const orgId = user.defaultOrgId || member?.orgId || null;
  const role = member?.role || "member";

  const token = generateToken(user, orgId, role);
  const org = orgId ? await Organization.findById(orgId).lean() : null;

  return { token, user: user.toPublicProfile(), org };
}

// ── Email Verification ───────────────────────────────────────────────────────
async function verifyEmail(token) {
  const user = await User.findOne({
    emailVerifyToken: token,
    emailVerifyTokenExpires: { $gt: new Date() },
  });

  if (!user) {
    const err = new Error("Verification link is invalid or has expired.");
    err.statusCode = 400;
    throw err;
  }

  user.isEmailVerified = true;
  user.emailVerifyToken = null;
  user.emailVerifyTokenExpires = null;
  await user.save();

  // Auto-login after verification
  const member = await Member.findOne({ userId: user._id, status: "active" })
    .sort({ createdAt: 1 })
    .lean();

  const orgId = user.defaultOrgId || member?.orgId || null;
  const role = member?.role || "member";
  const authToken = generateToken(user, orgId, role);
  const org = orgId ? await Organization.findById(orgId).lean() : null;

  return { token: authToken, user: user.toPublicProfile(), org };
}

// ── Resend Verification Email ────────────────────────────────────────────────
async function resendVerificationEmail(email) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return; // Silent fail (don't leak user existence)
  if (user.isEmailVerified) return;

  const verifyToken = crypto.randomBytes(32).toString("hex");
  user.emailVerifyToken = verifyToken;
  user.emailVerifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  await sendVerificationEmail(user, verifyToken);
}

// ── Helper: Send Verification Email ─────────────────────────────────────────
async function sendVerificationEmail(user, token) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";
  const link = `${frontendUrl}/verify-email?token=${token}`;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "Leader"}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: user.email,
      subject: "Verify your Leader account",
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#f0f0f8;padding:40px;border-radius:16px;border:1px solid rgba(255,255,255,0.07)">
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;">Welcome to Leader, ${user.name}! 🚀</h2>
          <p style="color:#8888a8;margin:0 0 28px;font-size:14px;">Click the button below to verify your email address and activate your account.</p>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c63ff,#8b5cf6);color:#fff;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;">Verify Email</a>
          <p style="color:#55556a;font-size:12px;margin-top:28px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
        </div>
      `,
    });
  } catch (e) {
    console.error("[AuthService] Failed to send verification email:", e.message);
  }
}

// ── Forgot Password ──────────────────────────────────────────────────────────
async function forgotPassword(email) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Always return success — never reveal if email exists
  if (!user) return;

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = resetToken;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";
  const link = `${frontendUrl}/reset-password?token=${resetToken}`;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "Leader"}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: user.email,
      subject: "Reset your Leader password",
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#f0f0f8;padding:40px;border-radius:16px;border:1px solid rgba(255,255,255,0.07)">
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;">Reset your password 🔐</h2>
          <p style="color:#8888a8;margin:0 0 28px;font-size:14px;">We received a request to reset your password for <strong style="color:#f0f0f8">${user.email}</strong>. Click below to create a new one.</p>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c63ff,#8b5cf6);color:#fff;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;">Reset Password</a>
          <p style="color:#55556a;font-size:12px;margin-top:28px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  } catch (e) {
    console.error("[AuthService] Failed to send password reset email:", e.message);
  }
}

// ── Reset Password ───────────────────────────────────────────────────────────
async function resetPassword(token, newPassword) {
  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    const err = new Error("Reset link is invalid or has expired.");
    err.statusCode = 400;
    throw err;
  }

  if (newPassword.length < 8) {
    const err = new Error("Password must be at least 8 characters.");
    err.statusCode = 400;
    throw err;
  }

  user.passwordHash = newPassword; // pre-save hook will bcrypt this
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  user.isEmailVerified = true; // resetting password implicitly verifies the email
  await user.save();

  return { message: "Password reset successfully. You can now log in." };
}

module.exports = {
  registerWithEmail,
  loginWithEmail,
  handleGoogleOAuth,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  generateToken,
};
