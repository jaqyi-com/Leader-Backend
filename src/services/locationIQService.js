// ============================================================
// LocationIQ Service — Hyperlocal Demand Prediction Engine
// ============================================================
// Uses YOUR real data:
//   • final.people    → 23M+ people with lat/long for demographic density
//   • final.companies → 1.5M+ companies with lat/long for competitor mapping
//
// Pipeline per query:
//   1. Geocode PIN → lat/lng (Google Geocoding API)
//   2. Query final.people within radius → population density + job clustering
//   3. Query final.companies within radius → competitor count by industry
//   4. Build prompt → OpenAI GPT-4o → structured JSON score
//   5. Return enriched result
// ============================================================

"use strict";

const axios   = require("axios");
const { query: pgQuery } = require("../db/cloudSql");
const logger  = require("../utils/logger").forAgent("LocationIQ");
const OpenAI  = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Haversine distance formula for approximate radius in degrees
// Earth radius ~6371km → 1 degree ≈ 111km
// radius_km / 111 gives degree offset — good enough for bounding box pre-filter
function kmToDegrees(km) {
  return km / 111.0;
}

// ─── Step 1: Geocode PIN / address → { lat, lng, formattedAddress } ──────────
// Primary: OpenStreetMap Nominatim (free, no billing)
// Fallback: Google Places Text Search
async function geocodeLocation(pinCode, address, latDirect, lngDirect) {
  // Option A: direct coordinates passed in
  if (latDirect && lngDirect) {
    return {
      lat: parseFloat(latDirect),
      lng: parseFloat(lngDirect),
      formattedAddress: address || `${latDirect}, ${lngDirect}`,
    };
  }

  const searchQuery = address
    ? `${address}, India`
    : `${pinCode}, India`;

  // ── Primary: Nominatim (OpenStreetMap — free) ──────────────────────────────
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1&countrycodes=in`;
    const nomResp = await axios.get(nomUrl, {
      timeout: 12000,
      headers: { "User-Agent": "LocationIQ-doott/1.0 (contact@doott.in)" },
    });
    if (nomResp.data?.length > 0) {
      const hit = nomResp.data[0];
      return {
        lat: parseFloat(hit.lat),
        lng: parseFloat(hit.lon),
        formattedAddress: hit.display_name,
      };
    }
  } catch (e) {
    logger.warn(`[LocationIQ] Nominatim failed: ${e.message}`);
  }

  // ── Fallback: Google Places Find Place ─────────────────────────────────────
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (GOOGLE_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=geometry,formatted_address,name&key=${GOOGLE_API_KEY}`;
      const resp = await axios.get(url, { timeout: 10000 });
      if (resp.data.status === "OK" && resp.data.candidates?.length) {
        const c = resp.data.candidates[0];
        return {
          lat: c.geometry.location.lat,
          lng: c.geometry.location.lng,
          formattedAddress: c.formatted_address || c.name || searchQuery,
        };
      }
    } catch (e) {
      logger.warn(`[LocationIQ] Google Places fallback failed: ${e.message}`);
    }
  }

  throw new Error(`Could not resolve location for "${searchQuery}". Try providing a more specific address.`);
}


