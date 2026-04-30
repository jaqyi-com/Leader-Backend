"use strict";
// ============================================================
// LEAD GENERATOR API
// ============================================================
// Routes:
//  POST /analyze-prospect    — AI extracts LinkedIn search params
//  POST /linkedin/search     — Search LinkedIn via Proxycurl (stub until key added)
//  POST /email/find          — Find email via Hunter.io (stub until key added)
//  POST /companies/search    — Search companies via Google + AI
//  GET  /database            — Get all generated leads (paginated)
//  POST /database            — Save a lead manually
//  PATCH /database/:id       — Update lead status/notes
//  DELETE /database/:id      — Delete a lead
//  POST /database/import     — Import AutoScraper leads into database
//  POST /research/start      — Start AI Research Agent (SSE)
//  GET  /research/status/:id — SSE stream for research session
// ============================================================

const express = require("express");
const router  = express.Router();
const OpenAI  = require("openai");
const { GeneratedLead, AutoScraperLead, Place } = require("../db/mongoose");
const logger  = require("../utils/logger").forAgent("LeadGeneratorAPI");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// In-memory research sessions for SSE
const researchSessions = {}; // id → { logs: [], status: "running"|"done"|"failed", leads: [] }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /analyze-prospect — AI extracts structured prospect search criteria
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/analyze-prospect", async (req, res) => {
  const { description } = req.body;
  if (!description?.trim()) return res.status(422).json({ error: "description required" });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{
        role: "system",
        content: `You are a B2B lead generation specialist. Extract structured search criteria from a natural language prospect description.
Return ONLY valid JSON:
{
  "jobTitles": ["string"],       // 2-4 job titles (e.g. "CTO", "VP Engineering")
  "industries": ["string"],      // 2-4 industries (e.g. "SaaS", "fintech")
  "companySize": "string",       // e.g. "11-50", "51-200", "201-500", "1000+"
  "countries": ["string"],       // target countries
  "keywords": ["string"],        // extra context keywords
  "rationale": "string"          // 1-2 sentences explaining the strategy
}`
      }, { role: "user", content: description }],
    });
    res.json(JSON.parse(response.choices[0].message.content));
  } catch (err) {
    logger.error(`[analyze-prospect] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /linkedin/search — LinkedIn Prospect Finder via Proxycurl
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/linkedin/search", async (req, res) => {
  const { jobTitles, industries, countries, companySize, limit = 20 } = req.body;
  const apiKey = process.env.PROXYCURL_API_KEY;

  if (!apiKey) {
    // Return mock data when no API key — so UI is fully functional
    return res.json({
      results: generateMockLinkedInProfiles(jobTitles, industries, countries, limit),
      source: "mock",
      message: "Add PROXYCURL_API_KEY to .env to enable real LinkedIn search.",
    });
  }

  try {
    // Proxycurl Person Search API
    const params = new URLSearchParams();
    if (jobTitles?.length)  params.append("current_role_title", jobTitles[0]);
    if (industries?.length) params.append("current_company_industry", industries[0]);
    if (countries?.length)  params.append("country", countries[0]);
    params.append("page_size", Math.min(limit, 10));

    const response = await fetch(`https://nubela.co/proxycurl/api/v2/search/person?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await response.json();

    res.json({ results: data.results || [], total: data.total_result_count || 0, source: "proxycurl" });
  } catch (err) {
    logger.error(`[linkedin/search] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /email/find — Find business email via Hunter.io
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/email/find", async (req, res) => {
  const { firstName, lastName, domain, fullName, company } = req.body;
  const apiKey = process.env.HUNTER_API_KEY;

  if (!apiKey) {
    // Return mock when no API key
    const mockEmail = `${(firstName || fullName?.split(" ")[0] || "contact").toLowerCase()}@${domain || company?.toLowerCase().replace(/\s+/g, "") + ".com"}`;
    return res.json({
      email: mockEmail,
      confidence: Math.floor(Math.random() * 30) + 60,
      verified: false,
      source: "mock",
      message: "Add HUNTER_API_KEY to .env to enable real email finding.",
    });
  }

  try {
    let url;
    if (domain && (firstName || fullName)) {
      const fn = firstName || fullName.split(" ")[0];
      const ln = lastName  || fullName.split(" ").slice(1).join(" ");
      url = `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(fn)}&last_name=${encodeURIComponent(ln)}&api_key=${apiKey}`;
    } else if (domain) {
      url = `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${apiKey}&limit=5`;
    } else {
      return res.status(422).json({ error: "Provide domain and name, or domain alone." });
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.data?.email) {
      res.json({ email: data.data.email, confidence: data.data.confidence || 0, verified: data.data.verification?.status === "valid", source: "hunter" });
    } else if (data.data?.emails?.length) {
      res.json({ results: data.data.emails.slice(0, 5), source: "hunter_domain" });
    } else {
      res.json({ email: null, message: "No email found for this contact.", source: "hunter" });
    }
  } catch (err) {
    logger.error(`[email/find] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /companies/search — Search companies using AI + Google
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/companies/search", async (req, res) => {
  const { industry, country, employeeRange, keywords, limit = 20 } = req.body;

  try {
    // Build a search query and use OpenAI to generate company suggestions
    const prompt = `Generate a list of ${limit} real B2B companies that match:
Industry: ${industry || "technology"}
Country: ${country || "worldwide"}
Employee Size: ${employeeRange || "any"}
Keywords: ${keywords?.join(", ") || "none"}

Return ONLY valid JSON array:
[{
  "companyName": "string",
  "domain": "string",
  "website": "https://...",
  "industry": "string",
  "country": "string",
  "employeeCount": "string",
  "description": "string (1 sentence)",
  "linkedinUrl": "string or null"
}]

Use REAL, existing companies. Be specific and accurate.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a B2B company research expert with deep knowledge of global businesses. Return accurate, real company data." },
        { role: "user", content: prompt }
      ],
    });

    let content = response.choices[0].message.content.trim();
    // Strip markdown code fences if present
    content = content.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const companies = JSON.parse(content);

    res.json({ results: companies, total: companies.length, source: "ai_research" });
  } catch (err) {
    logger.error(`[companies/search] ${err.message}`);
    res.status(500).json({ error: "Failed to search companies: " + err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /database — Paginated lead database
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/database", async (req, res) => {
  try {
    const { page = 1, limit = 50, status, source, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (source) query.source = source;
    if (search) {
      const re = new RegExp(search, "i");
      query.$or = [{ fullName: re }, { companyName: re }, { email: re }, { jobTitle: re }];
    }

    const [leads, total] = await Promise.all([
      GeneratedLead.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)).lean(),
      GeneratedLead.countDocuments(query),
    ]);

    res.json({ leads, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /database — Save one or many leads
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/database", async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const saved = await GeneratedLead.insertMany(payload, { ordered: false });
    res.json({ saved: saved.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PATCH /database/:id — Update lead status / notes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.patch("/database/:id", async (req, res) => {
  try {
    const lead = await GeneratedLead.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /database/:id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete("/database/:id", async (req, res) => {
  try {
    await GeneratedLead.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /database/import-auto-scraper — Pull existing AutoScraper leads in
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/database/import-auto-scraper", async (req, res) => {
  try {
    const scraperLeads = await AutoScraperLead.find({}).lean();
    const toInsert = scraperLeads.map(l => ({
      fullName: l.brand_name || null,
      companyName: l.brand_name || l.website_title,
      companyWebsite: l.input_url,
      email: l.contact_email || l.developer_email,
      phone: l.phone_number || l.developer_phone,
      country: l.country,
      source: "auto_scraper",
      sourceQuery: l.keyword,
      status: "new",
    })).filter(l => l.email || l.companyWebsite);

    const inserted = await GeneratedLead.insertMany(toInsert, { ordered: false }).catch(e => ({ length: 0 }));
    res.json({ imported: Array.isArray(inserted) ? inserted.length : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /research/start — AI Research Agent (SSE-backed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/research/start", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt?.trim()) return res.status(422).json({ error: "prompt required" });

  const sessionId = require("crypto").randomUUID();
  researchSessions[sessionId] = { logs: [], status: "running", leads: [] };

  // Fire and forget
  runResearchAgent(sessionId, prompt).catch(err => {
    researchSessions[sessionId].status = "failed";
    researchSessions[sessionId].logs.push(`❌ Fatal: ${err.message}`);
  });

  res.json({ sessionId });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /research/status/:id — SSE stream
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/research/status/:id", (req, res) => {
  const session = researchSessions[req.params.id];
  if (!session) return res.status(404).json({ error: "Session not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let lastIdx = 0;
  const send = () => {
    while (lastIdx < session.logs.length) {
      res.write(`data: ${JSON.stringify({ log: session.logs[lastIdx] })}\n\n`);
      lastIdx++;
    }
    if (session.status === "done" || session.status === "failed") {
      res.write(`data: ${JSON.stringify({ status: session.status, leads: session.leads })}\n\n`);
      clearInterval(timer);
      res.end();
    }
  };

  const timer = setInterval(send, 600);
  send();
  const hb = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  req.on("close", () => { clearInterval(timer); clearInterval(hb); });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI Research Agent — internal runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runResearchAgent(sessionId, userPrompt) {
  const session = researchSessions[sessionId];
  const pushLog = (msg) => session.logs.push(msg);

  pushLog(`▶ Research Agent started`);
  pushLog(`📝 Goal: "${userPrompt}"`);

  // Step 1: Analyze the prompt
  pushLog(`🧠 Step 1: Analyzing your requirement with AI...`);
  const planResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [{
      role: "system",
      content: `You are an expert B2B lead researcher. Analyze the user's lead generation goal and create a structured research plan.
Return ONLY valid JSON:
{
  "targetCount": number,
  "companyTypes": ["string"],
  "industries": ["string"],
  "jobTitles": ["string"],
  "countries": ["string"],
  "painPoints": ["string"],
  "searchStrategy": "string",
  "companies": [{ "name": "string", "domain": "string", "website": "string", "country": "string", "industry": "string", "description": "string" }]
}
Generate 10-25 specific, real companies matching the criteria in the "companies" array.`
    }, { role: "user", content: userPrompt }],
  });

  const plan = JSON.parse(planResponse.choices[0].message.content);
  pushLog(`✅ Found ${plan.companies?.length || 0} target companies`);
  pushLog(`🎯 Strategy: ${plan.searchStrategy}`);

  // Step 2: For each company, generate contact info
  pushLog(`📧 Step 2: Researching contacts for each company...`);
  const leads = [];

  for (const company of (plan.companies || []).slice(0, 20)) {
    pushLog(`   🔎 Researching ${company.name}...`);
    try {
      // Use AI to generate a plausible contact for this company
      const contactResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{
          role: "system",
          content: `Return contact details for the most likely decision maker at this company. Return ONLY valid JSON:
{ "firstName": "string", "lastName": "string", "jobTitle": "string", "email": "string or null", "linkedinUrl": "string or null" }
If you don't know the exact email, construct a plausible one using common formats (firstname@domain.com).`
        }, {
          role: "user",
          content: `Company: ${company.name}\nDomain: ${company.domain}\nIndustry: ${company.industry}\nTarget job title: ${plan.jobTitles?.[0] || "CEO"}`
        }],
      });

      const contact = JSON.parse(contactResponse.choices[0].message.content);
      const lead = {
        fullName: `${contact.firstName} ${contact.lastName}`,
        firstName: contact.firstName,
        lastName: contact.lastName,
        jobTitle: contact.jobTitle,
        email: contact.email,
        linkedinUrl: contact.linkedinUrl,
        companyName: company.name,
        companyDomain: company.domain,
        companyWebsite: company.website,
        industry: company.industry,
        country: company.country,
        source: "ai_research",
        sourceQuery: userPrompt,
        status: "new",
      };
      leads.push(lead);
      pushLog(`   ✅ ${company.name} → ${contact.firstName} ${contact.lastName} (${contact.jobTitle})`);
    } catch (e) {
      pushLog(`   ⚠ Skipped ${company.name}: ${e.message}`);
    }
  }

  // Step 3: Save to database
  pushLog(`💾 Step 3: Saving ${leads.length} leads to database...`);
  try {
    await GeneratedLead.insertMany(leads, { ordered: false });
    pushLog(`✅ ${leads.length} leads saved to Lead Database`);
  } catch (e) {
    pushLog(`⚠ Some leads may be duplicates: ${e.message}`);
  }

  session.leads = leads;
  session.status = "done";
  pushLog(`🎉 Research complete! ${leads.length} leads ready in your database.`);

  // Cleanup after 20 min
  setTimeout(() => delete researchSessions[sessionId], 20 * 60 * 1000);
}

