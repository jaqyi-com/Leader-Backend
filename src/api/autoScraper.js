const express = require("express");
const router  = express.Router();
const autoScraper = require("../services/AutoScraperService");
const googlePlaces = require("../services/GooglePlacesService");
const { AutoScraperSession } = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("AutoScraperAPI");
const OpenAI = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /analyze — Parse a natural language description into ICP fields
// Body: { description: "I need businesses that need a CRM tool" }
// Returns: { industryKeywords, techSignals, targetPersonas, disqualifiers, rationale }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/analyze", async (req, res) => {
  const { description } = req.body;
  if (!description || !description.trim()) {
    return res.status(422).json({ error: "description is required." });
  }

  try {
    logger.info(`[AutoScraper /analyze] Analyzing: "${description.slice(0, 80)}..."`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert B2B lead generation analyst. Your job is to analyze a user's natural language description of the businesses they want to find, and extract a structured search profile.

Return ONLY a valid JSON object with these exact fields:
{
  "industryKeywords": ["string"],        // 2-6 industry types or business categories to search for (e.g. "retail store", "manufacturing company")
  "techSignals": ["string"],             // 0-4 technologies, tools, or signals that indicate a good match (e.g. "Salesforce", "Excel", "spreadsheets")
  "targetPersonas": ["string"],          // 0-3 job titles of decision makers to target (e.g. "CEO", "Sales Manager")
  "disqualifiers": ["string"],           // 0-3 keywords to EXCLUDE (e.g. "enterprise", "Fortune 500" if targeting SMBs)
  "suggestedLocation": "string or null", // a city/country if the user mentioned one, else null
  "rationale": "string"                  // 1-2 sentences explaining the search strategy in plain English
}

IMPORTANT RULES:
- industryKeywords must be Google-searchable business types (e.g. "small business", "dental clinic", "logistics company", NOT abstract concepts)
- techSignals should reveal pain points (e.g. if they need CRM, add "Excel" or "spreadsheets" as signals — companies still using those need CRM)
- Be specific and practical — these will be used as Google search queries
- Keep arrays concise (fewer, more targeted keywords = better results)`
        },
        {
          role: "user",
          content: `Analyze this lead generation requirement and extract structured ICP fields:\n\n"${description.trim()}"`
        }
      ],
    });

    const result = JSON.parse(response.choices[0].message.content);
    logger.info(`[AutoScraper /analyze] Extracted: industry=${result.industryKeywords} | tech=${result.techSignals} | persona=${result.targetPersonas}`);

    res.json(result);
  } catch (err) {
    logger.error(`[AutoScraper /analyze] ${err.message}`);
    res.status(500).json({ error: "Failed to analyze description. Please try again." });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /start — Begin a new auto-scraper session
// Body (structured ICP):
//   { industryKeywords[], techSignals[], targetPersonas[],
//     disqualifiers[], location?, lat?, lng?, radius? }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/start", async (req, res) => {
  const {
    // New structured ICP fields
    industryKeywords, techSignals, targetPersonas, disqualifiers,
    // Legacy flat field (backward-compat)
    keyword,
    // Location
    location, lat, lng, radius,
  } = req.body;

  // ── Build a rich, structured search keyword string ───────────
  let searchKeyword = "";

  if (industryKeywords && industryKeywords.length > 0) {
    // Build ICP-aware query:
    // Primary: industry keywords (required, OR-joined)
    // Boost: tech signals and personas narrow the search
    const industryPart = industryKeywords.join(" OR ");
    const techPart     = techSignals?.length     ? techSignals.slice(0, 3).join(" ")       : "";
    const personaPart  = targetPersonas?.length  ? `hiring ${targetPersonas[0]}`            : "";

    searchKeyword = [industryPart, techPart, personaPart]
      .filter(Boolean)
      .join(" ")
      .trim();

    logger.info(`[API] ICP query built: "${searchKeyword}" | industry=${industryKeywords} | tech=${techSignals} | persona=${targetPersonas} | disqualify=${disqualifiers}`);
  } else if (keyword && keyword.trim()) {
    // Legacy fallback: flat keyword field
    searchKeyword = keyword.trim();
  } else {
    return res.status(422).json({ error: "At least one industry keyword is required." });
  }

  const sessionId   = require("crypto").randomUUID();
  const hasLocation = !!(lat && lng);
  const source      = hasLocation ? "places_scraper" : "google_search";

  autoScraper.runPipeline({
    sessionId,
    keyword:      searchKeyword,
    industryKeywords: industryKeywords || [],
    techSignals:      techSignals      || [],
    targetPersonas:   targetPersonas   || [],
    disqualifiers:    disqualifiers    || [],
    location:  location  || null,
    lat:       hasLocation ? parseFloat(lat) : null,
    lng:       hasLocation ? parseFloat(lng) : null,
    source,
    radius:    radius ? parseInt(radius) : 10000,
  }).catch(err => logger.error(`[AutoScraper] Unhandled: ${err.message}`));

  res.json({ sessionId, keyword: searchKeyword, source, location: location || null, status: "discovering" });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /status/:sessionId — SSE stream of real-time logs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/status/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  let lastIdx = 0;

  const send = () => {
    const logs = autoScraper.getLogs(sessionId);
    while (lastIdx < logs.length) {
      res.write(`data: ${JSON.stringify({ log: logs[lastIdx] })}\n\n`);
      lastIdx++;
    }
    const status = autoScraper.getStatus(sessionId);
    if (status === "done" || status === "failed") {
      res.write(`data: ${JSON.stringify({ status })}\n\n`);
      clearInterval(timer);
      res.end();
    }
  };

  const timer = setInterval(send, 600);
  send(); // flush any already-queued logs immediately

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);

  req.on("close", () => {
    clearInterval(timer);
    clearInterval(heartbeat);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /sessions — List all past auto-scraper sessions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/sessions", async (req, res) => {
  try {
    const sessions = await AutoScraperSession.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(sessions);
  } catch (err) {
    logger.error(`[API /sessions] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /geocode?q=<address> — Resolve location to lat/lng
// Uses Autocomplete → Place Details (Geocoding API not required)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/geocode", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "q is required" });

    // Step 1: autocomplete → get first place_id
    const predictions = await googlePlaces.autocompleteAddress(q);
    if (!predictions || predictions.length === 0) {
      return res.status(404).json({ error: "Location not found" });
    }

    const { place_id, description } = predictions[0];

    // Step 2: place details → get geometry (lat/lng)
    const details = await googlePlaces.getPlaceDetails(place_id);
    if (!details || !details.geometry) {
      return res.status(404).json({ error: "Could not resolve coordinates" });
    }

    const { lat, lng } = details.geometry.location;
    res.json({ lat, lng, formatted_address: description });
  } catch (err) {
    logger.error(`[AutoScraper /geocode] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /autocomplete?q=<input> — Location autocomplete
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/autocomplete", async (req, res) => {
  try {
    const q = req.query.q || "";
    const predictions = await googlePlaces.autocompleteAddress(q);
    res.json(predictions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
