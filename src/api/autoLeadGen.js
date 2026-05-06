"use strict";
// ============================================================
// AUTO LEAD GENERATOR API
// ============================================================
// Three-stage AI pipeline:
//   Stage 1 — GPT-4o converts user intent into targeted search queries
//   Stage 2 — Google Custom Search API fetches articles, then
//              WebsiteCrawlerService.buildWebsiteRecord() scrapes each page
//              (extracts real emails, phones, social links, tech stack, etc.)
//   Stage 3 — GPT-4o scores & enriches leads from structured crawler data
//
// Routes:
//   POST /start          { description, maxAgeHours, resultCount }  → { sessionId }
//   GET  /status/:id     SSE stream → { log, leads, status }
//   GET  /sessions        list of past sessions
// ============================================================

const express = require("express");
const router  = express.Router();
const { URL } = require("url");
const OpenAI  = require("openai");
const { GeneratedLead }       = require("../db/mongoose");
const { buildWebsiteRecord }  = require("../services/WebsiteCrawlerService");
const logger  = require("../utils/logger").forAgent("AutoLeadGen");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// In-memory sessions — { [sessionId]: { logs[], status, leads[] } }
const sessions = {};

// ── Date restrict mapping for Google Custom Search API ──────
const AGE_TO_DATE_RESTRICT = {
  1:    "d1",    // last 1 hour  → d[n] = last n days (min granularity is day)
  6:    "d1",    // last 6 hours → d1 (closest available)
  24:   "d1",    // last 24 hours
  72:   "d3",    // last 3 days
  168:  "w1",    // last 7 days
  720:  "m1",    // last 30 days
  // 0 = no restriction (Any time)
};

