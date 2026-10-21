"use strict";
// Who may create an account. Controlled by environment variables so the policy can be changed
// without a code deploy.
//
//   REGISTRATION_MODE=invite  (default) sign-up needs the owner's password, checked on the server
//                             against OWNER_INVITE_HASH, or REGISTRATION_INVITE_CODE when that is set
//   REGISTRATION_MODE=open    anyone can sign up
//   REGISTRATION_MODE=closed  no new accounts via /api/auth/register or Google sign-in
//
// Paid sign-ups (POST /api/payments/verify-and-register) are never affected: payment is the invite.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// bcrypt hash of the owner's /register password (the password itself is not stored in the repo).
// REGISTRATION_INVITE_HASH overrides it, so the password can be rotated without a code change.
const OWNER_INVITE_HASH = "$2b$12$vnq9kZONfz4T3epeuZevkuoYl2xK2tBdGYmGZohKMaCNmXl9EY2rm";

function registrationMode() {
  const m = String(process.env.REGISTRATION_MODE || "invite").toLowerCase().trim();
  return ["open", "invite", "closed"].includes(m) ? m : "invite";
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function inviteCodeMatches(inviteCode) {
  if (!inviteCode) return false;
  const plain = process.env.REGISTRATION_INVITE_CODE;
  if (plain) return safeEqual(inviteCode, plain);
  const hash = process.env.REGISTRATION_INVITE_HASH || OWNER_INVITE_HASH;
  try {
    return bcrypt.compareSync(String(inviteCode), hash);
  } catch {
    return false;
  }
}

/** Returns null when sign-up is allowed, otherwise { status, error, code }. */
function checkRegistration(inviteCode) {
  const mode = registrationMode();
  if (mode === "open") return null;
  if (mode === "closed") {
    return { status: 403, error: "New registrations are currently closed.", code: "REGISTRATION_CLOSED" };
  }
  if (!inviteCodeMatches(inviteCode)) {
    return { status: 403, error: "A valid password is required to register.", code: "INVALID_INVITE_CODE" };
  }
  return null;
}

module.exports = { registrationMode, checkRegistration };
