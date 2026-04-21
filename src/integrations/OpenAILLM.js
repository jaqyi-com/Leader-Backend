// ============================================================
// OPENAI LLM INTEGRATION
// Powers personalized message generation and response analysis
// ============================================================

const OpenAI = require("openai");
const logger = require("../utils/logger").forAgent("OpenAILLM");
const { retry } = require("../utils/helpers");

class OpenAILLM {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-dry-run" });
    this.model = process.env.OPENAI_MODEL || "gpt-4o";
    this.defaultMaxTokens = 1024;
  }

  /**
   * Core completion method
   */
  async complete(systemPrompt, userMessage, maxTokens = 1024) {
    return retry(async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      });

      return response.choices[0]?.message?.content || "";
    }, 3, 2000);
  }

  /**
   * Generate a personalized outreach email — returns rich HTML + plain text
   */
  async generateOutreachEmail(template, variables) {
    const prompt = this._fillTemplate(template, variables);

    logger.info(`Generating outreach email for ${variables.contact_name} at ${variables.company_name}`);

    const systemPrompt = `You are an expert B2B sales copywriter for Leader, an AI autonomy company.
Your job is to write highly personalized, concise, and effective outreach emails using the contact and company details provided.

Always write in a natural, human tone. Never use buzzwords like "synergy", "leverage", "paradigm".
Your emails get replies because they feel personal and relevant, not like spam.

You MUST respond using EXACTLY this format (all four sections are required):

SUBJECT: <compelling subject line here>

TEXT:
<plain text version of the email body — no HTML tags — 3-4 short paragraphs>

HTML:
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#0f2d54 0%,#1a4a8a 100%);padding:28px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Leader</h1>
          <p style="margin:4px 0 0;color:#a8c4e0;font-size:13px;">Precision Sensor Solutions for Robotics</p>
        </td></tr>
        <!-- BODY -->
        <tr><td style="padding:36px 40px;">
          <!-- Personalized content goes here — write 3-4 paragraphs -->
          [BODY_CONTENT]
          <!-- Value Proposition Bullets -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f0f7ff;border-left:3px solid #1a4a8a;border-radius:4px;padding:0;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-weight:700;color:#0f2d54;font-size:14px;">Why Leader?</p>
              [BULLET_CONTENT]
            </td></tr>
          </table>
          <!-- CTA -->
          <p style="margin:28px 0 0;text-align:center;">
            <a href="https://leader.com/demo" style="display:inline-block;background:#1a4a8a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:6px;font-size:15px;font-weight:600;">Book a 15-min Demo</a>
          </p>
        </td></tr>
        <!-- FOOTER -->
        <tr><td style="background:#f8f9fa;padding:20px 40px;border-top:1px solid #e9ecef;">
          <p style="margin:0;font-size:12px;color:#868e96;line-height:1.6;">
            ${variables.sender_name} · Leader · <a href="https://leader.com" style="color:#1a4a8a;">leader.com</a><br>
            You're receiving this because you're a leader in the robotics industry.<br>
            <a href="mailto:${process.env.SMTP_FROM_EMAIL}?subject=Unsubscribe" style="color:#868e96;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>

Important: In your response, replace [BODY_CONTENT] with actual <p style="..."> paragraphs for the email body, and [BULLET_CONTENT] with actual <p style="margin:4px 0;font-size:13px;color:#1a4a8a;">• ...</p> bullet lines. Do NOT include [BODY_CONTENT] or [BULLET_CONTENT] literally in the output.`;

    const result = await this.complete(systemPrompt, prompt, 2000);

    // Parse SUBJECT
    const subjectMatch = result.match(/SUBJECT:\s*(.+)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : `${variables.company_name} × Leader`;

    // Parse TEXT block
    const textMatch = result.match(/TEXT:\s*([\s\S]*?)(?=\nHTML:|$)/i);
    const textBody = textMatch ? textMatch[1].trim() : result.replace(/SUBJECT:\s*.+/i, "").trim();

    // Parse HTML block
    const htmlMatch = result.match(/HTML:\s*([\s\S]*)/i);
    const htmlBody = htmlMatch
      ? htmlMatch[1].trim()
      : this._fallbackHtml(textBody, variables);

    return { subject, htmlBody, textBody };
  }

  /**
   * Analyze an inbound reply and extract intent/signals
   */
  async analyzeResponse(emailContent, contactName, companyName) {
    logger.info(`Analyzing response from ${contactName} at ${companyName}`);

    const systemPrompt = `You are a sales intelligence analyst. Analyze inbound email responses 
and extract structured data about intent, buying signals, and recommended next actions.
Always respond with valid JSON only. No markdown fences, no extra text.`;

    const userMessage = `Analyze this email response:

From: ${contactName} at ${companyName}
Content: ${emailContent}

Return ONLY valid JSON with these exact fields:
{
  "intent": "Interested|Not Interested|Needs More Info|Wrong Person|Out of Office|Bounce",
  "buyingSignals": ["signal1", "signal2"],
  "timeline": "string or null",
  "budget": "string or null", 
  "nextAction": "string describing best next step",
  "urgency": "High|Medium|Low",
  "sentiment": "Positive|Neutral|Negative",
  "summary": "one sentence summary"
}`;

    const result = await this.complete(systemPrompt, userMessage, 500);

    try {
      // Sometimes models wrap JSON in code blocks despite instructions
      const cleanJson = result.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleanJson);
    } catch {
      logger.warn(`Failed to parse LLM JSON response, using fallback`);
      return {
        intent: "Needs More Info",
        buyingSignals: [],
        timeline: null,
        budget: null,
        nextAction: "Manual review required",
        urgency: "Medium",
        sentiment: "Neutral",
        summary: result.slice(0, 200),
      };
    }
  }

  /**
   * Draft a reply to an inbound message
   */
  async draftReply(contactName, companyName, theirMessage, intent, nextAction) {
    const systemPrompt = `You are a sales development representative at Leader.
Write helpful, professional replies that move deals forward. Be concise and human.`;

    const userMessage = `Draft a reply to ${contactName} at ${companyName}.

Their message: "${theirMessage}"
Detected intent: ${intent}
Recommended next action: ${nextAction}

Write a short, professional reply that moves toward booking a call or demo.
Include SUBJECT: line at top.`;

    const result = await this.complete(systemPrompt, userMessage, 600);
    const subjectMatch = result.match(/SUBJECT:\s*(.+)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : `Re: Leader`;
    const body = result.replace(/SUBJECT:\s*.+/i, "").trim();

    return { subject, body };
  }

  /**
   * Score a company description for ICP fit using LLM
   */
  async scoreIcpFit(companyDescription, icpCriteria) {
    const systemPrompt = `You are a B2B market analyst. Score how well a company fits 
an Ideal Customer Profile (ICP). Respond with JSON only.`;

    const userMessage = `Score this company for ICP fit:

Company: ${companyDescription}

ICP Criteria:
- Target segments: ${icpCriteria.segments.join(", ")}
- Technology signals: ${icpCriteria.technologySignals.join(", ")}
- Disqualifiers: ${icpCriteria.disqualifiers.join(", ")}

Return JSON: { "score": 0-100, "reasons": ["reason1"], "disqualified": bool, "primarySegment": "string" }`;

    const result = await this.complete(systemPrompt, userMessage, 300);
    try {
      const cleanJson = result.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleanJson);
    } catch {
      return { score: 50, reasons: ["Manual review needed"], disqualified: false, primarySegment: "Unknown" };
    }
  }

  /**
   * Fill a template string with variables
   */
  _fillTemplate(template, variables) {
    let filled = template;
    for (const [key, value] of Object.entries(variables)) {
      filled = filled.replace(new RegExp(`{{${key}}}`, "g"), value || "");
    }
    return filled;
  }

  /**
   * Fallback HTML email builder — used when LLM doesn't return an HTML block
   */
  _fallbackHtml(textBody, variables = {}) {
    const paragraphs = textBody
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `<p style="margin:0 0 14px;font-size:15px;color:#333;line-height:1.7;">${l}</p>`)
      .join("\n");

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0f2d54 0%,#1a4a8a 100%);padding:28px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Leader</h1>
          <p style="margin:4px 0 0;color:#a8c4e0;font-size:13px;">Precision Sensor Solutions for Robotics</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">${paragraphs}
          <p style="margin:28px 0 0;text-align:center;">
            <a href="https://leader.com/demo" style="display:inline-block;background:#1a4a8a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:6px;font-size:15px;font-weight:600;">Book a 15-min Demo</a>
          </p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px 40px;border-top:1px solid #e9ecef;">
          <p style="margin:0;font-size:12px;color:#868e96;line-height:1.6;">
            ${variables.sender_name || "Alex"} · Leader · <a href="https://leader.com" style="color:#1a4a8a;">leader.com</a><br>
            You're receiving this because you're a leader in the robotics industry.<br>
            <a href="mailto:${process.env.SMTP_FROM_EMAIL}?subject=Unsubscribe" style="color:#868e96;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  /**
   * Autonomous SDR Bot: Build a dossier from website content
   */
  async researchLead(leadData, htmlContext) {
    logger.info(`Autonomous bot researching lead: ${leadData.company}`);
    const systemPrompt = `You are a B2B sales research analyst. Build a concise, evidence-based dossier on the prospect based on the provided website content. Be specific, never generic. If unknown, leave fields empty.
Return ONLY valid JSON exactly matching this structure, with no markdown formatting or backticks:
{
  "industry": "One-word industry",
  "summary": "2-3 sentence what they do",
  "pain_points": ["point 1", "point 2", "point 3"],
  "tech_stack": ["tech 1", "tech 2"],
  "recent_news": "Recent news or signals",
  "decision_maker_guess": { "name": "Name", "role": "Role", "reasoning": "Why" },
  "icp_score": 85
}`;
    
    const userMessage = `Build a dossier for this prospect.
Company: ${leadData.company}
Website: ${leadData.website || "unknown"}
Known contact: ${leadData.contact_name || "unknown"} (${leadData.contact_role || "?"})
User notes: ${leadData.notes || "none"}

Website excerpt:
"""
${htmlContext || "(no website content available)"}
"""`;

    const result = await this.complete(systemPrompt, userMessage, 800);
    try {
      const cleanJson = result.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleanJson);
    } catch {
      logger.warn(`Failed to parse dossier JSON for ${leadData.company}`);
      return {
        industry: "", summary: "Could not parse website.", pain_points: [], tech_stack: [],
        recent_news: "", decision_maker_guess: null, icp_score: 50
      };
    }
  }

  /**
   * Autonomous SDR Bot: Draft short cold email from dossier
   */
  async draftAutonomousEmail(leadData, dossier, senderInfo) {
    logger.info(`Autonomous bot drafting email for: ${leadData.company}`);
    const systemPrompt = `You are a world-class SDR. Write cold emails that sound like one human writing to another.
Rules: max 4 short lines (≈70 words). One specific reference to their business. One soft CTA. No fluff, no hype, no 'I hope this finds you well'. No emojis. Subject line ≤ 6 words, lowercase if possible.
Return ONLY valid JSON exactly matching this structure, with no markdown formatting or backticks:
{
  "subject": "subject line",
  "body": "Full email body, signature included",
  "confidence": 0.95
}`;

    const userMessage = `Write a cold email.
    
FROM: ${senderInfo.name} (${senderInfo.role} at ${senderInfo.company})
TO: ${leadData.contact_name || "the team"} (${leadData.contact_role || "?"}) at ${leadData.company}

Dossier:
- Industry: ${dossier.industry || "?"}
- What they do: ${dossier.summary || "?"}
- Pain points: ${(dossier.pain_points || []).join(" · ")}
- Tech: ${(dossier.tech_stack || []).join(", ")}
- Recent: ${dossier.recent_news || "—"}

Signature to append after the body:
—
${senderInfo.name}
${senderInfo.role}, ${senderInfo.company}

Return the JSON.`;

    const result = await this.complete(systemPrompt, userMessage, 600);
    try {
      const cleanJson = result.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleanJson);
    } catch {
      logger.warn(`Failed to parse draft JSON for ${leadData.company}`);
      return {
        subject: "brief question",
        body: `Hi ${leadData.contact_name || "there"},\n\nWould love to connect about what you're doing at ${leadData.company}.\n\n—\n${senderInfo.name}`,
        confidence: 0
      };
    }
  }
}

module.exports = new OpenAILLM();
