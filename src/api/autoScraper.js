const express = require("express");
const router  = express.Router();
const autoScraper = require("../services/AutoScraperService");
const googlePlaces = require("../services/GooglePlacesService");
const { AutoScraperSession } = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("AutoScraperAPI");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /start — Begin a new auto-scraper session
// Body: { keyword, location?, lat?, lng? }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/start", async (req, res) => {
  const { keyword, location, lat, lng } = req.body;

  if (!keyword || !keyword.trim()) {
    return res.status(422).json({ error: "keyword is required." });
  }

  const sessionId = require("crypto").randomUUID();
  const hasLocation = !!(lat && lng);
  const source = hasLocation ? "places_scraper" : "google_search";

  logger.info(`[API] Auto-scraper start | sessionId=${sessionId} keyword="${keyword}" location="${location || "none"}" source=${source}`);

  // Fire and forget
  autoScraper.runPipeline({
    sessionId, keyword: keyword.trim(),
    location: location || null,
    lat: hasLocation ? parseFloat(lat) : null,
    lng: hasLocation ? parseFloat(lng) : null,
    source,
  }).catch(err => logger.error(`[AutoScraper] Unhandled: ${err.message}`));

  res.json({ sessionId, keyword, source, location: location || null, status: "discovering" });
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
// GET /geocode?q=<address> — Geocode a location string
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/geocode", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "q is required" });
    const result = await googlePlaces.geocodeAddress(q);
    if (!result) return res.status(404).json({ error: "Location not found" });
    res.json(result);
  } catch (err) {
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
