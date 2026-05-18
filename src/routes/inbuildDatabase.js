"use strict";
// ============================================================
// IN BUILD - DATABASE ROUTE
// ============================================================
// GET  /api/inbuild-database          – paginated + filtered list
// GET  /api/inbuild-database/columns  – returns column names from the table
// POST /api/inbuild-database/ai-filter – natural language → structured filters
// ============================================================

const express = require("express");
const router  = express.Router();
const OpenAI  = require("openai");
const { supabase, SUPABASE_TABLE } = require("../config/supabase");
const logger = require("../utils/logger").forAgent("InBuildDatabase");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// ── Mock data for when Supabase is not configured ────────────
const MOCK_LEADS = Array.from({ length: 80 }, (_, i) => {
  const industries = ["SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce", "Cybersecurity", "AI/ML", "CleanTech"];
  const countries  = ["India", "United States", "United Kingdom", "Germany", "Canada", "Singapore", "Australia", "UAE"];
  const titles     = ["CEO", "CTO", "VP Engineering", "Head of Sales", "Founder", "COO", "Director of Marketing", "Product Manager"];
  const statuses   = ["new", "contacted", "replied", "qualified", "rejected"];
  const sources    = ["linkedin_finder", "email_finder", "auto_scraper", "ai_research", "manual"];
  const companies  = ["TechCorp", "DataFlow Inc", "CloudBase", "InnovateSoft", "NextGen Solutions", "ScaleUp Labs", "VentureIO", "PivotHQ", "NeuralNet Co", "QuantumEdge"];
  const firstNames = ["James", "Priya", "Michael", "Sarah", "Rahul", "Emily", "David", "Sneha", "John", "Arjun"];
  const lastNames  = ["Smith", "Patel", "Williams", "Johnson", "Sharma", "Brown", "Davis", "Singh", "Miller", "Kumar"];
  const fn = firstNames[i % firstNames.length];
  const ln = lastNames[i % lastNames.length];
  const company = companies[i % companies.length];
  return {
    id: `mock-${i + 1}`,
    full_name: `${fn} ${ln}`,
    first_name: fn,
    last_name: ln,
    email: `${fn.toLowerCase()}.${ln.toLowerCase()}@${company.toLowerCase().replace(/\s+/g, "")}.com`,
    phone: i % 3 === 0 ? `+1${Math.floor(1000000000 + Math.random() * 9000000000)}` : null,
    job_title: titles[i % titles.length],
    company_name: company,
    company_domain: `${company.toLowerCase().replace(/\s+/g, "")}.com`,
    industry: industries[i % industries.length],
    country: countries[i % countries.length],
    city: ["Mumbai", "New York", "London", "Berlin", "Toronto", "Singapore", "Sydney", "Dubai"][i % 8],
    linkedin_url: i % 4 !== 0 ? `https://linkedin.com/in/${fn.toLowerCase()}-${ln.toLowerCase()}-${i}` : null,
    status: statuses[i % statuses.length],
    source: sources[i % sources.length],
    is_mock: true,
    created_at: new Date(Date.now() - i * 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - i * 86400000).toISOString(),
  };
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /columns — Return discoverable column names
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/columns", async (req, res) => {
  if (!supabase) {
    const cols = Object.keys(MOCK_LEADS[0]);
    return res.json({ columns: cols, table: SUPABASE_TABLE, source: "mock" });
  }
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("*")
      .limit(1);
    if (error) throw new Error(error.message);
    const cols = data?.length ? Object.keys(data[0]) : [];
    res.json({ columns: cols, table: SUPABASE_TABLE, source: "supabase" });
  } catch (err) {
    logger.error(`[columns] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET / — Paginated, filtered lead list
// Query params:
//   page, limit, search, status, source, industry, country,
//   job_title, has_email, has_phone, date_from, date_to,
//   sort_by, sort_dir
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", async (req, res) => {
  const {
    page      = 1,
    limit     = 50,
    search    = "",
    status    = "",
    source    = "",
    industry  = "",
    country   = "",
    job_title = "",
    has_email = "",
    has_phone = "",
    date_from = "",
    date_to   = "",
    sort_by   = "created_at",
    sort_dir  = "desc",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  // ── Supabase path ───────────────────────────────────────────
  if (supabase) {
    try {
      let query = supabase.from(SUPABASE_TABLE).select("*", { count: "exact" });

      // Text search across common name/email/company columns
      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%,job_title.ilike.%${search}%`
        );
      }

      if (status)    query = query.eq("status", status);
      if (source)    query = query.eq("source", source);
      if (industry)  query = query.ilike("industry", `%${industry}%`);
      if (country)   query = query.ilike("country", `%${country}%`);
      if (job_title) query = query.ilike("job_title", `%${job_title}%`);
      if (has_email === "true")  query = query.not("email", "is", null).neq("email", "");
      if (has_email === "false") query = query.is("email", null);
      if (has_phone === "true")  query = query.not("phone", "is", null).neq("phone", "");
      if (has_phone === "false") query = query.is("phone", null);
      if (date_from) query = query.gte("created_at", date_from);
      if (date_to)   query = query.lte("created_at", date_to);

      const ascending = sort_dir === "asc";
      query = query.order(sort_by, { ascending }).range(offset, offset + limitNum - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      return res.json({
        leads: data || [],
        total: count || 0,
        page: pageNum,
        pages: Math.ceil((count || 0) / limitNum),
        source: "supabase",
      });
    } catch (err) {
      logger.error(`[GET /] Supabase error: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Mock data fallback path ─────────────────────────────────
  let filtered = [...MOCK_LEADS];

  if (search) {
    const re = new RegExp(search, "i");
    filtered = filtered.filter(l =>
      re.test(l.full_name) || re.test(l.email) || re.test(l.company_name) || re.test(l.job_title)
    );
  }
  if (status)    filtered = filtered.filter(l => l.status === status);
  if (source)    filtered = filtered.filter(l => l.source === source);
  if (industry)  filtered = filtered.filter(l => l.industry?.toLowerCase().includes(industry.toLowerCase()));
  if (country)   filtered = filtered.filter(l => l.country?.toLowerCase().includes(country.toLowerCase()));
  if (job_title) filtered = filtered.filter(l => l.job_title?.toLowerCase().includes(job_title.toLowerCase()));
  if (has_email === "true")  filtered = filtered.filter(l => !!l.email);
  if (has_email === "false") filtered = filtered.filter(l => !l.email);
  if (has_phone === "true")  filtered = filtered.filter(l => !!l.phone);
  if (has_phone === "false") filtered = filtered.filter(l => !l.phone);
  if (date_from) filtered = filtered.filter(l => new Date(l.created_at) >= new Date(date_from));
  if (date_to)   filtered = filtered.filter(l => new Date(l.created_at) <= new Date(date_to));

  // Sort
  filtered.sort((a, b) => {
    const av = a[sort_by] ?? "";
    const bv = b[sort_by] ?? "";
    return sort_dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const total = filtered.length;
  const page_data = filtered.slice(offset, offset + limitNum);

  res.json({
    leads: page_data,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    source: "mock",
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /ai-filter — Natural language → structured filters
// Body: { query: "CTOs from India with email added last 30 days" }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/ai-filter", async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(422).json({ error: "query is required" });

  try {
    const today = new Date().toISOString().split("T")[0];
    const systemPrompt = `You are a lead database filter assistant. Convert the user's natural language query into structured filter parameters.
Today's date: ${today}

Return ONLY valid JSON with any of these optional keys (omit keys that aren't mentioned):
{
  "search": "string",          // general text search across name/email/company
  "status": "new|contacted|replied|qualified|rejected",
  "source": "linkedin_finder|email_finder|auto_scraper|ai_research|places_scraper|manual",
  "industry": "string",        // e.g. "SaaS", "FinTech"
  "country": "string",         // e.g. "India", "United States"
  "job_title": "string",       // keyword for job title e.g. "CTO", "VP"
  "has_email": "true|false",
  "has_phone": "true|false",
  "date_from": "YYYY-MM-DD",  // calculate relative dates (e.g. "last 30 days")
  "date_to": "YYYY-MM-DD",
  "sort_by": "created_at|full_name|company_name|job_title|country",
  "sort_dir": "asc|desc",
  "summary": "string"          // one sentence explaining what you understood
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });

    const filters = JSON.parse(response.choices[0].message.content);
    logger.info(`[ai-filter] Query: "${query}" → ${JSON.stringify(filters)}`);
    res.json({ filters, query });
  } catch (err) {
    logger.error(`[ai-filter] ${err.message}`);
    res.status(500).json({ error: "AI filter failed: " + err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /stats — Aggregate counts for the stats bar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/stats", async (req, res) => {
  if (!supabase) {
    return res.json({
      total: MOCK_LEADS.length,
      with_email: MOCK_LEADS.filter(l => !!l.email).length,
      with_phone: MOCK_LEADS.filter(l => !!l.phone).length,
      new: MOCK_LEADS.filter(l => l.status === "new").length,
      qualified: MOCK_LEADS.filter(l => l.status === "qualified").length,
      source: "mock",
    });
  }
  try {
    const { count: total } = await supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true });
    const { count: with_email } = await supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true }).not("email", "is", null).neq("email", "");
    const { count: with_phone } = await supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true }).not("phone", "is", null).neq("phone", "");
    const { count: new_leads } = await supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true }).eq("status", "new");
    const { count: qualified } = await supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true }).eq("status", "qualified");
    res.json({ total, with_email, with_phone, new: new_leads, qualified, source: "supabase" });
  } catch (err) {
    logger.error(`[stats] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
