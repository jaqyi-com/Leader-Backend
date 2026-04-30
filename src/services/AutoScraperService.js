const { AutoScraperSession, AutoScraperLead, Website } = require("../db/mongoose");
const googleSearch = require("./GoogleSearchService");
const googlePlaces = require("./GooglePlacesService");
const crawler      = require("./WebsiteCrawlerService");
const logger       = require("../utils/logger").forAgent("AutoScraper");

// In-memory log streams per session for SSE
const sessionLogs = {};  // sessionId → string[]
const sessionStatus = {}; // sessionId → "running"|"done"|"failed"

function pushLog(sessionId, msg) {
  if (!sessionLogs[sessionId]) sessionLogs[sessionId] = [];
  sessionLogs[sessionId].push(msg);
  logger.info(`[AutoScraper:${sessionId.slice(0, 8)}] ${msg}`);
}

function getLogs(sessionId) { return sessionLogs[sessionId] || []; }
function getStatus(sessionId) { return sessionStatus[sessionId] || "idle"; }

function cleanup(sessionId, delay = 10 * 60 * 1000) {
  setTimeout(() => { delete sessionLogs[sessionId]; delete sessionStatus[sessionId]; }, delay);
}

/**
 * Run the full auto-scraper pipeline (fire-and-forget, use SSE to stream progress).
 */
