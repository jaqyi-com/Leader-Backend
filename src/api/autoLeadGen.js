"use strict";
// ============================================================
// AUTO LEAD GENERATOR — Multi-Source Pipeline
// Stage 1: GPT-4o → ICP + search strategy
// Stage 2: 3 parallel sources:
//   A. Apollo.io     — B2B contacts DB (verified emails + job titles)
//   B. Google Places — real local businesses (phone, address, website)
//   C. Google CSE    — open web search + full page scraper
// Stage 3: Hunter.io email enrichment for leads missing emails
// Stage 4: GPT-4o-mini strict relevance scoring (0-100)
// Stage 5: Save to database
// ============================================================

const express = require("express");
const router  = express.Router();
const OpenAI  = require("openai");
const axios   = require("axios");

const { GeneratedLead }      = require("../db/mongoose");
const apollo                  = require("../integrations/ApolloIntegration");
const googlePlaces            = require("../services/GoogleSearchService");
const { buildWebsiteRecord }  = require("../services/WebsiteCrawlerService");
const logger                  = require("../utils/logger").forAgent("AutoLeadGen");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// In-memory sessions
const sessions = {};

// ── Hunter.io email finder ───────────────────────────────────
async function hunterFindEmail(domain, firstName, lastName) {
  const key = process.env.HUNTER_API_KEY;
  if (!key || !domain) return null;
  try {
    const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName || "")}&last_name=${encodeURIComponent(lastName || "")}&api_key=${key}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return data?.data?.email || null;
  } catch { return null; }
}

// ── Hunter.io domain search (get all emails for a domain) ───
async function hunterDomainSearch(domain) {
  const key = process.env.HUNTER_API_KEY;
  if (!key || !domain) return [];
  try {
    const url  = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=5&api_key=${key}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return (data?.data?.emails || []).map(e => e.value).filter(Boolean);
  } catch { return []; }
}

