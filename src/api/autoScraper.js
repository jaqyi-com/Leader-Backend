const express = require("express");
const router  = express.Router();
const autoScraper = require("../services/AutoScraperService");
const googlePlaces = require("../services/GooglePlacesService");
const { AutoScraperSession } = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("AutoScraperAPI");

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