// ─── Step 2: Demographic data from final.people ───────────────────────────────
// Count people in 1km, 3km, 5km radius using bounding box + Haversine filter
// NOTE: "long" is a reserved word in PG — must be double-quoted
async function getDemographics(lat, lng) {
  try {
    const r5km = kmToDegrees(5);

    // People density + job title clustering within ~5km bounding box
    const densityRes = await pgQuery(
      `SELECT
         COUNT(*)                                        AS total_people,
         COUNT(CASE WHEN job_title IS NOT NULL THEN 1 END) AS with_job,
         COUNT(CASE WHEN
           (6371 * acos(LEAST(1.0, GREATEST(-1.0,
              cos(radians($1::double precision)) * cos(radians(lat::double precision)) *
              cos(radians("long"::double precision) - radians($2::double precision)) +
              sin(radians($1::double precision)) * sin(radians(lat::double precision))
           )))) <= 1 THEN 1 END)                        AS people_1km,
         COUNT(CASE WHEN
           (6371 * acos(LEAST(1.0, GREATEST(-1.0,
              cos(radians($1::double precision)) * cos(radians(lat::double precision)) *
              cos(radians("long"::double precision) - radians($2::double precision)) +
              sin(radians($1::double precision)) * sin(radians(lat::double precision))
           )))) <= 3 THEN 1 END)                        AS people_3km
       FROM final.people
       WHERE
         lat IS NOT NULL AND "long" IS NOT NULL
         AND lat::double precision BETWEEN ($1::double precision - $3::double precision) AND ($1::double precision + $3::double precision)
         AND "long"::double precision BETWEEN ($2::double precision - $3::double precision) AND ($2::double precision + $3::double precision)`,
      [lat, lng, r5km],
      45000
    );

    // Top job titles (professional cluster signal)
    const jobsRes = await pgQuery(
      `SELECT job_title, COUNT(*) AS cnt
       FROM final.people
       WHERE
         lat IS NOT NULL AND "long" IS NOT NULL
         AND job_title IS NOT NULL AND job_title != ''
         AND lat::double precision BETWEEN ($1::double precision - $3::double precision) AND ($1::double precision + $3::double precision)
         AND "long"::double precision BETWEEN ($2::double precision - $3::double precision) AND ($2::double precision + $3::double precision)
         AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
           cos(radians($1::double precision)) * cos(radians(lat::double precision)) *
           cos(radians("long"::double precision) - radians($2::double precision)) +
           sin(radians($1::double precision)) * sin(radians(lat::double precision))
         )))) <= 5
       GROUP BY job_title
       ORDER BY cnt DESC
       LIMIT 10`,
      [lat, lng, r5km],
      30000
    );

    const d = densityRes.rows[0] || {};
    return {
      total_5km:    parseInt(d.total_people) || 0,
      total_1km:    parseInt(d.people_1km)   || 0,
      total_3km:    parseInt(d.people_3km)   || 0,
      with_job_pct: d.total_people > 0
        ? Math.round((parseInt(d.with_job) / parseInt(d.total_people)) * 100)
        : 0,
      top_job_titles: jobsRes.rows.map(r => ({ title: r.job_title, count: parseInt(r.cnt) })),
    };
  } catch (err) {
    logger.warn(`[LocationIQ] Demographics query failed: ${err.message}`);
    return { total_5km: 0, total_1km: 0, total_3km: 0, with_job_pct: 0, top_job_titles: [] };
  }
}

// ─── Step 3: Competitor & business density from final.companies ───────────────
async function getCompetitorData(lat, lng, businessCategory) {
  try {
    const r5km = kmToDegrees(5);

    // Total business density at 1km / 3km / 5km
    const densityRes = await pgQuery(
      `SELECT
         COUNT(*)                                        AS total_biz,
         AVG(CASE WHEN rating IS NOT NULL THEN rating::double precision END) AS avg_rating,
         SUM(CASE WHEN reviews IS NOT NULL THEN reviews END)                  AS total_reviews,
         COUNT(CASE WHEN
           (6371 * acos(LEAST(1.0, GREATEST(-1.0,
              cos(radians($1::double precision)) * cos(radians(lat::double precision)) *
              cos(radians("long"::double precision) - radians($2::double precision)) +
              sin(radians($1::double precision)) * sin(radians(lat::double precision))
           )))) <= 1 THEN 1 END)                        AS biz_1km,
         COUNT(CASE WHEN
           (6371 * acos(LEAST(1.0, GREATEST(-1.0,
              cos(radians($1::double precision)) * cos(radians(lat::double precision)) *
              cos(radians("long"::double precision) - radians($2::double precision)) +
              sin(radians($1::double precision)) * sin(radians(lat::double precision))
           )))) <= 3 THEN 1 END)                        AS biz_3km
       FROM final.companies
       WHERE
         lat IS NOT NULL AND "long" IS NOT NULL
         AND lat::double precision BETWEEN ($1::double precision - $3::double precision) AND ($1::double precision + $3::double precision)
         AND "long"::double precision BETWEEN ($2::double precision - $3::double precision) AND ($2::double precision + $3::double precision)`,
      [lat, lng, r5km],
      45000
    );

    // Industry breakdown
    const industryRes = await pgQuery(
      `SELECT
         COALESCE(industry, 'Unknown') AS industry,
         COUNT(*)                       AS cnt,
         AVG(rating::double precision)  AS avg_rating
       FROM final.companies
       WHERE
         lat IS NOT NULL AND "long" IS NOT NULL
         AND lat::double precision BETWEEN ($1::double precision - $3::double precision) AND ($1::double precision + $3::double precision)
         AND "long"::double precision BETWEEN ($2::double precision - $3::double precision) AND ($2::double precision + $3::double precision)
         AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
           cos(radians($1::double precision)) * cos(radians(lat::double precision)) *
           cos(radians("long"::double precision) - radians($2::double precision)) +
           sin(radians($1::double precision)) * sin(radians(lat::double precision))
         )))) <= 5
       GROUP BY industry
       ORDER BY cnt DESC
       LIMIT 12`,
      [lat, lng, r5km],
      30000
    );

    // Closest competitors by name (top 10)
    const nearbyRes = await pgQuery(
      `SELECT
         business_name,
         industry,
         rating,
         reviews,
         city,
         ROUND((6371 * acos(LEAST(1.0, GREATEST(-1.0,
           cos(radians($1::double precision)) * cos(radians(lat::double precision)) *
           cos(radians("long"::double precision) - radians($2::double precision)) +
           sin(radians($1::double precision)) * sin(radians(lat::double precision))
         ))))::numeric, 2) AS dist_km
       FROM final.companies
       WHERE
         lat IS NOT NULL AND "long" IS NOT NULL
         AND business_name IS NOT NULL AND business_name != ''
         AND lat::double precision BETWEEN ($1::double precision - $3::double precision) AND ($1::double precision + $3::double precision)
         AND "long"::double precision BETWEEN ($2::double precision - $3::double precision) AND ($2::double precision + $3::double precision)
         AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
           cos(radians($1::double precision)) * cos(radians(lat::double precision)) *
           cos(radians("long"::double precision) - radians($2::double precision)) +
           sin(radians($1::double precision)) * sin(radians(lat::double precision))
         )))) <= 3
       ORDER BY dist_km ASC
       LIMIT 10`,
      [lat, lng, r5km],
      30000
    );

    const d = densityRes.rows[0] || {};
    return {
      total_5km:         parseInt(d.total_biz)    || 0,
      total_1km:         parseInt(d.biz_1km)      || 0,
      total_3km:         parseInt(d.biz_3km)      || 0,
      avg_area_rating:   d.avg_rating ? parseFloat(d.avg_rating).toFixed(1) : null,
      total_reviews_area: parseInt(d.total_reviews) || 0,
      industry_breakdown: industryRes.rows.map(r => ({
        industry:   r.industry,
        count:      parseInt(r.cnt),
        avg_rating: r.avg_rating ? parseFloat(r.avg_rating).toFixed(1) : null,
      })),
      nearby_businesses: nearbyRes.rows.map(r => ({
        name:     r.business_name,
        industry: r.industry || "Unknown",
        rating:   r.rating ? parseFloat(r.rating) : null,
        reviews:  r.reviews ? parseInt(r.reviews) : 0,
        dist_km:  parseFloat(r.dist_km),
      })),
    };
  } catch (err) {
    logger.warn(`[LocationIQ] Competitor query failed: ${err.message}`);
    return {
      total_5km: 0, total_1km: 0, total_3km: 0,
      avg_area_rating: null, total_reviews_area: 0,
      industry_breakdown: [], nearby_businesses: [],
    };
  }
}

