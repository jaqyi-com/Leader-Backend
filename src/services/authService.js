const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../db/appDb");

const { JWT_SECRET } = require("../config/jwtSecret");
const { registrationMode } = require("../config/registration");
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

// ── Helper: Unique Slug Generation ───────────────────────────────────────────
async function generateUniqueSlug(name) {
  let baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!baseSlug) baseSlug = "org";
  
  let slug = baseSlug;
  let counter = 1;
  while (await db.one("SELECT 1 AS x FROM app.organizations WHERE slug = $1", [slug])) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}

// ── Token generation ─────────────────────────────────────────────────────────
function generateToken(user, orgId, role = "member") {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      orgId: orgId ? orgId.toString() : null,
      role,
      tv: user.tokenVersion || 0,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ── Email / Password Registration ────────────────────────────────────────────
async function registerWithEmail({ name, email, password, orgName }) {
  // Check if user already exists
  const existing = await db.findUserByEmail(email);
  if (existing) {
    const err = new Error("An account with this email already exists.");
    err.statusCode = 409;
    throw err;
  }

  // Build org slug from org name
  const slug = await generateUniqueSlug(orgName || name + "'s Org");

  // Create user — mark as verified immediately (no email verification required)
  let user;
  try {
    user = await db.insert("users", {
      name,
      email: email.toLowerCase().trim(),
      passwordHash: await db.hashPassword(password),
      isEmailVerified: true,
    });
  } catch (e) {
    if (e.code === "23505") { // unique email, lost a race with a parallel sign-up
      const err = new Error("An account with this email already exists.");
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }

  // Create org, make the user its admin, and set it as their default
  const org = await db.insert("organizations", {
    name: orgName || `${name}'s Organization`,
    slug,
    ownerId: user._id,
  });
  await db.insert("members", { orgId: org._id, userId: user._id, role: "admin", status: "active", joinedAt: new Date() });
  [user] = await db.update("users", { _id: user._id }, { defaultOrgId: org._id });

  // Auto-login: return a token so the user is signed in immediately
  const token = generateToken(user, org._id, "admin");

  return { token, user: db.publicUser(user), org };
}

/** Token + public profile + org for a signed-in user (their default org, else their first one). */
async function sessionFor(user) {
  const member = await db.firstMembership(user._id);
  const orgId = user.defaultOrgId || member?.orgId || null;
  const role = member?.role || "member";
  const token = generateToken(user, orgId, role);
  const org = orgId ? await db.findOrgById(orgId) : null;
  return { token, user: db.publicUser(user), org };
}

// ── Email / Password Login ───────────────────────────────────────────────────
async function loginWithEmail({ email, password }) {
  const user = await db.findUserByEmail(email);
  if (!user || !(await db.checkPassword(user, password))) {
    const err = new Error("Invalid email or password.");
    err.statusCode = 401;
    throw err;
  }
  return sessionFor(user);
}

// ── Google OAuth ─────────────────────────────────────────────────────────────
async function handleGoogleOAuth({ googleId, email, name, avatar }) {
  // Try to find existing user by googleId or email
  let user = await db.one(
    "SELECT * FROM app.users WHERE google_id = $1 OR lower(email) = lower($2) ORDER BY (google_id = $1) DESC NULLS LAST LIMIT 1",
    [googleId, email]
  );

  if (!user) {
    // New Google user — only if sign-up is open (REGISTRATION_MODE)
    if (registrationMode() !== "open") {
      const err = new Error("New registrations are currently closed.");
      err.statusCode = 403;
      throw err;
    }
    const slug = await generateUniqueSlug(name + "'s Org");
    user = await db.insert("users", {
      name,
      email: email.toLowerCase().trim(),
      googleId,
      avatar,
      isEmailVerified: true, // Google-verified
    });
    const org = await db.insert("organizations", { name: `${name}'s Organization`, slug, ownerId: user._id });
    await db.insert("members", { orgId: org._id, userId: user._id, role: "admin", status: "active", joinedAt: new Date() });
    [user] = await db.update("users", { _id: user._id }, { defaultOrgId: org._id });
  } else if (!user.googleId) {
    // Link googleId if missing (user registered via email first)
    [user] = await db.update("users", { _id: user._id }, {
      googleId,
      avatar: avatar || user.avatar,
      isEmailVerified: true,
    });
  }

  return sessionFor(user);
}

// ── Email Verification ───────────────────────────────────────────────────────
async function verifyEmail(token) {
  const found = await db.one(
    "SELECT * FROM app.users WHERE email_verify_token = $1 AND email_verify_token_expires > now()",
    [String(token)]
  );
  if (!found) {
    const err = new Error("Verification link is invalid or has expired.");
    err.statusCode = 400;
    throw err;
  }
  const [user] = await db.update("users", { _id: found._id }, {
    isEmailVerified: true, emailVerifyToken: null, emailVerifyTokenExpires: null,
  });
  // Auto-login after verification
  return sessionFor(user);
}

// ── Resend Verification Email ────────────────────────────────────────────────
async function resendVerificationEmail(email) {
  const user = await db.findUserByEmail(email);
  if (!user) return; // Silent fail (don't leak user existence)
  if (user.isEmailVerified) return;

  const verifyToken = crypto.randomBytes(32).toString("hex");
  await db.update("users", { _id: user._id }, {
    emailVerifyToken: verifyToken,
    emailVerifyTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

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
  const user = await db.findUserByEmail(email);
  // Always return success — never reveal if email exists
  if (!user) return;

  const resetToken = crypto.randomBytes(32).toString("hex");
  await db.update("users", { _id: user._id }, {
    passwordResetToken: resetToken,
    passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  });

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
  const user = await db.one(
    "SELECT * FROM app.users WHERE password_reset_token = $1 AND password_reset_expires > now()",
    [String(token)]
  );
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
  await db.update("users", { _id: user._id }, {
    passwordHash: await db.hashPassword(newPassword),
    passwordResetToken: null,
    passwordResetExpires: null,
    isEmailVerified: true, // resetting password implicitly verifies the email
    tokenVersion: (user.tokenVersion || 0) + 1, // a reset signs out every existing session
  });
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
  sessionFor,
};
