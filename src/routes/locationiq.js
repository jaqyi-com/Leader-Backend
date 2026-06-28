// ============================================================
// LocationIQ Routes — /api/locationiq/*
// ============================================================
// Hyperlocal Demand Prediction & Location Scoring
// Uses real lat/long from:
//   • final.people    (23M+ records) — demographic density
//   • final.companies (1.5M+ records) — competitor mapping
//
// Endpoints:
//   POST  /api/locationiq/score       — score a location
//   GET   /api/locationiq/history     — list past queries (paginated)
//   GET   /api/locationiq/history/:id — single result
//   DELETE /api/locationiq/history/:id — delete a result
// ============================================================

"use strict";

const express = require("express");
const router  = express.Router();

const { scoreLocation }  = require("../services/locationIQService");
const { LocationIQQuery } = require("../db/mongoose");
const { cacheGet, cacheSet } = require("../db/redis");
const logger = require("../utils/logger").forAgent("LocationIQRoute");

const CACHE_TTL = 86400; // 24 hours

// ── POST /api/locationiq/score ─────────────────────────────────────────────
router.post("/score", async (req, res) => {
  try {
    const {
      pin_code,
      address,
      business_category = "Retail",
    } = req.body;

    if (!pin_code && !address) {
      return res.status(400).json({ error: "Provide pin_code or address" });
    }

    const orgId = req.user?.orgId;

    // Cache key — skip org so same location shares cached scoring
    const cacheKey = `locationiq:${(pin_code || address || "").toLowerCase().replace(/\s+/g, "_")}:${business_category.toLowerCase()}`;
    const cached   = await cacheGet(cacheKey);

    if (cached) {
      logger.info(`[LocationIQ] Cache HIT: ${cacheKey}`);
      // Still log to history even on cache hit
      if (orgId) {
        LocationIQQuery.create({
          pin_code:          cached.location?.pin_code,
          address:           cached.location?.address,
          formatted_address: cached.location?.formatted_address,
          business_category,
          lat:               cached.location?.lat,
          lng:               cached.location?.lng,
          result:            cached,
          overall_score:     cached.scores?.overall_score,
          final_recommendation: cached.final_recommendation,
          orgId,
        }).catch(() => {});
      }
      return res.json({ ...cached, _cache: "hit" });
    }

    logger.info(`[LocationIQ] Scoring: pin=${pin_code}, addr=${address}, cat=${business_category}`);
    const result = await scoreLocation({ pin_code, address, business_category });

    // Cache result
    await cacheSet(cacheKey, result, CACHE_TTL);

    // Persist to MongoDB
    if (orgId) {
      await LocationIQQuery.create({
        pin_code:          result.location?.pin_code,
        address:           result.location?.address,
        formatted_address: result.location?.formatted_address,
        business_category,
        lat:               result.location?.lat,
        lng:               result.location?.lng,
        result,
        overall_score:     result.scores?.overall_score,
        final_recommendation: result.final_recommendation,
        orgId,
      });
    }

    return res.json({ ...result, _cache: "miss" });
  } catch (err) {
    logger.error(`[LocationIQ] Score failed: ${err.message}`);
    if (err.message.includes("Geocoding failed")) {
      return res.status(422).json({ error: `Could not resolve location: ${err.message}` });
    }
    return res.status(500).json({ error: "Scoring failed. Please try again." });
  }
});

// ── GET /api/locationiq/history ────────────────────────────────────────────
router.get("/history", async (req, res) => {
  try {
    const orgId  = req.user?.orgId;
    const page   = Math.max(1, parseInt(req.query.page  || "1",  10));
    const limit  = Math.min(50, parseInt(req.query.limit || "20", 10));
    const skip   = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      LocationIQQuery.find({ orgId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-result.raw_data")   // Exclude heavy raw data in list view
        .lean(),
      LocationIQQuery.countDocuments({ orgId }),
    ]);

    return res.json({
      data:       docs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(`[LocationIQ] History failed: ${err.message}`);
    return res.status(500).json({ error: "Failed to load history" });
  }
});

// ── GET /api/locationiq/history/:id ───────────────────────────────────────
router.get("/history/:id", async (req, res) => {
  try {
    const orgId = req.user?.orgId;
    const doc   = await LocationIQQuery.findOne({ _id: req.params.id, orgId }).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: "Failed to load result" });
  }
});

// ── DELETE /api/locationiq/history/:id ────────────────────────────────────
router.delete("/history/:id", async (req, res) => {
  try {
    const orgId = req.user?.orgId;
    await LocationIQQuery.deleteOne({ _id: req.params.id, orgId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete" });
  }
});

module.exports = router;
