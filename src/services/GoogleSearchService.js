/**
 * GoogleSearchService — discovers company website URLs by keyword using
 * Google Places Text Search API.
 *
 * Uses GOOGLE_SEARCH_API_KEY (or falls back to GOOGLE_API_KEY).
 * No CSE / Search Engine ID required.
 *
 * Flow:
 *   1. Text Search: keyword → list of place_ids (up to 60 places, 3 pages)
 *   2. Place Details: place_id → website URL
 *   3. Returns deduplicated list of base URLs
 */

const axios = require("axios");
const logger = require("../utils/logger").forAgent("GoogleSearch");

const TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS_URL     = "https://maps.googleapis.com/maps/api/place/details/json";

function normalizeBase(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

class GoogleSearchService {
  constructor() {
    // Prefer the dedicated search key, fall back to the Maps key
    this.apiKey = process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_API_KEY;
  }

  /**
   * Discover company website URLs for a keyword (and optional location string).
   * @param {string} keyword  e.g. "saas companies"
   * @param {string|null} location  e.g. "Mumbai" — appended to query if provided
   * @param {number} maxResults  max unique base URLs to return (default 60)
   * @returns {Promise<string[]>}  array of unique website origin URLs
   */
  async discoverUrls(keyword, location = null, maxResults = 60) {
    if (!this.apiKey) {
      throw new Error(
        "No Google API key set. Add GOOGLE_SEARCH_API_KEY to .env."
      );
    }

    const query = location
      ? `${keyword} companies ${location}`
      : `${keyword} companies`;

    logger.info(`[GoogleSearch] Text Search: "${query}" (max ${maxResults})`);

    // ── Step 1: Collect place_ids via Text Search (up to 3 pages × 20 = 60) ──
    const placeIds = [];
    let nextPageToken = null;
    let pages = 0;

    do {
      try {
        const params = { query, key: this.apiKey };
        if (nextPageToken) {
          // Google requires a short delay before using next_page_token
          await new Promise(r => setTimeout(r, 2000));
          params.pagetoken = nextPageToken;
        }

        const { data } = await axios.get(TEXT_SEARCH_URL, { params, timeout: 10000 });

        for (const place of (data.results || [])) {
          placeIds.push(place.place_id);
        }

        nextPageToken = data.next_page_token || null;
        pages++;
      } catch (err) {
        logger.error(`[GoogleSearch] Text Search page ${pages + 1} error: ${err.message}`);
        break;
      }
    } while (nextPageToken && placeIds.length < maxResults && pages < 3);

    logger.info(`[GoogleSearch] Found ${placeIds.length} places, fetching websites...`);

    // ── Step 2: Fetch Place Details in parallel batches to get website ──
    const urls = new Set();
    const batchSize = 10;

    for (let i = 0; i < placeIds.length && urls.size < maxResults; i += batchSize) {
      const batch = placeIds.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(placeId =>
          axios.get(DETAILS_URL, {
            params: {
              place_id: placeId,
              fields: "website",
              key: this.apiKey,
            },
            timeout: 8000,
          }).then(r => r.data?.result?.website || null)
        )
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          const base = normalizeBase(r.value);
          if (base) urls.add(base);
        }
      }

      logger.info(
        `[GoogleSearch] Processed ${Math.min(i + batchSize, placeIds.length)}/${placeIds.length} places → ${urls.size} URLs`
      );

      // Polite delay between batches
      if (i + batchSize < placeIds.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const result = Array.from(urls);
    logger.info(`[GoogleSearch] Discovered ${result.length} unique URLs for "${query}"`);
    return result;
  }
}

module.exports = new GoogleSearchService();
