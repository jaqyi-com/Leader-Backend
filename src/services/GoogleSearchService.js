const axios = require("axios");
const logger = require("../utils/logger").forAgent("GoogleSearch");

// Domains to skip — social media, news, directories, etc.
const SKIP_DOMAINS = [
  "facebook.com","twitter.com","x.com","instagram.com","linkedin.com",
  "youtube.com","tiktok.com","pinterest.com","reddit.com","wikipedia.org",
  "yelp.com","trustpilot.com","g2.com","capterra.com","glassdoor.com",
  "crunchbase.com","producthunt.com","medium.com","quora.com","github.com",
  "amazon.com","ebay.com","shopify.com","wordpress.com","blogspot.com",
  "indeed.com","monster.com","naukri.com","maps.google.com","google.com",
  "bing.com","yahoo.com","apple.com","microsoft.com","gov","edu",
];

function shouldSkip(url) {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return SKIP_DOMAINS.some(d => host === d || host.endsWith("." + d));
  } catch {
    return true;
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return null;
  }
}

class GoogleSearchService {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.cseId  = process.env.GOOGLE_CSE_ID;
    this.endpoint = "https://www.googleapis.com/customsearch/v1";
  }

  /**
   * Discover company website URLs for a keyword (and optional location string).
   * Returns up to maxResults unique base URLs.
   */
  async discoverUrls(keyword, location = null, maxResults = 50) {
    if (!this.apiKey) throw new Error("GOOGLE_API_KEY is not set in environment.");
    if (!this.cseId)  throw new Error("GOOGLE_CSE_ID is not set in environment. Create a Programmable Search Engine at https://programmablesearchengine.google.com and add the cx ID to .env as GOOGLE_CSE_ID.");

    const query = location ? `${keyword} companies in ${location}` : `${keyword} companies`;
    logger.info(`[GoogleSearch] Searching: "${query}" (max ${maxResults})`);

    const urls = new Set();
    let start = 1;

    while (urls.size < maxResults && start <= 91) {
      try {
        const { data } = await axios.get(this.endpoint, {
          params: {
            key:   this.apiKey,
            cx:    this.cseId,
            q:     query,
            num:   10,
            start,
          },
          timeout: 10000,
        });

        const items = data.items || [];
        if (!items.length) break;

        for (const item of items) {
          const base = normalizeUrl(item.link);
          if (base && !shouldSkip(item.link)) urls.add(base);
          if (urls.size >= maxResults) break;
        }

        if (!data.queries?.nextPage) break;
        start += 10;

        // Polite delay between pages
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        logger.error(`[GoogleSearch] API error at start=${start}: ${err.message}`);
        break;
      }
    }

    const result = Array.from(urls);
    logger.info(`[GoogleSearch] Discovered ${result.length} URLs for "${query}"`);
    return result;
  }
}

module.exports = new GoogleSearchService();
