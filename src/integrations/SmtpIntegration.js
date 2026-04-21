// ============================================================
// SMTP INTEGRATION - Nodemailer-based email delivery
// Handles deliverability, rate limiting, and tracking
// ============================================================

const nodemailer = require("nodemailer");
const logger = require("../utils/logger").forAgent("SMTP");
const { sleep } = require("../utils/helpers");
const fs = require("fs");
const path = require("path");

const SENT_LOG_FILE = path.join(process.cwd(), "data", "sent_emails.json");
const DELAY_MS = parseInt(process.env.OUTREACH_DELAY_BETWEEN_EMAILS_MS || "3000");
const DAILY_LIMIT = parseInt(process.env.OUTREACH_DAILY_EMAIL_LIMIT || "200");

class SmtpIntegration {
  constructor() {
    this.transporter = null;
    this.sentToday = 0;
    this.sentLog = [];
    this._loadSentLog();
    this._resetDailyCount();
  }

  /**
   * Initialize the SMTP transporter
   */
  async connect() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    // Verify connection
    try {
      await this.transporter.verify();
      logger.info(`SMTP connected to ${process.env.SMTP_HOST}`);
      return true;
    } catch (err) {
      logger.error(`SMTP connection failed: ${err.message}`);
      logger.warn("Running in DRY RUN mode - emails will be logged but not sent");
      this.dryRun = true;
      return false;
    }
  }

  /**
   * Send an outreach email
   */
  async sendEmail({ to, toName, subject, body, htmlBody, textBody, contactId, companyId }) {
    // Check daily limit
    if (this.sentToday >= DAILY_LIMIT) {
      logger.warn(`Daily email limit (${DAILY_LIMIT}) reached. Queuing for tomorrow.`);
      return { sent: false, reason: "daily_limit_reached" };
    }

    // Check if already sent to this address
    if (this._alreadySentTo(to)) {
      logger.warn(`Already sent to ${to}, skipping duplicate`);
      return { sent: false, reason: "duplicate" };
    }

    // Resolve HTML and text bodies
    // Prefer explicitly provided htmlBody/textBody (new rich-email path)
    // Fall back to legacy body → _textToHtml conversion
    const finalHtml  = htmlBody  || this._textToHtml(body || "");
    const finalText  = textBody  || body || "";

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      text: finalText,
      html: finalHtml,
      headers: {
        "X-Campaign-ID": `leader-${Date.now()}`,
        "X-Contact-ID": contactId || "",
      },
    };

    if (this.dryRun || !this.transporter) {
      logger.info(`[DRY RUN] Would send email to ${to}: "${subject}"`);
      this._logSent(to, subject, contactId, companyId, "dry_run", null, null, true);
      return { sent: true, dryRun: true, to, subject };
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to} (messageId: ${info.messageId})`);
      this.sentToday++;
      this._logSent(to, subject, contactId, companyId, "sent", info.messageId);

      // Rate limiting - be polite
      await sleep(DELAY_MS);

      return { sent: true, messageId: info.messageId, to, subject };
    } catch (err) {
      logger.error(`Failed to send email to ${to}: ${err.message}`);
      this._logSent(to, subject, contactId, companyId, "failed", null, err.message);
      return { sent: false, reason: err.message, to };
    }
  }

  /**
   * Send a sequence of emails with delays
   */
  async sendSequence(contacts, sequences, emailGenerator) {
    const results = [];
    for (const contact of contacts) {
      for (const step of sequences) {
        if (step.type !== "email") continue;

        const { subject, body } = await emailGenerator(step.templateId, contact);
        const result = await this.sendEmail({
          to: contact.email,
          toName: contact.name,
          subject,
          body,
          contactId: contact.id,
          companyId: contact.companyId,
        });

        results.push({ contact: contact.name, step: step.step, ...result });

        if (!result.sent) break; // Stop sequence on failure
      }
    }
    return results;
  }

  /**
   * Convert plain text to simple HTML
   */
  _textToHtml(text) {
    return `
<html><body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px;">
${text.split("\n").map((line) => `<p>${line || "&nbsp;"}</p>`).join("")}
<br>
<p style="font-size:12px;color:#999;">
  You're receiving this because you're a leader in the robotics industry.<br>
  <a href="mailto:${process.env.SMTP_FROM_EMAIL}?subject=Unsubscribe">Unsubscribe</a>
</p>
</body></html>`;
  }

  _alreadySentTo(email) {
    // Only check for actual sent emails, not dry-run or failed attempts
    return this.sentLog.some((e) => e.to === email && e.status === "sent" && !e.dryRun);
  }

  _logSent(to, subject, contactId, companyId, status, messageId, error, dryRun = false) {
    const entry = {
      to, subject, contactId, companyId, status,
      messageId: messageId || null,
      error: error || null,
      dryRun: dryRun,
      sentAt: new Date().toISOString(),
    };
    this.sentLog.push(entry);
    this._saveSentLog();
  }

  _loadSentLog() {
    try {
      if (fs.existsSync(SENT_LOG_FILE)) {
        this.sentLog = JSON.parse(fs.readFileSync(SENT_LOG_FILE, "utf-8"));
      }
    } catch { this.sentLog = []; }
  }

  _saveSentLog() {
    try {
      const dir = path.dirname(SENT_LOG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SENT_LOG_FILE, JSON.stringify(this.sentLog, null, 2));
    } catch (err) {
      logger.warn(`Could not save sent log: ${err.message}`);
    }
  }

  _resetDailyCount() {
    // Reset at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow - now;
    setTimeout(() => {
      this.sentToday = 0;
      this._resetDailyCount();
    }, msUntilMidnight);
  }

  getStats() {
    return {
      sentToday: this.sentToday,
      dailyLimit: DAILY_LIMIT,
      totalSent: this.sentLog.filter((e) => e.status === "sent").length,
      totalFailed: this.sentLog.filter((e) => e.status === "failed").length,
      dryRunMode: !!this.dryRun,
    };
  }
}

module.exports = new SmtpIntegration();