async function runPipeline({ sessionId, keyword, industryKeywords = [], techSignals = [], targetPersonas = [], disqualifiers = [], location, lat, lng, source, radius }) {
  sessionStatus[sessionId] = "running";
  sessionLogs[sessionId] = [];

  const radiusM = Math.min(Math.max(parseInt(radius) || 10000, 1000), 150000);
  pushLog(sessionId, `▶ Session started | keyword="${keyword}" location="${location || "none"}" source=${source} radius=${radiusM / 1000}km`);

  if (industryKeywords.length) pushLog(sessionId, `🎯 ICP: industry=[${industryKeywords.join(", ")}]${techSignals.length ? ` | tech=[${techSignals.join(", ")}]` : ""}${targetPersonas.length ? ` | persona=[${targetPersonas.join(", ")}]` : ""}${disqualifiers.length ? ` | disqualify=[${disqualifiers.join(", ")}]` : ""}`);

  try {
    await AutoScraperSession.create({
      sessionId, keyword, location: location || null,
      lat: lat || null, lng: lng || null,
      source, status: "discovering",
    });
  } catch (e) {
    pushLog(sessionId, `⚠ DB: could not create session record: ${e.message}`);
  }

  let urls = [];

  // ── Phase 1: Discover URLs ─────────────────────────────────
  pushLog(sessionId, `🔍 Phase 1: Discovering company URLs...`);
  try {
    if (source === "places_scraper") {
      // For places search, search each industry keyword separately for max coverage
      const searchTerms = industryKeywords.length > 0 ? industryKeywords : keyword.split(",").map(k => k.trim()).filter(Boolean);
      pushLog(sessionId, `📍 Searching ${searchTerms.length} keyword(s) via Google Places Nearby (radius=${radiusM / 1000}km)`);

      const allPlaceIds = new Set();
      for (const kw of searchTerms) {
        // Optionally enrich with tech signal for better signal
        const enrichedKw = techSignals.length > 0 ? `${kw} ${techSignals[0]}` : kw;
        pushLog(sessionId, `   🔎 Searching for "${enrichedKw}"...`);
        try {
          const ids = await googlePlaces.searchNearby(lat, lng, radiusM, enrichedKw);
          pushLog(sessionId, `   Found ${ids.length} places for "${enrichedKw}"`);
          ids.forEach(id => allPlaceIds.add(id));
        } catch (e) {
          pushLog(sessionId, `   ⚠ Search failed for "${enrichedKw}": ${e.message}`);
        }
      }

      const placeIdList = [...allPlaceIds];
      pushLog(sessionId, `   Total ${placeIdList.length} unique places, fetching website details...`);

      const chunkSize = 10;
      for (let i = 0; i < placeIdList.length; i += chunkSize) {
        const chunk = placeIdList.slice(i, i + chunkSize);
        const details = await Promise.all(chunk.map(id => googlePlaces.getPlaceDetails(id)));
        for (const d of details) {
          if (d?.website) urls.push(d.website);
        }
        pushLog(sessionId, `   Processed ${Math.min(i + chunkSize, placeIdList.length)}/${placeIdList.length} → ${urls.length} URLs`);
      }
    } else {
      // Google Text Search — search each industry keyword separately
      const searchTerms = industryKeywords.length > 0 ? industryKeywords : keyword.split(",").map(k => k.trim()).filter(Boolean);
      pushLog(sessionId, `🔍 Querying Google for ${searchTerms.length} keyword(s)...`);
      for (const kw of searchTerms) {
        // Add tech signal if available to narrow results
        const enrichedKw = techSignals.length > 0 ? `${kw} ${techSignals[0]}` : kw;
        pushLog(sessionId, `   🔎 Searching "${enrichedKw}"...`);
        const found = await googleSearch.discoverUrls(enrichedKw, location || null, 40);
        pushLog(sessionId, `   Found ${found.length} URLs for "${enrichedKw}"`);
        urls.push(...found);
      }
    }
  } catch (err) {
    pushLog(sessionId, `❌ Discovery failed: ${err.message}`);
    sessionStatus[sessionId] = "failed";
    await AutoScraperSession.findOneAndUpdate({ sessionId }, { $set: { status: "failed" } });
    cleanup(sessionId);
    return;
  }

  // Deduplicate
  urls = [...new Set(urls.map(u => {
    try { return new URL(u).origin; } catch { return u; }
  }))].filter(Boolean);

  // ── Disqualifier filtering ──────────────────────────────────
  if (disqualifiers.length > 0) {
    const before = urls.length;
    const disqLower = disqualifiers.map(d => d.toLowerCase());
    urls = urls.filter(url => !disqLower.some(d => url.toLowerCase().includes(d)));
    const removed = before - urls.length;
    if (removed > 0) pushLog(sessionId, `🚫 Removed ${removed} URLs matching disqualifying keywords`);
  }

  pushLog(sessionId, `✅ Phase 1 done: ${urls.length} unique URLs discovered`);
  await AutoScraperSession.findOneAndUpdate({ sessionId }, { $set: { urlsFound: urls.length, status: "crawling" } });

  if (!urls.length) {
    pushLog(sessionId, `⚠ No URLs found. Try broader keywords or remove location.`);
    sessionStatus[sessionId] = "done";
    await AutoScraperSession.findOneAndUpdate({ sessionId }, { $set: { status: "done" } });
    cleanup(sessionId);
    return;
  }

  // ── Phase 2: Crawl ─────────────────────────────────────────
  pushLog(sessionId, `🕷 Phase 2: Crawling ${urls.length} websites via Web Crawler...`);

  const crawlRunId = require("crypto").randomUUID();
  const crawlResult = await crawler.runPipeline({
    urls,
    keywords: [keyword],
    customFields: [],
    crawlRunId,
    source: "auto_scraper",
  });

  const successCount = crawlResult.success || 0;
  const failedCount  = crawlResult.failed  || 0;
  pushLog(sessionId, `✅ Phase 2 done: ${successCount} crawled, ${failedCount} failed`);
  await AutoScraperSession.findOneAndUpdate({ sessionId }, { $set: { crawlRunId, status: "filtering" } });

  // ── Phase 3: Filter & Save Leads ──────────────────────────
  pushLog(sessionId, `📋 Phase 3: Filtering for contact information...`);
  try {
    const websites = await Website.find({
      crawlRunId,
      $or: [
        { contact_email:  { $exists: true, $ne: null, $ne: "" } },
        { phone_number:   { $exists: true, $ne: null, $ne: "" } },
        { developer_email:{ $exists: true, $ne: null, $ne: "" } },
        { developer_phone:{ $exists: true, $ne: null, $ne: "" } },
      ],
    }).lean();

    pushLog(sessionId, `   ${websites.length} sites have contact info`);

    if (websites.length > 0) {
      const leads = websites.map(w => ({
        sessionId,
        crawlRunId,
        input_url:       w.input_url,
        brand_name:      w.brand_name,
        website_title:   w.website_title,
        contact_email:   w.contact_email,
        phone_number:    w.phone_number,
        developer_email: w.developer_email,
        developer_phone: w.developer_phone,
        technology_stack:w.technology_stack,
        framework_used:  w.framework_used,
        country:         w.country,
        keyword,
        location: location || null,
      }));

      await AutoScraperLead.insertMany(leads, { ordered: false }).catch(() => {});
      await AutoScraperSession.findOneAndUpdate({ sessionId }, { $set: { leadsFound: leads.length } });
      pushLog(sessionId, `✅ Phase 3 done: ${leads.length} leads saved to DB`);
    } else {
      pushLog(sessionId, `⚠ No leads with contact info found in this run.`);
    }
  } catch (err) {
    pushLog(sessionId, `❌ Filtering error: ${err.message}`);
  }

  // Finalize
  await AutoScraperSession.findOneAndUpdate({ sessionId }, { $set: { status: "done" } });
  pushLog(sessionId, `🎉 Session complete! Data is visible in Website Intelligence.`);
  sessionStatus[sessionId] = "done";
  cleanup(sessionId);
}

module.exports = { runPipeline, getLogs, getStatus };