// ── Google Custom Search API call ───────────────────────────
async function googleSearch(query, dateRestrict, num = 8) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx     = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) return null; // signal "no key → fail early"

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: Math.min(num, 10),
  });
  if (dateRestrict) params.append("dateRestrict", dateRestrict);

  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    const data = await res.json();
    return (data.items || []).map(item => ({
      title:   item.title,
      url:     item.link,
      snippet: item.snippet,
    }));
  } catch (err) {
    logger.warn(`[AutoLeadGen] Google search failed: ${err.message}`);
    return [];
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/start", async (req, res) => {
  const { description, maxAgeHours = 0, resultCount = 20 } = req.body;
  if (!description?.trim()) {
    return res.status(422).json({ error: "description is required" });
  }

  const sessionId = require("crypto").randomUUID();
  sessions[sessionId] = { logs: [], status: "running", leads: [] };

  runPipeline(sessionId, description.trim(), parseInt(maxAgeHours) || 0, parseInt(resultCount) || 20)
    .catch(err => {
      sessions[sessionId].status = "failed";
      sessions[sessionId].logs.push(`❌ Fatal error: ${err.message}`);
      logger.error(`[AutoLeadGen] Pipeline crashed: ${err.message}`);
    });

  res.json({ sessionId });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /status/:sessionId — SSE stream
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/status/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  let lastIdx = 0;
  const flush = () => {
    while (lastIdx < session.logs.length) {
      res.write(`data: ${JSON.stringify({ log: session.logs[lastIdx] })}\n\n`);
      lastIdx++;
    }
    if (session.status === "done" || session.status === "failed") {
      res.write(`data: ${JSON.stringify({ status: session.status, leads: session.leads })}\n\n`);
      clearInterval(timer);
      clearInterval(hb);
      res.end();
    }
  };

  const timer = setInterval(flush, 500);
  flush();
  const hb = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  req.on("close", () => { clearInterval(timer); clearInterval(hb); });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runPipeline(sessionId, userDescription, maxAgeHours, resultCount) {
  const session = sessions[sessionId];
  const log = (msg) => session.logs.push(msg);
  const dateRestrict = AGE_TO_DATE_RESTRICT[maxAgeHours] || null;

  const hasGoogle = !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX);

  if (!hasGoogle) {
    log(`❌ Google Search API keys are not configured.`);
    log(`   Add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX to your .env file.`);
    log(`   Get your Search Engine ID at: https://programmablesearchengine.google.com`);
    session.status = "failed";
    return;
  }

  log(`🚀 Auto Lead Generator started`);
  log(`📋 Goal: "${userDescription}"`);
  log(`🌐 Mode: Web Search + Full Page Scraper + AI Extraction`);
  if (dateRestrict) log(`📅 Date filter: results from last ${maxAgeHours}h`);
  log(`🎯 Target: ${resultCount} leads`);

  // ── STAGE 1: Build search queries ──────────────────────────
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`🧠 Stage 1: Analyzing your requirement with AI...`);

  const stage1Response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [{
      role: "system",
      content: `You are a world-class B2B lead generation expert and search strategist.

A user will describe a type of customer/business they want to find. Your job is to:
1. Deeply understand the ACTUAL need (not just surface words)
2. Generate highly targeted search queries to find these exact prospects online
3. Extract a crystal-clear Ideal Customer Profile (ICP)

Return ONLY valid JSON:
{
  "customerType": "string",           // e.g. "Small business owners managing customers in Excel"
  "industry": "string",               // primary industry e.g. "Retail & E-commerce"  
  "painPoint": "string",              // core pain being solved e.g. "Needs CRM to replace spreadsheets"
  "searchQueries": ["string"],        // 4-6 Google search queries that would surface these prospects
  "identifierKeywords": ["string"],   // 3-5 keywords that IDENTIFY a qualified lead in article text
  "disqualifierKeywords": ["string"], // 2-3 keywords that mean NOT a good fit (e.g. "enterprise", "Fortune 500")
  "contactRoles": ["string"],         // 2-3 decision-maker titles e.g. ["CEO", "Operations Manager"]
  "rationale": "string"              // 2 sentences explaining the search strategy
}

CRITICAL RULES for searchQueries:
- Each query must be a realistic Google search that returns articles/directories/forums with REAL companies
- Use quotes for exact phrases where needed
- Mix different angles: pain-based, intent-based, forum-based, directory-based
- Examples for "solar panels for home": 
  "homeowners interested in solar installation site:reddit.com OR site:quora.com",
  "residential solar panel leads database 2024",
  "solar energy leads homeowners contact list",
  "people asking about home solar installation",
  "solar panel inquiry form companies"`,
    }, {
      role: "user",
      content: userDescription,
    }],
  });

  const plan = JSON.parse(stage1Response.choices[0].message.content);
  log(`✅ Customer type: ${plan.customerType}`);
  log(`🏭 Industry: ${plan.industry}`);
  log(`💡 Pain point: ${plan.painPoint}`);
  log(`🔍 Generated ${plan.searchQueries?.length || 0} search queries`);
  log(`📌 Strategy: ${plan.rationale}`);

  const allLeads = [];

  // ── STAGE 2: Google Search → Full Page Scraper ─────────────
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`🌐 Stage 2: Searching the web & scraping pages...`);
  log(`🕷 Using full web scraper (emails, phones, social links, tech stack)`);

  const queries  = (plan.searchQueries || []).slice(0, 5);
  const seenUrls = new Set();

  for (let qi = 0; qi < queries.length; qi++) {
    const query = queries[qi];
    log(`\n🔎 Query ${qi + 1}/${queries.length}: "${query}"`);

    const results = await googleSearch(query, dateRestrict, 8);
    if (!results || results.length === 0) {
      log(`   ⚠ No results for this query`);
      continue;
    }
    log(`   📄 Found ${results.length} pages`);

    for (const result of results) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);

      log(`   🕷 Scraping: ${result.url.slice(0, 70)}...`);

      // ── Use WebsiteCrawlerService for rich structured extraction ──
      let crawledData = null;
      try {
        crawledData = await buildWebsiteRecord(result.url, plan.identifierKeywords || []);
      } catch (e) {
        log(`   ⚠ Scraper error: ${e.message}`);
      }

      if (!crawledData || crawledData.fetch_failed) {
        log(`   ⚠ Could not scrape page (blocked/timeout)`);
        continue;
      }

      // Log what the scraper found
      const found = [];
      if (crawledData.contact_email)  found.push(`📧 ${crawledData.contact_email}`);
      if (crawledData.phone_number)   found.push(`📞 ${crawledData.phone_number}`);
      if (crawledData.linkedin_url)   found.push(`🔗 LinkedIn`);
      if (crawledData.framework_used) found.push(`⚙ ${crawledData.framework_used}`);
      if (found.length) log(`   ✨ Scraped: ${found.join(" | ")}`);

      // ── Stage 3: Score & enrich with AI ──────────────────────
      const pageLeads = await extractLeadsFromPage(
        crawledData,
        result.url,
        result.title,
        result.snippet,
        userDescription,
        plan,
        log
      );

      for (const lead of pageLeads) {
        allLeads.push(lead);
        if (allLeads.length >= resultCount) break;
      }

      if (allLeads.length >= resultCount) break;
    }

    if (allLeads.length >= resultCount) {
      log(`\n✅ Reached target of ${resultCount} leads`);
      break;
    }
  }

  // ── STAGE 3: Save to database ─────────────────────────────
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`💾 Stage 3: Saving ${allLeads.length} leads to database...`);

  let savedCount = 0;
  const toSave = allLeads.map(lead => ({
    ...lead,
    source: "auto_lead_gen",
    sourceQuery: userDescription,
    status: "new",
  }));

  try {
    const inserted = await GeneratedLead.insertMany(toSave, { ordered: false });
    savedCount = Array.isArray(inserted) ? inserted.length : 0;
    log(`✅ ${savedCount} leads saved to Lead Database`);
  } catch (e) {
    // Partial duplicates are OK
    savedCount = allLeads.length;
    log(`✅ Leads saved (some may have been deduplicated)`);
  }

  session.leads = allLeads;
  session.status = "done";

  log(`\n🎉 Done! ${allLeads.length} leads found · ${savedCount} saved to database`);
  log(`📊 View them in Lead Database → filter by source "Auto Lead Gen"`);

  // Cleanup session after 30 min
  setTimeout(() => delete sessions[sessionId], 30 * 60 * 1000);
}

