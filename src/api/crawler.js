// ============================================================
// CRAWLER API ROUTES
// Full Node.js port of the Python Crawler2 FastAPI backend
// ============================================================

const express = require("express");
const multer  = require("multer");
const { v4: uuidv4 } = (() => { try { return require("uuid"); } catch (_) { return { v4: () => require("crypto").randomUUID() }; } })();
const crawler = require("../services/WebsiteCrawlerService");
const { Website, CrawlRun } = require("../db/mongoose");
const logger  = require("../utils/logger").forAgent("CrawlerAPI");
const placesService = require("../services/GooglePlacesService");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const { placesLimiter } = require("../middleware/rateLimiter");

// Guard against missing multer gracefully
let multipartMiddleware;
try {
  multipartMiddleware = upload.single("file");
} catch (_) {
  multipartMiddleware = (req, res, next) => next();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CSV parse helper  (no external dep needed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function parseCsvBuffer(buffer) {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV is empty or has only a header row.");

  const headers = lines[0].toLowerCase().split(",").map(h => h.replace(/^"|"$/g, "").trim());
  const urlIdx = headers.indexOf("url");
  if (urlIdx === -1) throw new Error(`CSV must contain a 'url' column. Found: ${headers.join(", ")}`);

  return lines.slice(1).map(line => {
    const cols = line.split(",");
    return (cols[urlIdx] || "").replace(/^"|"$/g, "").trim();
  }).filter(Boolean);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /start — Start crawl from a JSON array of URLs
// (Google Sheet dependency removed — pass URLs directly)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/start", async (req, res) => {
  if (crawler.isRunning()) {
    return res.status(503).json({ error: "A crawl is already running. Please wait." });
  }

  const { urls = [], keywords = [], customFields = [] } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(422).json({ error: "'urls' must be a non-empty array of website URLs." });
  }

  const crawlRunId = require("crypto").randomUUID();

  logger.info(`[API] Crawl started | runId=${crawlRunId} urls=${urls.length} keywords=${keywords} customFields=${customFields.length}`);

  crawler.runPipeline({ urls, keywords, customFields, crawlRunId, source: "direct_urls" }).catch(err => {
    logger.error(`[PIPELINE] Unhandled error: ${err.message}`);
  });

  res.json({
    status: "started",
    crawlRunId,
    source: "direct_urls",
    total_urls: urls.length,
    keywords,
    start_time: new Date().toISOString(),
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /upload-csv — Start crawl from CSV file upload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/upload-csv", multipartMiddleware, async (req, res) => {
  if (crawler.isRunning()) {
    return res.status(503).json({ error: "A crawl is already running. Please wait." });
  }

  const file = req.file;

  // Support raw body fallback (when frontend sends raw multipart bytes)
  let buffer = file ? file.buffer : req.body;

  if (!Buffer.isBuffer(buffer) && typeof buffer !== "string") {
    return res.status(400).json({ error: "No CSV file uploaded. Send a multipart/form-data request with a 'file' field." });
  }

  if (Buffer.isBuffer(buffer) === false) {
    buffer = Buffer.from(buffer);
  }

  let urls;
  try {
    urls = parseCsvBuffer(buffer);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!urls.length) {
    return res.status(400).json({ error: "No URLs found in CSV." });
  }

  let keywords = [];
  let customFields = [];
  try {
    const raw = req.body?.keywords || "[]";
    keywords = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rawCf = req.body?.customFields || "[]";
    customFields = typeof rawCf === "string" ? JSON.parse(rawCf) : rawCf;
  } catch (_) {}

  const crawlRunId = require("crypto").randomUUID();
  const filename = file?.originalname || "upload.csv";

  logger.info(`[API] Crawl started from CSV | runId=${crawlRunId} urls=${urls.length} | keywords=${keywords} | customFields=${customFields.length}`);

  // Fire-and-forget
  crawler.runPipeline({ urls, keywords, customFields, crawlRunId, source: "csv_upload" }).catch(err => {
    logger.error(`[PIPELINE] Unhandled error: ${err.message}`);
  });

  res.json({
    status: "started",
    crawlRunId,
    source: "csv_upload",
    total_urls: urls.length,
    keywords,
    start_time: new Date().toISOString(),
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /logs/stream — SSE live log stream
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Replay recent logs
  for (const line of crawler.getRecentLogs()) {
    res.write(`data: ${line}\n\n`);
  }

  // Stream live logs
  const onLog = (line) => {
    res.write(`data: ${line}\n\n`);
  };
  crawler.onLog(onLog);

  // Heartbeat to keep alive
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    crawler.offLog(onLog);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /websites — Query stored crawled websites
// Supports: q, from (ISO), to (ISO), limit, offset
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/websites", async (req, res) => {
  try {
    const q      = req.query.q    || null;
    const from   = req.query.from || null;
    const to     = req.query.to   || null;
    const limit  = Math.min(parseInt(req.query.limit  || "50"), 200);
    const offset = parseInt(req.query.offset || "0");

    let filter = {};

    if (q) {
      const re = { $regex: q, $options: "i" };
      filter.$or = [
        { input_url:        re },
        { website_title:    re },
        { brand_name:       re },
        { technology_stack: re },
        { hosting_provider: re },
        { contact_email:    re },
      ];
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    const [websites, total] = await Promise.all([
      Website.find(filter, { dom_data: 0 })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Website.countDocuments(filter),
    ]);

    res.json({ websites, total, limit, offset });
  } catch (err) {
    logger.error(`[API /websites] ${err.message}`);
    res.status(500).json({ error: err.message });

  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /websites/count — Fast stats for a date window (legacy runs)
// Returns { total, success, failed } — no website data returned
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/websites/count", async (req, res) => {
  try {
    const from = req.query.from || null;
    const to   = req.query.to   || null;

    const dateFilter = {};
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from);
      if (to)   dateFilter.createdAt.$lte = new Date(to);
    }

    const [total, failed] = await Promise.all([
      Website.countDocuments(dateFilter),
      Website.countDocuments({ ...dateFilter, fetch_failed: true }),
    ]);

    res.json({ total, failed, success: total - failed });
  } catch (err) {
    logger.error(`[API /websites/count] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /runs — List all crawl runs (newest first)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/runs", async (req, res) => {
  try {
    const runs = await CrawlRun.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(runs);
  } catch (err) {
    logger.error(`[API /runs] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /runs/:runId/websites — Get websites for a specific run
// Supports: q, framework, hasMail, hasPhone, status, limit, offset
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/runs/:runId/websites", async (req, res) => {
  try {
    const { runId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit  || "50"), 200);
    const offset = parseInt(req.query.offset || "0");
    const q           = req.query.q        || null;
    const framework   = req.query.framework || null;
    const hasMail     = req.query.hasMail;   // "true" | "false"
    const hasPhone    = req.query.hasPhone;  // "true" | "false"
    const statusFilter = req.query.status;   // "ok" | "failed"
    const keyword     = req.query.keyword   || null;

    const filter = { crawlRunId: runId };

    if (q) {
      const re = { $regex: q, $options: "i" };
      filter.$or = [
        { input_url:        re },
        { website_title:    re },
        { brand_name:       re },
        { technology_stack: re },
        { contact_email:    re },
      ];
    }
    if (framework)              filter.framework_used   = { $regex: framework, $options: "i" };
    if (hasMail === "true")     filter.contact_email    = { $exists: true, $ne: null, $ne: "" };
    if (hasMail === "false")    filter.$and = [...(filter.$and || []), { $or: [{ contact_email: null }, { contact_email: "" }, { contact_email: { $exists: false } }] }];
    if (hasPhone === "true")    filter.phone_number     = { $exists: true, $ne: null, $ne: "" };
    if (hasPhone === "false")   filter.$and = [...(filter.$and || []), { $or: [{ phone_number: null }, { phone_number: "" }, { phone_number: { $exists: false } }] }];
    if (statusFilter === "ok")  filter.fetch_failed     = false;
    if (statusFilter === "failed") filter.fetch_failed  = true;
    if (keyword)                filter.keyword_present  = { $in: [keyword] };

    const [websites, total] = await Promise.all([
      Website.find(filter, { dom_data: 0 })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Website.countDocuments(filter),
    ]);

    res.json({ websites, total, limit, offset });
  } catch (err) {
    logger.error(`[API /runs/:runId/websites] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Google Places Routes (native — no Python proxy)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get("/places/geocode", async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "Address is required" });
    
    const result = await placesService.geocodeAddress(address);
    if (!result) return res.status(404).json({ error: "Location not found" });
    
    res.json(result);
  } catch (err) {
    logger.error(`[Places /geocode] ${err.message}`);
    res.status(500).json({ error: "Failed to geocode address", detail: err.message });
  }
});

router.get("/places/details", async (req, res) => {
  try {
    const { place_id } = req.query;
    if (!place_id) return res.status(400).json({ error: "place_id is required" });
    
    const result = await placesService.getPlaceDetails(place_id);
    if (!result) return res.status(404).json({ error: "Place details not found" });
    
    res.json(result);
  } catch (err) {
    logger.error(`[Places /details] ${err.message}`);
    res.status(500).json({ error: "Failed to fetch place details", detail: err.message });
  }
});

router.get("/places/autocomplete", async (req, res) => {
  try {
    const { input } = req.query;
    if (!input) return res.json([]);
    
    const result = await placesService.autocompleteAddress(input);
    res.json(result);
  } catch (err) {
    logger.error(`[Places /autocomplete] ${err.message}`);
    res.status(500).json({ error: "Failed to fetch autocomplete", detail: err.message });
  }
});

router.post("/places/search", placesLimiter, async (req, res) => {
  try {
    const { lat, lng, radius, keyword } = req.body;
    const result = await placesService.searchAndStore(lat, lng, radius, keyword);
    res.json(result);
  } catch (err) {
    logger.error(`[Places /search] ${err.message}`);
    res.status(500).json({ error: "Failed to search places", detail: err.message });
  }
});

router.get("/places", async (req, res) => {
  try {
    const { limit = 100, offset = 0, keyword } = req.query;
    const result = await placesService.getStoredPlaces(limit, offset, keyword);
    res.json(result);
  } catch (err) {
    logger.error(`[Places /places] ${err.message}`);
    res.status(500).json({ error: "Failed to fetch places", detail: err.message });
  }
});

router.get("/places/history", async (req, res) => {
  try {
    const { PlaceSearchHistory } = require("../db/mongoose");
    const history = await PlaceSearchHistory.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(history);
  } catch (err) {
    logger.error(`[Places /history] ${err.message}`);
    res.status(500).json({ error: "Failed to fetch search history", detail: err.message });
  }
});

router.post("/places/export-csv", async (req, res) => {
  try {
    const places = req.body;
    if (!places || places.length === 0) {
      return res.status(400).json({ error: "No places data provided." });
    }

    const fields = ["place_id", "name", "phone", "website", "address", "lat", "lng", "types", "rating", "user_ratings_total", "category_keyword"];

    let csvData;
    try {
      const { parse } = require("json2csv");
      csvData = parse(places, { fields });
    } catch (_) {
      // Inline fallback CSV builder
      const replacer = (_, v) => (v === null || v === undefined ? "" : v);
      const header = fields;
      csvData = [
        header.join(","),
        ...places.map(row =>
          header.map(f => JSON.stringify(row[f], replacer)).join(",")
        ),
      ].join("\r\n");
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="places_export_${Date.now()}.csv"`);
    res.send(csvData);
  } catch (err) {
    logger.error(`[Places /export-csv] ${err.message}`);
    res.status(500).json({ error: "Export failed", detail: err.message });
  }
});

module.exports = router;