// ─── Step 4: Build OpenAI prompt ─────────────────────────────────────────────
function buildPrompt({ pin_code, address, formattedAddress, business_category, demographics, competitors }) {
  return `You are LocationIQ, an expert Location Demand Prediction Engine for expansion decisions.

TASK: Analyze the viability of opening a "${business_category}" business at the given location.
Use the real geospatial data provided (sourced from 23M+ people and 1.5M+ businesses).

LOCATION:
- Address: ${formattedAddress || address || pin_code}
- PIN Code: ${pin_code || "N/A"}

PEOPLE DENSITY (from real database):
- People within 1km: ${demographics.total_1km.toLocaleString()}
- People within 3km: ${demographics.total_3km.toLocaleString()}
- People within 5km: ${demographics.total_5km.toLocaleString()}
- Professional workforce %: ${demographics.with_job_pct}%
- Top occupations nearby: ${demographics.top_job_titles.slice(0, 5).map(j => `${j.title} (${j.count})`).join(", ") || "N/A"}

BUSINESS DENSITY (real competitor data):
- Businesses within 1km: ${competitors.total_1km}
- Businesses within 3km: ${competitors.total_3km}
- Businesses within 5km: ${competitors.total_5km}
- Average area rating: ${competitors.avg_area_rating || "N/A"}/5
- Total customer reviews in area: ${competitors.total_reviews_area.toLocaleString()}
- Industry breakdown (5km): ${competitors.industry_breakdown.slice(0, 6).map(i => `${i.industry}: ${i.count}`).join(", ") || "N/A"}
- Nearest businesses: ${competitors.nearby_businesses.slice(0, 5).map(b => `${b.name} (${b.dist_km}km, ${b.industry})`).join(", ") || "None"}

BUSINESS CATEGORY: ${business_category}

SCORING METHODOLOGY:
1. DEMAND SCORE (0-100): Weight population density 35%, workforce quality 30%, growth signals 20%, area vibrancy (reviews) 15%
2. MARKET SATURATION (0-100): Higher = more crowded. Weight business density 40%, same-category competition 35%, avg ratings (proxy for established market) 25%
3. DEMOGRAPHIC FIT (0-100): How well area demographics match "${business_category}" ideal customer profile
4. GROWTH TRAJECTORY (0-100): Signal from data density, area review volume, and workforce composition

REVENUE ESTIMATION:
- For India market: baseline monthly revenue by category (QSR: ₹8-25L/mo, Retail: ₹5-20L/mo, Pharmacy: ₹3-12L/mo, Logistics: ₹10-40L/mo, Fintech: ₹2-8L/mo, Insurance: ₹1-5L/mo, Beauty: ₹2-8L/mo, Grocery: ₹5-15L/mo)
- Adjust based on: population density score, competitive saturation, demographic fit
- Express in Indian Rupees (₹ Lakhs/month)

RISK ASSESSMENT:
Evaluate: Market Saturation Risk, Low Footfall Risk, High Competition Risk, Demographic Mismatch Risk, Area Maturity Risk

FINAL RECOMMENDATION: STRONG_BUY (score 80+), BUY (65-79), HOLD (50-64), AVOID (<50)
Overall score = weighted average: demand(35%) + demographic_fit(30%) + growth(20%) + (100-saturation)(15%)

RETURN VALID JSON ONLY. No markdown. No explanation. Strictly this structure:
{
  "scores": {
    "demand_score": <0-100 integer>,
    "market_saturation": <0-100 integer>,
    "demographic_fit": <0-100 integer>,
    "growth_trajectory": <0-100 integer>,
    "overall_score": <0-100 integer>
  },
  "revenue_prediction": {
    "conservative_estimate": "<₹X.X L/mo>",
    "optimistic_estimate": "<₹X.X L/mo>",
    "annual_conservative": "<₹X.X Cr/yr>",
    "annual_optimistic": "<₹X.X Cr/yr>",
    "confidence": <0-100 integer>,
    "confidence_reason": "<string — cite people and business counts>"
  },
  "competitive_analysis": {
    "competitors_1km": <integer>,
    "competitors_3km": <integer>,
    "competitors_5km": <integer>,
    "market_share_opportunity": <0-100 integer>,
    "opportunity_summary": "<1-2 sentences>"
  },
  "risk_assessment": [
    {
      "risk_name": "<string>",
      "probability": <0-100 integer>,
      "impact": "<HIGH|MEDIUM|LOW>",
      "recommendation": "<1 sentence action>"
    }
  ],
  "demographic_analysis": {
    "primary_demographic": "<description>",
    "fit_for_business": <0-100 integer>,
    "professional_density": "<string>",
    "recommendation": "<1 sentence>"
  },
  "final_recommendation": "<STRONG_BUY|BUY|HOLD|AVOID>",
  "decision_summary": "<2-3 sentences explaining the core verdict using the data>",
  "data_confidence": "<HIGH|MEDIUM|LOW — based on number of nearby people and businesses>"
}`;
}

