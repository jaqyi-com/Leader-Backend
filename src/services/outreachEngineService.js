// ============================================================
// OUTREACH ENGINE SERVICE
// Aggregates contacts from all sources, scores them, generates
// AI personalizations, and sends via Email / WhatsApp / SMS
// ============================================================

const nodemailer = require("nodemailer");
const { Website, AutoScraperLead, GeneratedLead, Place, OutreachCampaign } = require("../db/mongoose");
const OpenAI = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── DECISION MAKER TITLES ─────────────────────────────────────────────────
const DECISION_MAKER_TITLES = [
  "ceo", "founder", "co-founder", "cofounder", "owner", "president",
  "cto", "coo", "cmo", "cpo", "vp", "vice president", "director",
  "head of", "chief", "managing director", "md", "partner", "principal",
];

// ─── SCORE A SINGLE CONTACT (deterministic, no API cost) ───────────────────
function scoreContact(contact) {
  let score = 0;
  const breakdown = {};

  // Contact data completeness (max 4)
  if (contact.email) { score += 2; breakdown.email = 2; }
  if (contact.phone) { score += 1; breakdown.phone = 1; }
  if (contact.linkedin) { score += 1; breakdown.linkedin = 1; }

  // Title seniority (max 3)
  const titleLower = (contact.title || contact.jobTitle || "").toLowerCase();
  const isDecisionMaker = DECISION_MAKER_TITLES.some(t => titleLower.includes(t));
  if (isDecisionMaker) { score += 3; breakdown.title = 3; }
  else if (titleLower) { score += 1; breakdown.title = 1; }

  // Company info (max 2)
  if (contact.companyDomain || contact.companyWebsite) { score += 1; breakdown.companyDomain = 1; }
  if (contact.description || contact.short_description || contact.website_title) {
    score += 1; breakdown.description = 1;
  }

  // Cap at 10
  score = Math.min(10, score);

  return {
    score,
    breakdown,
    tier: score >= 7 ? "hot" : score >= 4 ? "warm" : "cold",
  };
}

