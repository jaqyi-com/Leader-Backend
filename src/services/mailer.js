"use strict";
// ============================================================
// MAILER — every email Doott sends to its users
// ============================================================
// One SMTP account (Google Workspace, jaqyi@jaqyi.com) configured by environment variables:
//   SMTP_HOST (smtp.gmail.com) · SMTP_PORT (465) · SMTP_SECURE ("true" for 465) · SMTP_USER · SMTP_PASS
//   SMTP_FROM_NAME (Doott) · SMTP_FROM_EMAIL (defaults to SMTP_USER) · FRONTEND_URL (links in emails)
// Sending never fails a request and never makes it wait: mail goes out in the background (waitUntil
// keeps a serverless call alive until it is sent) and errors are only logged.
// MAIL_OUTBOX_FILE (tests): write each message as a JSON line to that file instead of sending.
// ============================================================

const fs = require("fs");
const nodemailer = require("nodemailer");
const { waitUntil } = require("@vercel/functions");
const templates = require("./emailTemplates");
const logger = require("../utils/logger");

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    // Google shows app passwords in groups of four ("abcd efgh …"); the spaces are not part of it.
    auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s+/g, "") },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
  });
  return transport;
}

const from = () => {
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  return `"${(process.env.SMTP_FROM_NAME || "Doott").replace(/"/g, "")}" <${email}>`;
};

/** True when emails can be sent (or captured in tests). */
const configured = () => Boolean(process.env.MAIL_OUTBOX_FILE || getTransport());

/**
 * Send one email now. Returns true when accepted. Never throws.
 * kind: a template name in emailTemplates.js; data: what that template needs.
 */
async function sendNow(to, kind, data = {}) {
  if (!to) return false;
  const build = templates[kind];
  if (!build) { logger.error(`[Mailer] unknown email template "${kind}"`); return false; }
  const { subject, html, text } = build(data);
  const message = { from: from(), to, subject, html, text };
  try {
    if (process.env.MAIL_OUTBOX_FILE) {
      fs.appendFileSync(process.env.MAIL_OUTBOX_FILE, JSON.stringify({ kind, to, subject, text, html }) + "\n");
      return true;
    }
    const t = getTransport();
    if (!t) { logger.warn(`[Mailer] SMTP is not configured — "${kind}" email to ${to} not sent`); return false; }
    await t.sendMail(message);
    logger.info(`[Mailer] sent "${kind}" email`);
    return true;
  } catch (err) {
    logger.error(`[Mailer] "${kind}" email failed: ${err.message}`);
    return false;
  }
}

/** Send in the background: the request does not wait, and a serverless call stays alive until it is sent. */
function send(to, kind, data = {}) {
  const p = sendNow(to, kind, data);
  try { waitUntil(p); } catch { /* not on Vercel: the promise just runs */ }
  return p;
}

module.exports = { send, sendNow, configured };
