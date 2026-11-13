"use strict";
// ============================================================
// EMAIL TEMPLATES — subject, HTML and plain text for every email Doott sends (mailer.js)
// ============================================================
// Simple table layout with inline styles (what email clients render reliably), light background,
// one button. Every value that comes from a user (names, key names) is HTML-escaped.
// ============================================================

const ACCENT = "#E23744";
const app = () => (process.env.FRONTEND_URL || "https://doott.jaqyi.com").replace(/\/+$/, "");
const support = () => process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "jaqyi@jaqyi.com";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

/**
 * Wrap content in the Doott layout.
 * parts: { preheader, title, paragraphs: [html], button?: { label, url }, after?: [html], footnote? }
 */
function layout({ preheader, title, paragraphs, button, after = [], footnote }) {
  const p = (html) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${html}</p>`;
  const btn = button ? `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:${ACCENT};">
        <a href="${esc(button.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(button.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#64748b;">Button not working? Copy this link into your browser:<br><a href="${esc(button.url)}" style="color:${ACCENT};word-break:break-all;">${esc(button.url)}</a></p>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || "")}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
        <tr><td style="padding:0 4px 16px;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">Doott</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px 28px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">${esc(title)}</h1>
          ${paragraphs.map(p).join("\n          ")}
          ${btn}
          ${after.map(p).join("\n          ")}
        </td></tr>
        <tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:#64748b;">
          ${footnote ? `${footnote}<br>` : ""}Questions? Reply to this email or write to <a href="mailto:${esc(support())}" style="color:#64748b;">${esc(support())}</a>.<br>
          Doott · <a href="${esc(app())}" style="color:#64748b;">${esc(app().replace(/^https?:\/\//, ""))}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Plain-text version: the same words, no HTML. */
const plain = (lines) => lines.filter((l) => l !== null && l !== undefined).join("\n\n") +
  `\n\n—\nDoott · ${app()}\nQuestions? Reply to this email or write to ${support()}.`;

const strip = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ── Templates ────────────────────────────────────────────────

/** New account (email sign-up, Google sign-up, or after a lifetime payment). */
function welcome({ name, email, viaGoogle = false, paymentId = null }) {
  const paras = [
    `Hi ${esc(first(name))},`,
    `Your Doott account is ready${viaGoogle ? " — you signed up with Google" : ""}. You can now search companies and people, filter by country, city and category, and export verified emails and phone numbers.`,
  ];
  if (paymentId) paras.push(`Your <strong>lifetime access</strong> is active. Payment ID: <strong>${esc(paymentId)}</strong> — keep it for your records.`);
  const after = [
    `You sign in with <strong>${esc(email)}</strong>${viaGoogle ? " using “Continue with Google”" : ""}.`,
    `Want to use Doott from Claude? Connect it in a minute: <a href="${esc(app())}/claude" style="color:${ACCENT};">${esc(app().replace(/^https?:\/\//, ""))}/claude</a>.`,
  ];
  return {
    subject: paymentId ? "Welcome to Doott — your lifetime access is active" : "Welcome to Doott",
    html: layout({ preheader: "Your Doott account is ready.", title: "Welcome to Doott", paragraphs: paras, button: { label: "Open Doott", url: `${app()}/app/companies` }, after,
      footnote: "You received this because an account was created with this email address. If that wasn't you, reply and we'll remove it." }),
    text: plain([`Hi ${first(name)},`, strip(paras[1]), paymentId ? `Your lifetime access is active. Payment ID: ${paymentId}` : null,
      `Open Doott: ${app()}/app/companies`, `You sign in with ${email}${viaGoogle ? " using “Continue with Google”" : ""}.`,
      `Connect Doott to Claude: ${app()}/claude`, "If you didn't create this account, reply and we'll remove it."]),
  };
}

/** Forgot password / reset link from Settings. */
function passwordReset({ name, email, link }) {
  return {
    subject: "Reset your Doott password",
    html: layout({ preheader: "Use this link within 1 hour to choose a new password.", title: "Reset your password",
      paragraphs: [`Hi ${esc(first(name))},`, `We received a request to reset the password for <strong>${esc(email)}</strong>. Choose a new one with the button below. The link works for <strong>1 hour</strong> and only once.`],
      button: { label: "Choose a new password", url: link },
      after: ["If you didn't ask for this, you can ignore this email — your password stays the same."] }),
    text: plain([`Hi ${first(name)},`, `We received a request to reset the password for ${email}. Choose a new one here (works for 1 hour, once):`, link,
      "If you didn't ask for this, ignore this email — your password stays the same."]),
  };
}

/** Password changed, set for the first time, or reset — a security notice. */
function passwordChanged({ name, email, how = "changed" }) {
  const what = { changed: "Your Doott password was changed", set: "A password was added to your Doott account", reset: "Your Doott password was reset" }[how] || "Your Doott password was changed";
  const detail = how === "set"
    ? `You can now sign in to <strong>${esc(email)}</strong> with your email and password as well as with Google.`
    : `The password for <strong>${esc(email)}</strong> was ${how === "reset" ? "reset with an emailed link" : "changed from Settings"}. Other devices were signed out.`;
  return {
    subject: what,
    html: layout({ preheader: "If this wasn't you, reset your password now.", title: what,
      paragraphs: [`Hi ${esc(first(name))},`, detail, `<strong>Wasn't you?</strong> Reset your password right away and reply to this email so we can help.`],
      button: { label: "Reset password", url: `${app()}/forgot-password` } }),
    text: plain([`Hi ${first(name)},`, strip(detail), `Wasn't you? Reset your password now: ${app()}/forgot-password — and reply to this email so we can help.`]),
  };
}

/** A new API key was created (security notice; the key itself is never emailed). */
function apiKeyCreated({ name, keyName, prefix }) {
  return {
    subject: "A new Doott API key was created",
    html: layout({ preheader: `API key “${keyName}” was created on your account.`, title: "New API key created",
      paragraphs: [`Hi ${esc(first(name))},`, `An API key named <strong>${esc(keyName)}</strong> (starts with <code>${esc(prefix)}…</code>) was created on your Doott account. It can read Doott data as you.`,
        "If you didn't create it, revoke it in Settings → API keys and change your password."],
      button: { label: "Manage API keys", url: `${app()}/app/settings?tab=api` } }),
    text: plain([`Hi ${first(name)},`, `An API key named “${keyName}” (starts with ${prefix}…) was created on your Doott account. It can read Doott data as you.`,
      `If you didn't create it, revoke it in Settings → API keys (${app()}/app/settings?tab=api) and change your password.`]),
  };
}

/** Claude (MCP) was connected to the account (security notice). */
function claudeConnected({ name, clientName }) {
  return {
    subject: `${clientName || "Claude"} was connected to your Doott account`,
    html: layout({ preheader: "A new app can now search Doott for you.", title: `${clientName || "Claude"} connected`,
      paragraphs: [`Hi ${esc(first(name))},`, `<strong>${esc(clientName || "Claude")}</strong> can now search companies and people in Doott on your behalf.`,
        "If you didn't connect it, disconnect it in Settings → Claude and change your password."],
      button: { label: "Manage connections", url: `${app()}/app/settings?tab=claude` } }),
    text: plain([`Hi ${first(name)},`, `${clientName || "Claude"} can now search companies and people in Doott on your behalf.`,
      `If you didn't connect it, disconnect it in Settings → Claude (${app()}/app/settings?tab=claude) and change your password.`]),
  };
}

/** The account was deleted. */
function accountDeleted({ name, email }) {
  return {
    subject: "Your Doott account was deleted",
    html: layout({ preheader: "Your account and its data were removed.", title: "Your account was deleted",
      paragraphs: [`Hi ${esc(first(name))},`, `The Doott account for <strong>${esc(email)}</strong> has been deleted, together with its API keys and Claude connections. Thank you for using Doott.`,
        "Didn't delete it yourself? Reply to this email straight away."] }),
    text: plain([`Hi ${first(name)},`, `The Doott account for ${email} has been deleted, together with its API keys and Claude connections. Thank you for using Doott.`,
      "Didn't delete it yourself? Reply to this email straight away."]),
  };
}

/** Confirm an email address (resend-verification). */
function verifyEmail({ name, link }) {
  return {
    subject: "Confirm your email for Doott",
    html: layout({ preheader: "Confirm your email address within 24 hours.", title: "Confirm your email",
      paragraphs: [`Hi ${esc(first(name))},`, "Please confirm your email address. The link works for 24 hours."],
      button: { label: "Confirm email", url: link },
      after: ["If you didn't create a Doott account, ignore this email."] }),
    text: plain([`Hi ${first(name)},`, "Please confirm your email address (link works for 24 hours):", link, "If you didn't create a Doott account, ignore this email."]),
  };
}

/** Invitation to an organisation. */
function orgInvite({ orgName, link }) {
  return {
    subject: `You're invited to join ${orgName} on Doott`,
    html: layout({ preheader: `Join ${orgName} on Doott.`, title: `Join ${orgName} on Doott`,
      paragraphs: [`You've been invited to join <strong>${esc(orgName)}</strong> on Doott. The invitation works for 7 days.`],
      button: { label: "Accept invitation", url: link } }),
    text: plain([`You've been invited to join ${orgName} on Doott (valid for 7 days):`, link]),
  };
}

module.exports = { welcome, passwordReset, passwordChanged, apiKeyCreated, claudeConnected, accountDeleted, verifyEmail, orgInvite, _esc: esc };
