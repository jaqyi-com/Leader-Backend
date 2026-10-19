"use strict";
// Who may create an account. Controlled by environment variables so the policy can be changed
// without a code deploy, and so the default keeps today's behaviour (open) until you decide.
//
//   REGISTRATION_MODE=open    anyone can sign up (default — current behaviour)
//   REGISTRATION_MODE=invite  sign-up needs REGISTRATION_INVITE_CODE (checked on the server)
//   REGISTRATION_MODE=closed  no new accounts via /api/auth/register or Google sign-in
//
// Paid sign-ups (POST /api/payments/verify-and-register) are never affected: payment is the invite.

const crypto = require("crypto");

function registrationMode() {
  const m = String(process.env.REGISTRATION_MODE || "open").toLowerCase().trim();
  return ["open", "invite", "closed"].includes(m) ? m : "open";
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Returns null when sign-up is allowed, otherwise { status, error, code }. */
function checkRegistration(inviteCode) {
  const mode = registrationMode();
  if (mode === "open") return null;
  if (mode === "closed") {
    return { status: 403, error: "New registrations are currently closed.", code: "REGISTRATION_CLOSED" };
  }
  const expected = process.env.REGISTRATION_INVITE_CODE;
  if (!expected) {
    return { status: 403, error: "New registrations are currently closed.", code: "REGISTRATION_CLOSED" };
  }
  if (!inviteCode || !safeEqual(inviteCode, expected)) {
    return { status: 403, error: "A valid invite code is required to register.", code: "INVALID_INVITE_CODE" };
  }
  return null;
}

module.exports = { registrationMode, checkRegistration };