// ── Extract & score leads from a single scraped page ────────
async function extractLeadsFromPage(crawledData, url, title, snippet, userGoal, plan, log) {
  try {
    // Build a rich context string combining crawler-extracted structured data + page text
    const structuredContext = [
      crawledData.brand_name       ? `Company: ${crawledData.brand_name}`           : null,
      crawledData.website_title    ? `Page Title: ${crawledData.website_title}`      : null,
      crawledData.short_description? `Description: ${crawledData.short_description}` : null,
      crawledData.contact_email    ? `Email: ${crawledData.contact_email}`            : null,
      crawledData.phone_number     ? `Phone: ${crawledData.phone_number}`             : null,
      crawledData.developer_name && crawledData.developer_name !== "data is not present"
                                   ? `Developer/Attribution: ${crawledData.developer_name}` : null,
      crawledData.developer_email && crawledData.developer_email !== "data is not present"
                                   ? `Developer Email: ${crawledData.developer_email}`      : null,
      crawledData.linkedin_url     ? `LinkedIn: ${crawledData.linkedin_url}`          : null,
      crawledData.twitter_url      ? `Twitter: ${crawledData.twitter_url}`            : null,
      crawledData.facebook_url     ? `Facebook: ${crawledData.facebook_url}`          : null,
      crawledData.framework_used   ? `Framework: ${crawledData.framework_used}`       : null,
      crawledData.technology_stack ? `Tech Stack: ${crawledData.technology_stack}`    : null,
      crawledData.hosting_provider ? `Hosting: ${crawledData.hosting_provider}`       : null,
      crawledData.website_language ? `Language: ${crawledData.website_language}`      : null,
    ].filter(Boolean).join("\n");

    // Page text for GPT context (trimmed)
    const pageText = (crawledData.html_text || crawledData.dom_data || "").slice(0, 3000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{
        role: "system",
        content: `You are a lead extraction expert. A user wants to find: "${userGoal}"

Target customer profile:
- Customer type: ${plan.customerType}
- Industry: ${plan.industry}
- Pain point: ${plan.painPoint}
- Decision maker roles: ${plan.contactRoles?.join(", ")}
- DISQUALIFY if these words appear: ${plan.disqualifierKeywords?.join(", ")}

You will receive BOTH:
1. STRUCTURED DATA — already extracted from the page by a web scraper (emails, phones, social links, tech stack, etc.)
2. PAGE TEXT — raw text content from the page

Your job:
- Determine if this page/company is a GENUINE match for the user's requirement
- Extract any additional contact/company details NOT already in the structured data
- Score the lead on relevance (0-100)

Return ONLY valid JSON:
{
  "leads": [
    {
      "fullName": "string or null",
      "jobTitle": "string or null",
      "companyName": "string or null",
      "companyWebsite": "string or null",
      "email": "string or null",
      "phone": "string or null",
      "linkedin": "string or null",
      "industry": "string or null",
      "country": "string or null",
      "city": "string or null",
      "techStack": "string or null",
      "relevanceScore": 0-100,
      "relevanceReason": "string (1 sentence why this is a good lead)",
      "sourceUrl": "string"
    }
  ]
}

CRITICAL:
- Only include leads with relevanceScore >= 55
- If no genuine match found, return { "leads": [] }
- Maximum 5 leads per page
- For email/phone/linkedin: use the STRUCTURED DATA values first, only override if page text has something better
- Set sourceUrl to the page URL`
      }, {
        role: "user",
        content: `Page URL: ${url}
Page Title: ${title}
Snippet: ${snippet}

=== STRUCTURED DATA (from web scraper) ===
${structuredContext || "(none extracted)"}

=== PAGE TEXT ===
${pageText}`,
      }],
    });

    const result = JSON.parse(response.choices[0].message.content);
    const leads  = (result.leads || []).filter(l => l.relevanceScore >= 55);

    if (leads.length > 0) {
      log(`   ✅ Found ${leads.length} qualified lead(s) from this page`);
      for (const l of leads) {
        const name = l.fullName || l.companyName || "Unknown";
        log(`      • ${name} — Score: ${l.relevanceScore}/100 | ${l.relevanceReason}`);
      }
    }

    return leads.map(l => ({
      fullName:        l.fullName        || null,
      jobTitle:        l.jobTitle        || null,
      companyName:     l.companyName     || crawledData.brand_name || null,
      companyWebsite:  l.companyWebsite  || url,
      // Prefer scraper-extracted contact info — it's more reliable than GPT guesses
      email:           crawledData.contact_email   || crawledData.developer_email?.replace("data is not present", "") || l.email || null,
      phone:           crawledData.phone_number    || crawledData.developer_phone?.replace("data is not present", "") || l.phone || null,
      linkedin:        crawledData.linkedin_url    || l.linkedin  || null,
      industry:        l.industry        || plan.industry || null,
      country:         l.country         || null,
      city:            l.city            || null,
      techStack:       l.techStack       || crawledData.technology_stack || null,
      researchNotes: `${l.relevanceReason} (Score: ${l.relevanceScore}/100, Source: ${l.sourceUrl || url})`,
    }));

  } catch (e) {
    log(`   ⚠ Extraction error for page: ${e.message}`);
    return [];
  }
}



module.exports = router;
