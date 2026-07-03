"use strict";

const express = require("express");
const router = express.Router();
const { performHybridSearch } = require("../services/hybridSearchService");
const { auth } = require("../middleware/auth");

/**
 * GET /api/search/hybrid
 * Perform structured and semantic hybrid search over companies or people.
 */
router.get("/", auth, async (req, res) => {
  const {
    entityType = "companies",
    search = "",
    f_city = "",
    f_state = "",
    f_industry = "",
    f_job_title = "",
    f_has_email = "",
    f_has_phone = "",
    page = 1,
    limit = 25,
  } = req.query;

  try {
    const result = await performHybridSearch({
      entityType,
      search,
      f_city,
      f_state,
      f_industry,
      f_job_title,
      f_has_email,
      f_has_phone,
      page,
      limit,
    });

    res.json({
      success: true,
      ...result,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