// ── Mock data generator for LinkedIn (no API key) ──────────
function generateMockLinkedInProfiles(jobTitles, industries, countries, limit) {
  const firstNames = ["James", "Sarah", "Michael", "Emily", "David", "Jessica", "Robert", "Ashley", "John", "Jennifer", "Rahul", "Priya", "Arjun", "Sneha"];
  const lastNames  = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Davis", "Miller", "Wilson", "Sharma", "Patel", "Kumar", "Singh"];
  const companies  = ["TechCorp", "InnovateSoft", "DataDriven Inc", "NextGen Solutions", "CloudBase", "ScaleUp", "GrowthLabs", "VentureIO", "SyncTech", "PivotHQ"];

  return Array.from({ length: Math.min(limit, 15) }, (_, i) => {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[i % lastNames.length];
    const company = companies[i % companies.length];
    const domain = company.toLowerCase().replace(/\s+/g, "") + ".com";
    return {
      fullName: `${fn} ${ln}`,
      firstName: fn, lastName: ln,
      jobTitle: jobTitles?.[i % (jobTitles?.length || 1)] || "CEO",
      companyName: company,
      companyDomain: domain,
      country: countries?.[0] || "United States",
      industry: industries?.[0] || "Technology",
      linkedinUrl: `https://linkedin.com/in/${fn.toLowerCase()}-${ln.toLowerCase()}-${Math.floor(Math.random() * 999)}`,
      isMock: true,
    };
  });
}

module.exports = router;
