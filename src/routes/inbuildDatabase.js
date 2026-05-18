"use strict";
// ============================================================
// IN BUILD - DATABASE ROUTE
// ============================================================
const express = require("express");
const router  = express.Router();
const OpenAI  = require("openai");
const { supabase, SUPABASE_TABLE } = require("../config/supabase");
const logger = require("../utils/logger").forAgent("InBuildDatabase");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /columns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/columns", async (req, res) => {
  if (!supabase) return res.json({ columns: [], table: SUPABASE_TABLE, source: "mock" });
  try {
    const { data, error } = await supabase.from(SUPABASE_TABLE).select("*").limit(1);
    if (error) throw new Error(error.message);
    const cols = data?.length ? Object.keys(data[0]) : [];
    res.json({ columns: cols, table: SUPABASE_TABLE, source: "supabase" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", async (req, res) => {
  const {
    page      = 1,
    limit     = 50,
    search    = "",
    category  = "",
    city      = "",
    has_phone = "",
    has_website = "",
    sort_by   = "id",
    sort_dir  = "asc",
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  if (supabase) {
    try {
      let query = supabase.from(SUPABASE_TABLE).select("*", { count: "exact" });

      if (search) {
        query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%,phone.ilike.%${search}%,category.ilike.%${search}%`);
      }
      if (category) query = query.ilike("category", `%${category}%`);
      if (city)     query = query.ilike("city_file", `%${city}%`);
      if (has_phone === "true")  query = query.not("phone", "is", null).neq("phone", "");
      if (has_phone === "false") query = query.or("phone.is.null,phone.eq.");
      if (has_website === "true")  query = query.not("website", "is", null).neq("website", "");
      if (has_website === "false") query = query.or("website.is.null,website.eq.");

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
      return res.status(500).json({ error: err.message });
    }
  }
  return res.json({ leads: [], total: 0, page: 1, pages: 1, source: "mock" });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /ai-filter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/ai-filter", async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(422).json({ error: "query is required" });

  try {
    const systemPrompt = `You are a database filter assistant. Convert the user's natural language query into structured filter parameters for a business dataset.

Return ONLY valid JSON with any of these optional keys (omit keys that aren't mentioned):
{
  "search": "string",          // general text search across name/address/phone
  "category": "string",        // e.g. "Legal services", "Nail salons"
  "city": "string",            // e.g. "San Antonio", "Dallas"
  "has_phone": "true|false",
  "has_website": "true|false",
  "sort_by": "id|name|rating|reviews",
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
    res.json({ filters, query });
  } catch (err) {
    res.status(500).json({ error: "AI filter failed: " + err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/stats", async (req, res) => {
  if (!supabase) return res.json({ total: 0, with_phone: 0, with_website: 0, source: "mock" });
  try {
    const { count: total } = await supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true });
    const { count: with_phone } = await supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true }).not("phone", "is", null).neq("phone", "");
    const { count: with_website } = await supabase.from(SUPABASE_TABLE).select("*", { count: "exact", head: true }).not("website", "is", null).neq("website", "");
    res.json({ total, with_phone, with_website, source: "supabase" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
