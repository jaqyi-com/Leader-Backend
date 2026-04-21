// ============================================================
// OUTREACH AGENT (Phase 4)
// AI-personalized email/SMS sequences using Anthropic LLM
// Handles multi-touch cadence with rate limiting
// ============================================================

const logger = require("../utils/logger").forAgent("OutreachAgent");
const llm = require("../integrations/OpenAILLM");
const smtp = require("../integrations/SmtpIntegration");

const outreachConfig = require("../config/outreach.config");
const icpConfig = require("../config/icp.config");
const { sleep } = require("../utils/helpers");
const fs = require("fs");
const path = require("path");

const OUTREACH_LOG_FILE = path.join(process.cwd(), "data", "outreach_log.json");

class OutreachAgent {
  constructor() {
    this.outreachLog = [];
    this.sequence = outreachConfig.sequences.standard;
    this.enableAbTesting = process.env.ENABLE_AB_TESTING === "true";
    this._loadLog();
  }

  async run(contacts, step = 1, approvedEmails = null) {
    logger.info(`=== OUTREACH AGENT STARTING ===`);
    logger.info(`Contacts: ${contacts.length}, Starting at step ${step}`);

    // Filter contacts based on approved list if provided
    let targetContacts = contacts;
    if (approvedEmails && approvedEmails.length > 0) {
      const approvedAddrs = approvedEmails.map(e => e.to?.toLowerCase());
      targetContacts = contacts.filter(c => approvedAddrs.includes(c.email?.toLowerCase()));
      logger.info(`Filtered to ${targetContacts.length} approved contacts`);
    }

    const stepConfig = this.sequence.find((s) => s.step === step);
    if (!stepConfig) {
      logger.error(`No config found for step ${step}`);
      return { sent: [], skipped: [], failed: [] };
    }

    const results = { sent: [], skipped: [], failed: [] };

    // Send outreach via SMTP to all contacts (no mock filtering)
    await smtp.connect();
    for (const contact of targetContacts) {
      if (this._alreadyContactedAtStep(contact.id, step)) {
        results.skipped.push({ contact: contact.name, reason: "already_contacted" });
        continue;
      }
      try {
        const result = await this.sendToContact(contact, stepConfig);
        if (result.sent) {
          results.sent.push(result);
          this._logOutreach(contact, stepConfig, result);
        } else {
          results.failed.push(result);
        }
      } catch (err) {
        logger.error(`Outreach failed for ${contact.name}: ${err.message}`);
        results.failed.push({ contact: contact.name, error: err.message });
      }
    }

    this._saveLog();

    logger.info(`Outreach complete: ${results.sent.length} sent | ${results.skipped.length} skipped | ${results.failed.length} failed`);
    return results;
  }

  /**
   * Simulate outreach for mock contacts — generate AI content but skip SMTP.
   * Logs as status="simulated" so it appears in Outreach Log / Sheets.
   */
  async simulateOutreach(contact, stepConfig) {
    logger.info(`Simulating ${stepConfig.type} for ${contact.name} @ ${contact.company}`);

    const variables = this._buildPersonalizationVariables(contact);
    const template = outreachConfig.promptTemplates[stepConfig.templateId];
    if (!template) throw new Error(`No template: ${stepConfig.templateId}`);

    const { subject, body } = await llm.generateOutreachEmail(template, variables);
    logger.info(`  [simulated] Subject: "${subject.slice(0, 60)}"`);

    return {
      sent: true,
      simulated: true,
      status: "simulated",
      contactId: contact.id,
      contactName: contact.name,
      company: contact.company,
      step: stepConfig.step,
      type: stepConfig.type,
      subject,
      messageId: `sim-${Date.now()}-${contact.id?.slice(-6) || "mock"}`,
      sentAt: new Date().toISOString(),
    };
  }



  /**
   * Generate and send personalized outreach to one contact
   */
  async sendToContact(contact, stepConfig) {
    logger.info(`Generating personalized ${stepConfig.type} for ${contact.name} @ ${contact.company}`);

    if (stepConfig.type === "email") {
      return this.sendEmail(contact, stepConfig);
    }
  }

  /**
   * Generate and send personalized email
   */
  async sendEmail(contact, stepConfig) {
    // Build variables for LLM personalization
    const variables = this._buildPersonalizationVariables(contact);

    // Get the prompt template
    const template = outreachConfig.promptTemplates[stepConfig.templateId];
    if (!template) {
      throw new Error(`No template found: ${stepConfig.templateId}`);
    }

    // A/B testing: pick random variant if enabled
    let finalTemplate = template;
    if (this.enableAbTesting && Math.random() > 0.5) {
      finalTemplate = this._getVariantTemplate(template);
    }

    // Generate personalized email via LLM (returns subject, htmlBody, textBody)
    const { subject, htmlBody, textBody } = await llm.generateOutreachEmail(finalTemplate, variables);

    logger.info(`  Subject: "${subject.slice(0, 60)}..."`);

    // Send via SMTP
    const sendResult = await smtp.sendEmail({
      to: contact.email,
      toName: contact.name,
      subject,
      htmlBody,
      textBody,
      contactId: contact.id,
      companyId: contact.companyId,
    });

    return {
      ...sendResult,
      contactId: contact.id,
      contactName: contact.name,
      company: contact.company,
      step: stepConfig.step,
      type: "email",
      subject,
      sentAt: new Date().toISOString(),
    };
  }