// ─── AGGREGATE ALL CONTACTS WITH CONTACT INFO ──────────────────────────────
async function aggregateContacts(orgId) {
  const results = [];

  // 1. Website Intel
  const websiteQuery = {
    $and: [
      ...(orgId ? [{ $or: [{ orgId }, { orgId: null }, { orgId: { $exists: false } }] }] : []),
      { $or: [
        { contact_email: { $exists: true, $ne: "" } },
        { developer_email: { $exists: true, $ne: "" } },
        { phone_number: { $exists: true, $ne: "" } },
      ]},
    ],
  };
  const websites = await Website.find(websiteQuery).lean().limit(500);

  websites.forEach(w => {
    const email = w.contact_email || w.developer_email || "";
    const phone = w.phone_number || w.developer_phone || "";
    if (!email && !phone) return;
    const contact = {
      _id: w._id.toString(),
      source: "website_intel",
      sourceLabel: "Website Intel",
      name: w.brand_name || w.website_title || w.input_url,
      email,
      phone,
      linkedin: w.linkedin_url || "",
      companyName: w.brand_name || "",
      companyWebsite: w.input_url,
      companyDomain: w.input_url ? new URL(w.input_url.startsWith("http") ? w.input_url : "https://" + w.input_url).hostname.replace("www.", "") : "",
      description: w.short_description || "",
      title: "",
      jobTitle: "",
      technology_stack: w.technology_stack || "",
    };
    const scored = scoreContact(contact);
    results.push({ ...contact, ...scored });
  });

  // 2. Auto Scraper Leads
  const scraperQuery = {
    $and: [
      ...(orgId ? [{ $or: [{ orgId }, { orgId: null }, { orgId: { $exists: false } }] }] : []),
      { $or: [
        { contact_email: { $exists: true, $ne: "" } },
        { developer_email: { $exists: true, $ne: "" } },
        { phone_number: { $exists: true, $ne: "" } },
      ]},
    ],
  };
  const scraperLeads = await AutoScraperLead.find(scraperQuery).lean().limit(500);

  scraperLeads.forEach(l => {
    const email = l.contact_email || l.developer_email || "";
    const phone = l.phone_number || l.developer_phone || "";
    if (!email && !phone) return;
    const contact = {
      _id: l._id.toString(),
      source: "auto_scraper",
      sourceLabel: "Auto Scraper",
      name: l.brand_name || l.website_title || l.input_url || "",
      email,
      phone,
      linkedin: "",
      companyName: l.brand_name || "",
      companyWebsite: l.input_url || "",
      companyDomain: l.input_url ? (l.input_url.replace(/https?:\/\//, "").split("/")[0].replace("www.", "")) : "",
      description: l.website_title || "",
      title: "",
      jobTitle: "",
      technology_stack: l.technology_stack || "",
      keyword: l.keyword || "",
    };
    const scored = scoreContact(contact);
    results.push({ ...contact, ...scored });
  });

  // 3. Generated Leads (LinkedIn Finder, Email Finder, Company Intel)
  const leadsQuery = {
    $and: [
      ...(orgId ? [{ $or: [{ orgId }, { orgId: null }, { orgId: { $exists: false } }] }] : []),
      { $or: [
        { email: { $exists: true, $ne: "" } },
        { phone: { $exists: true, $ne: "" } },
      ]},
    ],
  };
  const generatedLeads = await GeneratedLead.find(leadsQuery).lean().limit(500);

  generatedLeads.forEach(l => {
    if (!l.email && !l.phone) return;
    const contact = {
      _id: l._id.toString(),
      source: l.source || "lead_database",
      sourceLabel: "Lead Database",
      name: l.fullName || `${l.firstName || ""} ${l.lastName || ""}`.trim() || l.companyName,
      email: l.email || "",
      phone: l.phone || "",
      linkedin: l.linkedinUrl || "",
      companyName: l.companyName || "",
      companyWebsite: l.companyWebsite || "",
      companyDomain: l.companyDomain || "",
      description: l.researchNotes || "",
      title: l.jobTitle || "",
      jobTitle: l.jobTitle || "",
      country: l.country || "",
      city: l.city || "",
    };
    const scored = scoreContact(contact);
    results.push({ ...contact, ...scored });
  });

  // 4. Places Scraper (those with phone)
  const placesQuery = {
    $and: [
      ...(orgId ? [{ $or: [{ orgId }, { orgId: null }, { orgId: { $exists: false } }] }] : []),
      { phone: { $exists: true, $ne: "" } },
    ],
  };
  const places = await Place.find(placesQuery).lean().limit(300);

  places.forEach(p => {
    if (!p.phone && !p.website) return;
    const contact = {
      _id: p._id.toString(),
      source: "places_scraper",
      sourceLabel: "Places Scraper",
      name: p.name || "",
      email: "",
      phone: p.phone || "",
      linkedin: "",
      companyName: p.name || "",
      companyWebsite: p.website || "",
      companyDomain: p.website ? p.website.replace(/https?:\/\//, "").split("/")[0].replace("www.", "") : "",
      description: p.category_keyword || "",
      title: "",
      jobTitle: "",
      address: p.address || "",
    };
    const scored = scoreContact(contact);
    results.push({ ...contact, ...scored });
  });

  // De-duplicate by email
  const seen = new Set();
  return results.filter(c => {
    const key = c.email || c._id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.score - a.score);
}

// ─── GENERATE AI PERSONALIZATION ───────────────────────────────────────────
async function generatePersonalization(contact, orgContext = {}) {
  const orgName = orgContext.name || process.env.SMTP_FROM_NAME || "Leader";
  const orgDesc = orgContext.description || "a B2B intelligence platform that helps businesses find and connect with the right leads";

  const prompt = `You are a world-class B2B sales copywriter. Generate a hyper-personalized outreach for this lead.

LEAD INFORMATION:
- Name: ${contact.name || "there"}
- Title: ${contact.title || contact.jobTitle || "N/A"}
- Company: ${contact.companyName || "their company"}
- Website: ${contact.companyWebsite || "N/A"}
- Description: ${contact.description || "N/A"}
- Technology: ${contact.technology_stack || "N/A"}
- Location: ${[contact.city, contact.country].filter(Boolean).join(", ") || "N/A"}

SENDER ORGANIZATION:
- Name: ${orgName}
- Description: ${orgDesc}

Generate:
1. A 1-2 sentence icebreaker that references something SPECIFIC about their company/website/tech stack
2. A personalized cold email subject line (max 8 words, intriguing)
3. A short cold email body (120-150 words max, conversational, no fluff, ends with a soft CTA for a quick call)
4. A WhatsApp/SMS message (60 words max, casual, friendly, references the email)

Return ONLY valid JSON:
{
  "icebreaker": "...",
  "subject": "...",
  "emailBody": "...",
  "whatsappMessage": "..."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error("[OutreachEngine] Personalization failed:", err.message);
    const firstName = (contact.name || "there").split(" ")[0];
    return {
      icebreaker: `I came across ${contact.companyName || "your company"} and was impressed by what you're building.`,
      subject: `Quick question for ${contact.companyName || "you"}`,
      emailBody: `Hi ${firstName},\n\nI came across ${contact.companyName || "your company"} and was really impressed by what you're building.\n\nAt ${orgName}, we help businesses like yours ${orgDesc}.\n\nWould you be open to a 15-minute call this week to explore if there's a fit?\n\nBest,\n${orgName} Team`,
      whatsappMessage: `Hi ${firstName}! I sent you an email about ${orgName}. We help with lead generation & outreach — thought it might be relevant to ${contact.companyName || "your work"}. Worth a quick chat? 🤝`,
    };
  }
}

// ─── EMAIL SENDER ──────────────────────────────────────────────────────────
async function sendEmail({ to, subject, body, fromName, orgId }) {
  if (!orgId) {
    throw new Error("orgId is required to send emails.");
  }

  const { Organization } = require("../db/mongoose");
  const { google } = require("googleapis");
  const org = await Organization.findById(orgId).lean();

  if (!org || !org.gmailIntegration || !org.gmailIntegration.refreshToken) {
    throw new Error("Email sending failed: Organization has not connected Gmail. Please connect Gmail in Settings.");
  }

  const integration = org.gmailIntegration;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT || "http://localhost:3001/api/gmail/callback"
  );

  oauth2Client.setCredentials({
    refresh_token: integration.refreshToken,
  });

  // Get a fresh access token (nodemailer needs this for the oauth2 config)
  const { token } = await oauth2Client.getAccessToken();

  if (!token) {
    throw new Error("Failed to get Gmail access token from refresh token.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: integration.email,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: integration.refreshToken,
      accessToken: token,
    },
  });

  const senderName = fromName || org.name || "Leader";
  const senderEmail = integration.email;

  const info = await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to,
    subject,
    html: body.replace(/\n/g, "<br>"),
    text: body,
  });

  return { messageId: info.messageId };
}

// ─── WHATSAPP / SMS VIA TWILIO ─────────────────────────────────────────────
async function sendWhatsApp(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env");
  }

  // Normalize number
  const toNum = to.replace(/\D/g, "");
  const toFormatted = `whatsapp:+${toNum}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({ From: from, To: toFormatted, Body: message });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Twilio WhatsApp send failed");
  return { sid: data.sid };
}

async function sendSMS(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;

  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio credentials not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM to .env");
  }

  const toNum = to.replace(/\D/g, "");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({ From: from, To: `+${toNum}`, Body: message });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Twilio SMS send failed");
  return { sid: data.sid };
}

module.exports = {
  scoreContact,
  aggregateContacts,
  generatePersonalization,
  sendEmail,
  sendWhatsApp,
  sendSMS,
};