// ── Google Custom Search (fallback web search) ───────────────
async function googleCSE(query, num = 8) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx     = process.env.GOOGLE_SEARCH_CX;
  if (!apiKey || !cx) return [];
  try {
    const params = new URLSearchParams({ key: apiKey, cx, q: query, num: Math.min(num, 10) });
    const res  = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    return (data.items || []).map(i => ({ title: i.title, url: i.link, snippet: i.snippet }));
  } catch { return []; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/start", async (req, res) => {
  const { description, maxAgeHours = 0, resultCount = 20 } = req.body;
  if (!description?.trim()) return res.status(422).json({ error: "description is required" });

  const sessionId = require("crypto").randomUUID();
  sessions[sessionId] = { logs: [], status: "running", leads: [] };

  runPipeline(sessionId, description.trim(), parseInt(resultCount) || 20)
    .catch(err => {
      if (sessions[sessionId]) {
        sessions[sessionId].status = "failed";
        sessions[sessionId].logs.push(`❌ Fatal error: ${err.message}`);
      }
      logger.error(`Pipeline crashed: ${err.message}`);
    });

  res.json({ sessionId });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /status/:sessionId — SSE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/status/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let idx = 0;
  const flush = () => {
    while (idx < session.logs.length) {
      res.write(`data: ${JSON.stringify({ log: session.logs[idx] })}\n\n`);
      idx++;
    }
    if (session.status === "done" || session.status === "failed") {
      res.write(`data: ${JSON.stringify({ status: session.status, leads: session.leads })}\n\n`);
      clearInterval(timer); clearInterval(hb); res.end();
    }
  };
  const timer = setInterval(flush, 400);
  flush();
  const hb = setInterval(() => res.write(": hb\n\n"), 15000);
  req.on("close", () => { clearInterval(timer); clearInterval(hb); });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PIPELINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runPipeline(sessionId, userDescription, resultCount) {
  const session = sessions[sessionId];
  const log = msg => session.logs.push(msg);

  log(`🚀 Auto Lead Generator started`);
  log(`📋 Goal: "${userDescription}"`);
  log(`🌐 Sources: Apollo.io · Google Places · Web Scraper · Hunter.io`);
  log(`🎯 Target: ${resultCount} leads`);

  // ── STAGE 1: AI → ICP ──────────────────────────────────────
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`🧠 Stage 1: Building Ideal Customer Profile...`);

  let plan;
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o", temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{
        role: "system",
        content: `You are a world-class B2B lead generation strategist. Analyze the user's prospect description and produce a detailed ICP.

Return ONLY valid JSON:
{
  "customerType": "string",
  "industry": "string",
  "painPoint": "string",
  "apolloKeywords": ["string"],        // 3-5 industry/tech keywords for Apollo company search (e.g. "restaurant", "retail")
  "apolloTitles": ["string"],          // 2-4 decision-maker job titles (e.g. "CEO", "Owner", "Founder")
  "placesQueries": ["string"],         // 2-4 Google Places queries (e.g. "restaurant", "retail store", "dental clinic")
  "webSearchQueries": ["string"],      // 2-3 open-web queries (NO site: operators) targeting company contact pages
  "disqualifiers": ["string"],         // 3-5 words that disqualify a lead (e.g. if looking for "website buyers" → disqualify "web agency", "web designer", "web developer")
  "contactRoles": ["string"],
  "rationale": "string"
}

IMPORTANT for disqualifiers: Think carefully about who you do NOT want.
Example: user wants "businesses that need a website" → disqualify ["web agency", "web designer", "web developer", "digital agency", "website builder"]
Example: user wants "people who need CRM" → disqualify ["CRM vendor", "CRM provider", "Salesforce", "HubSpot"]`,
      }, { role: "user", content: userDescription }],
    });
    plan = JSON.parse(r.choices[0].message.content);
  } catch (err) {
    log(`❌ Stage 1 failed: ${err.message}`);
    session.status = "failed"; return;
  }

  log(`✅ Customer type: ${plan.customerType}`);
  log(`🏭 Industry: ${plan.industry}`);
  log(`💡 Pain point: ${plan.painPoint}`);
  log(`🚫 Will disqualify: ${(plan.disqualifiers || []).join(", ")}`);
  log(`📌 Strategy: ${plan.rationale}`);

  const candidateLeads = []; // raw candidates before scoring
  const seenDomains = new Set();

  // ── STAGE 2A: Apollo.io ────────────────────────────────────
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`🔵 Stage 2A: Apollo.io — Searching B2B contact database...`);
  try {
    const companies = await apollo.searchCompanies(plan.apolloKeywords || [plan.industry]);
    log(`   Found ${companies.length} companies in Apollo`);

    for (const company of companies.slice(0, 15)) {
      if (!company.domain || seenDomains.has(company.domain)) continue;
      seenDomains.add(company.domain);

      // Get decision makers
      const people = await apollo.searchPeople(company.domain, plan.apolloTitles || ["CEO", "Owner", "Founder"]);
      for (const person of people.slice(0, 2)) {
        // Try Hunter.io to get/verify email if Apollo didn't provide one
        let email = person.email;
        if (!email && person.firstName && company.domain) {
          email = await hunterFindEmail(company.domain, person.firstName, person.lastName);
        }
        candidateLeads.push({
          _source: "apollo",
          fullName:       person.name,
          jobTitle:       person.title,
          companyName:    company.name,
          companyWebsite: company.website || `https://${company.domain}`,
          email:          email || null,
          phone:          person.phone || null,
          linkedin:       person.linkedinUrl || null,
          industry:       company.industry || plan.industry,
          country:        person.country || company.headquarters?.split(",").pop()?.trim() || null,
          city:           person.city || null,
          techStack:      (company.technologies || []).slice(0, 5).join(", ") || null,
          _context:       `${company.description || ""} | ${company.keywords?.join(", ") || ""}`,
        });
      }

      if (candidateLeads.length >= resultCount * 3) break;
    }
    log(`   ✅ Apollo collected ${candidateLeads.length} candidates`);
  } catch (err) {
    log(`   ⚠ Apollo search error: ${err.message}`);
  }

  // ── STAGE 2B: Google Places ────────────────────────────────
  log(`\n🟢 Stage 2B: Google Places — Searching real local businesses...`);
  try {
    const queries = (plan.placesQueries || [plan.industry]).slice(0, 3);
    for (const q of queries) {
      log(`   📍 Places search: "${q}"`);
      const urls = await googlePlaces.discoverUrls(q, null, 20);
      log(`   Found ${urls.length} business URLs`);

      for (const url of urls.slice(0, 10)) {
        let domain;
        try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
        if (seenDomains.has(domain)) continue;
        seenDomains.add(domain);

        log(`   🕷 Scraping: ${url.slice(0, 60)}...`);
        let scraped = null;
        try { scraped = await buildWebsiteRecord(url, plan.apolloKeywords || []); } catch {}
        if (!scraped || scraped.fetch_failed) { log(`   ⚠ Blocked/empty`); continue; }

        // Try Hunter.io for email if scraper didn't find one
        let email = scraped.contact_email;
        if (!email) {
          const hunterEmails = await hunterDomainSearch(domain);
          email = hunterEmails[0] || null;
          if (email) log(`   📧 Hunter found: ${email}`);
        }

        if (email || scraped.phone_number) {
          log(`   ✨ Got: ${[email, scraped.phone_number].filter(Boolean).join(" | ")}`);
        }

        candidateLeads.push({
          _source: "google_places",
          fullName:       scraped.developer_name && scraped.developer_name !== "data is not present" ? scraped.developer_name : null,
          companyName:    scraped.brand_name || domain,
          companyWebsite: url,
          email,
          phone:          scraped.phone_number || null,
          linkedin:       scraped.linkedin_url || null,
          industry:       plan.industry,
          techStack:      scraped.technology_stack || null,
          _context:       `${scraped.website_title || ""} ${scraped.short_description || ""} ${scraped.html_text?.slice(0, 500) || ""}`,
        });

        if (candidateLeads.length >= resultCount * 4) break;
      }
      if (candidateLeads.length >= resultCount * 4) break;
    }
    log(`   ✅ Places collected ${candidateLeads.length} total candidates so far`);
  } catch (err) {
    log(`   ⚠ Google Places error: ${err.message}`);
  }

  // ── STAGE 2C: Google CSE + Web Scraper ────────────────────
  log(`\n🟡 Stage 2C: Web Scraper — Open web search...`);
  try {
    const webQueries = (plan.webSearchQueries || []).slice(0, 3);
    for (const q of webQueries) {
      log(`   🔎 Search: "${q}"`);
      const results = await googleCSE(q, 8);
      if (!results.length) { log(`   ⚠ No results`); continue; }
      log(`   📄 ${results.length} pages found`);

      for (const result of results) {
        let domain;
        try { domain = new URL(result.url).hostname.replace(/^www\./, ""); } catch { continue; }
        if (seenDomains.has(domain)) continue;
        seenDomains.add(domain);

        log(`   🕷 Scraping: ${result.url.slice(0, 60)}...`);
        let scraped = null;
        try { scraped = await buildWebsiteRecord(result.url, plan.apolloKeywords || []); } catch {}
        if (!scraped || scraped.fetch_failed) continue;

        let email = scraped.contact_email;
        if (!email) {
          const hEmails = await hunterDomainSearch(domain);
          email = hEmails[0] || null;
        }

        const found = [email, scraped.phone_number].filter(Boolean);
        if (found.length) log(`   ✨ Found: ${found.join(" | ")}`);

        candidateLeads.push({
          _source: "web_scraper",
          fullName:       null,
          companyName:    scraped.brand_name || domain,
          companyWebsite: result.url,
          email,
          phone:          scraped.phone_number || null,
          linkedin:       scraped.linkedin_url || null,
          industry:       plan.industry,
          techStack:      scraped.technology_stack || null,
          _context:       `${result.title || ""} ${result.snippet || ""} ${scraped.html_text?.slice(0, 500) || ""}`,
        });
        if (candidateLeads.length >= resultCount * 5) break;
      }
      if (candidateLeads.length >= resultCount * 5) break;
    }
  } catch (err) {
    log(`   ⚠ Web scraper error: ${err.message}`);
  }

  log(`\n📦 Total candidates collected: ${candidateLeads.length}`);

  // ── STAGE 3: GPT Strict Scoring ───────────────────────────
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`🤖 Stage 3: AI scoring & strict filtering...`);
  log(`   Evaluating ${candidateLeads.length} candidates...`);

  const scoredLeads = [];
  // Score in batches of 5 to save tokens
  const batchSize = 5;
  for (let i = 0; i < candidateLeads.length && scoredLeads.length < resultCount; i += batchSize) {
    const batch = candidateLeads.slice(i, i + batchSize);
    try {
      const r = await openai.chat.completions.create({
        model: "gpt-4o-mini", temperature: 0,
        response_format: { type: "json_object" },
        messages: [{
          role: "system",
          content: `You are a strict lead qualification expert. The user wants: "${userDescription}"

Customer profile:
- Type: ${plan.customerType}
- Industry: ${plan.industry}  
- Pain point: ${plan.painPoint}
- DISQUALIFY any lead matching: ${(plan.disqualifiers || []).join(", ")}

Score each candidate 0-100 for how well they match the user's ACTUAL need.
Be VERY strict — only score ≥ 60 if the candidate genuinely matches.
If the candidate is in the disqualifier list, score = 0.

Return ONLY valid JSON:
{
  "scores": [
    { "idx": 0, "score": 0-100, "reason": "1 sentence", "jobTitle": "inferred or null", "country": "inferred or null", "city": "inferred or null" }
  ]
}`,
        }, {
          role: "user",
          content: `Evaluate these ${batch.length} candidates:\n\n` + batch.map((c, idx) =>
            `[${idx}] Company: ${c.companyName} | Title: ${c.jobTitle || "?"} | Industry: ${c.industry} | Source: ${c._source}\nContext: ${(c._context || "").slice(0, 300)}`
          ).join("\n\n"),
        }],
      });

      const result = JSON.parse(r.choices[0].message.content);
      for (const s of (result.scores || [])) {
        if (s.score >= 60 && s.idx < batch.length) {
          const c = batch[s.idx];
          const lead = {
            fullName:       c.fullName || null,
            jobTitle:       c.jobTitle || s.jobTitle || null,
            companyName:    c.companyName,
            companyWebsite: c.companyWebsite,
            email:          c.email || null,
            phone:          c.phone || null,
            linkedin:       c.linkedin || null,
            industry:       c.industry,
            country:        c.country || s.country || null,
            city:           c.city || s.city || null,
            techStack:      c.techStack || null,
            researchNotes:  `${s.reason} (Score: ${s.score}/100, Source: ${c._source})`,
          };
          scoredLeads.push(lead);
          log(`   ✅ [Source: ${c._source}] ${c.companyName || "Lead"} — ${s.score}/100 | ${s.reason}`);
        }
      }
    } catch (err) {
      log(`   ⚠ Scoring batch failed: ${err.message}`);
    }
    if (scoredLeads.length >= resultCount) break;
  }

  // ── STAGE 4: Save ─────────────────────────────────────────
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`💾 Saving ${scoredLeads.length} qualified leads...`);

  const toSave = scoredLeads.map(l => ({ ...l, source: "auto_lead_gen", sourceQuery: userDescription, status: "new" }));
  try {
    await GeneratedLead.insertMany(toSave, { ordered: false });
    log(`✅ ${scoredLeads.length} leads saved to Lead Database`);
  } catch {
    log(`✅ Leads saved (some deduplicated)`);
  }

  session.leads = scoredLeads;
  session.status = "done";
  log(`\n🎉 Done! ${scoredLeads.length} qualified leads found`);
  log(`📊 View them in Lead Database → filter by source "Auto Lead Gen"`);

  setTimeout(() => delete sessions[sessionId], 30 * 60 * 1000);
}

module.exports = router;