  /**
   * Process an inbound response — analyze it and draft a reply
   */
  async processInboundResponse(responseEmail) {
    const { from, subject, body, contactId, contactName, companyName } = responseEmail;

    logger.info(`Processing inbound response from ${contactName} @ ${companyName}`);

    // Analyze with LLM
    const analysis = await llm.analyzeResponse(body, contactName, companyName);

    logger.info(`  Intent: ${analysis.intent} | Urgency: ${analysis.urgency} | Sentiment: ${analysis.sentiment}`);

    // Draft a reply if interested or needs more info
    let draftReply = null;
    if (["Interested", "Needs More Info"].includes(analysis.intent)) {
      draftReply = await llm.draftReply(
        contactName,
        companyName,
        body,
        analysis.intent,
        analysis.nextAction
      );
      logger.info(`  Draft reply generated`);
    }

    return {
      contactId,
      contactName,
      company: companyName,
      email: from,
      receivedAt: new Date().toISOString(),
      ...analysis,
      draftReply,
      draftReplyStatus: draftReply ? "Ready" : "Not Required",
    };
  }

  /**
   * Build variables object for LLM template
   */
  _buildPersonalizationVariables(contact) {
    const vp = icpConfig.valueProposition;
    const t1 = vp.products[0];

    return {
      contact_name: contact.firstName || contact.name,
      contact_title: contact.title || "there",
      company_name: contact.company || "your company",
      company_description: contact.description || `${contact.company} is a robotics company`,
      robotics_type: contact.primarySegment || "robotics",
      employee_count: contact.employeeCount || "your team",
      value_proposition: t1.benefits.join("; "),
      product_name: t1.name,
      use_cases: vp.useCases.slice(0, 3).join("; "),
      differentiators: vp.differentiators.slice(0, 2).join("; "),
      sender_name: process.env.SMTP_FROM_NAME || "Alex",
      sender_company: vp.company,
      website: vp.website,
    };
  }

  _fillTemplate(template, variables) {
    let filled = template;
    for (const [key, value] of Object.entries(variables)) {
      filled = filled.replace(new RegExp(`{{${key}}}`, "g"), value || "");
    }
    return filled;
  }

  _getVariantTemplate(template) {
    // For A/B testing: slightly modify the tone instruction
    return template + "\nVariant B: Use a slightly more direct, data-driven tone.";
  }

  _alreadyContactedAtStep(contactId, step) {
    return this.outreachLog.some(
      (entry) => entry.contactId === contactId && entry.step === step &&
        entry.status === "sent"
    );
  }

  _logOutreach(contact, stepConfig, result) {
    this.outreachLog.push({
      contactId: contact.id,
      contactName: contact.name,
      company: contact.company,
      email: contact.email,
      step: stepConfig.step,
      type: stepConfig.type,
      subject: result.subject || "",
      status: result.status || (result.sent ? "sent" : "failed"),
      messageId: result.messageId || null,
      sentAt: new Date().toISOString(),
    });
  }

  _loadLog() {
    try {
      if (fs.existsSync(OUTREACH_LOG_FILE)) {
        this.outreachLog = JSON.parse(fs.readFileSync(OUTREACH_LOG_FILE, "utf-8"));
      }
    } catch { this.outreachLog = []; }
  }

  _saveLog() {
    try {
      const dir = path.dirname(OUTREACH_LOG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(OUTREACH_LOG_FILE, JSON.stringify(this.outreachLog, null, 2));
    } catch (err) {
      logger.warn(`Could not save outreach log: ${err.message}`);
    }
  }

  getOutreachLog() {
    return this.outreachLog;
  }

  getStats() {
    const sentOrSimulated = this.outreachLog.filter(
      (e) => e.status === "sent" || e.status === "simulated"
    ).length;
    const totalResponses = this.outreachLog.filter(
      (e) => e.status === "replied"
    ).length;
    const responseRate = sentOrSimulated > 0
      ? Math.round((totalResponses / sentOrSimulated) * 100)
      : 0;

    return {
      totalSent: sentOrSimulated,      // includes simulated — used by dashboard
      totalResponses,                  // used by dashboard
      responseRate,                    // used by dashboard
      byStep: this.sequence.reduce((acc, s) => {
        acc[`step_${s.step}`] = this.outreachLog.filter(
          (e) => e.step === s.step && (e.status === "sent" || e.status === "simulated")
        ).length;
        return acc;
      }, {}),
    };
  }
}

module.exports = OutreachAgent;