// ─── Step 5: Call OpenAI ──────────────────────────────────────────────────────
async function runAIScoring(prompt) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 1800,
    response_format: { type: "json_object" },
  });
  const text = completion.choices[0].message.content;
  return JSON.parse(text);
}

// ─── Main entry point ─────────────────────────────────────────────────────────
async function scoreLocation({ pin_code, address, business_category, lat: latIn, lng: lngIn }) {
  const category = business_category || "Retail";

  logger.info(`[LocationIQ] Scoring: pin=${pin_code}, addr=${address}, cat=${category}`);

  // 1. Geocode
  const geo = await geocodeLocation(pin_code, address, latIn, lngIn);
  logger.info(`[LocationIQ] Geocoded → lat=${geo.lat}, lng=${geo.lng}`);

  // 2. Demographics from final.people
  const [demographics, competitors] = await Promise.all([
    getDemographics(geo.lat, geo.lng),
    getCompetitorData(geo.lat, geo.lng, category),
  ]);

  logger.info(`[LocationIQ] Data: people_5km=${demographics.total_5km}, biz_5km=${competitors.total_5km}`);

  // 3. AI scoring
  const prompt = buildPrompt({
    pin_code, address, formattedAddress: geo.formattedAddress,
    business_category: category, demographics, competitors,
  });

  const aiResult = await runAIScoring(prompt);

  // 4. Enrich with raw counts for frontend display
  return {
    ...aiResult,
    location: {
      pin_code:          pin_code || null,
      address:           address  || null,
      formatted_address: geo.formattedAddress,
      lat:               geo.lat,
      lng:               geo.lng,
    },
    raw_data: {
      people_1km:   demographics.total_1km,
      people_3km:   demographics.total_3km,
      people_5km:   demographics.total_5km,
      biz_1km:      competitors.total_1km,
      biz_3km:      competitors.total_3km,
      biz_5km:      competitors.total_5km,
      avg_rating:   competitors.avg_area_rating,
      top_jobs:     demographics.top_job_titles.slice(0, 5),
      nearby_biz:   competitors.nearby_businesses,
      industries:   competitors.industry_breakdown.slice(0, 8),
    },
    business_category: category,
    scored_at: new Date().toISOString(),
  };
}

module.exports = { scoreLocation };
