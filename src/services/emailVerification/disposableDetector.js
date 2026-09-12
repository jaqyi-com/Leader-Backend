"use strict";

const axios = require("axios");
const { query } = require("../../db/cloudSql");
const { cacheGet, cacheSet, setAdd, setHas } = require("../../db/redis");
const { SEED_DISPOSABLE_DOMAINS } = require("./constants");

// Upstream blocklist raw URLs (main + mirror)
const UPSTREAM_BLOCKLIST_URLS = [
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf",
  "https://raw.githubusercontent.com/martenson/disposable-email-domains/master/disposable_email_blocklist.conf"
];

const DISPOSABLE_REDIS_SET_KEY = "set:disposable_domains";

// Fast in-process Set for instant sub-millisecond check
let inMemoryDisposableSet = new Set(SEED_DISPOSABLE_DOMAINS);
let lastLoadedAt = 0;
const IN_MEMORY_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Initializes and refreshes in-memory cache from Postgres / Redis.
 */
async function loadDisposableCache(force = false) {
  const now = Date.now();
  if (!force && lastLoadedAt && now - lastLoadedAt < IN_MEMORY_REFRESH_INTERVAL_MS) {
    return inMemoryDisposableSet;
  }

  try {
    const res = await query("SELECT domain FROM final.disposable_domains");
    if (res.rows && res.rows.length > 0) {
      const newSet = new Set(SEED_DISPOSABLE_DOMAINS);
      for (const row of res.rows) {
        if (row.domain) newSet.add(row.domain.toLowerCase().trim());
      }
      inMemoryDisposableSet = newSet;
      lastLoadedAt = now;
    }
  } catch (err) {
    // If DB is temporarily unavailable, continue with seed list
    console.warn(`[DisposableDetector] Warning loading disposable domains from DB: ${err.message}`);
  }

  return inMemoryDisposableSet;
}

/**
 * Checks if a domain is a disposable / temporary email service.
 */
async function isDisposableDomain(domain) {
  if (!domain) return false;
  const cleanDomain = domain.toLowerCase().trim();

  // 1. Fast in-memory check
  if (inMemoryDisposableSet.has(cleanDomain)) {
    return true;
  }

  // 2. Check Redis Set (if in-memory didn't catch and cache might be slightly stale)
  try {
    const isRedisDisposable = await setHas(DISPOSABLE_REDIS_SET_KEY, cleanDomain);
    if (isRedisDisposable) {
      inMemoryDisposableSet.add(cleanDomain);
      return true;
    }
  } catch (_) {}

  // 3. Subdomain check (e.g. mail.mailinator.com -> mailinator.com)
  const parts = cleanDomain.split(".");
  if (parts.length > 2) {
    const parentDomain = parts.slice(1).join(".");
    if (inMemoryDisposableSet.has(parentDomain)) {
      return true;
    }
  }

  return false;
}

/**
 * Pulls the latest disposable email domain list from upstream GitHub repository,
 * diffs new domains, and bulk inserts into PostgreSQL & Redis.
 */
async function syncDisposableDomainsFromGitHub() {
  console.log("[DisposableDetector] 🔄 Fetching upstream disposable domains list from GitHub...");

  let fetchedText = null;
  let sourceUrl = "";

  for (const url of UPSTREAM_BLOCKLIST_URLS) {
    try {
      const res = await axios.get(url, { timeout: 15000 });
      if (res.data && typeof res.data === "string") {
        fetchedText = res.data;
        sourceUrl = url;
        break;
      }
    } catch (err) {
      console.warn(`[DisposableDetector] Failed fetching from ${url}: ${err.message}`);
    }
  }

  if (!fetchedText) {
    throw new Error("Could not fetch disposable domains list from any upstream GitHub mirror");
  }

  const lines = fetchedText.split(/\r?\n/);
  const upstreamDomains = new Set();

  for (const line of lines) {
    const clean = line.trim().toLowerCase();
    if (clean && !clean.startsWith("#") && clean.includes(".")) {
      upstreamDomains.add(clean);
    }
  }

  // Also include built-in seed domains
  for (const seed of SEED_DISPOSABLE_DOMAINS) {
    upstreamDomains.add(seed);
  }

  console.log(`[DisposableDetector] Parsed ${upstreamDomains.size} domains from upstream list.`);

  // Load existing domains from Postgres
  const existingRes = await query("SELECT domain FROM final.disposable_domains");
  const existingSet = new Set(existingRes.rows.map(r => r.domain.toLowerCase().trim()));

  const newDomains = [];
  for (const domain of upstreamDomains) {
    if (!existingSet.has(domain)) {
      newDomains.push(domain);
    }
  }

  console.log(`[DisposableDetector] Found ${newDomains.length} new disposable domain(s) to insert.`);

  // Bulk insert in chunks of 500
  let insertedCount = 0;
  const chunkSize = 500;

  for (let i = 0; i < newDomains.length; i += chunkSize) {
    const chunk = newDomains.slice(i, i + chunkSize);
    const valuePlaceholders = chunk.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(", ");
    const params = [];
    chunk.forEach(d => {
      params.push(d, "github_blocklist");
    });

    const insertSql = `
      INSERT INTO final.disposable_domains (domain, source)
      VALUES ${valuePlaceholders}
      ON CONFLICT (domain) DO NOTHING
    `;

    await query(insertSql, params);
    insertedCount += chunk.length;
  }

  // Update in-memory set and Redis set
  for (const domain of upstreamDomains) {
    inMemoryDisposableSet.add(domain);
  }
  lastLoadedAt = Date.now();

  try {
    const sampleChunk = Array.from(upstreamDomains).slice(0, 5000);
    await setAdd(DISPOSABLE_REDIS_SET_KEY, ...sampleChunk);
  } catch (_) {}

  console.log(`[DisposableDetector] ✅ Disposable domain sync complete. Total active: ${inMemoryDisposableSet.size}`);

  return {
    success: true,
    totalDomains: inMemoryDisposableSet.size,
    newInserted: insertedCount,
    source: sourceUrl
  };
}

/**
 * Manually appends a new domain to disposable list.
 */
async function addManualDisposableDomain(domain, source = "manual_observation") {
  if (!domain) return false;
  const cleanDomain = domain.toLowerCase().trim();

  await query(
    `INSERT INTO final.disposable_domains (domain, source)
     VALUES ($1, $2)
     ON CONFLICT (domain) DO UPDATE SET source = EXCLUDED.source`,
    [cleanDomain, source]
  );

  inMemoryDisposableSet.add(cleanDomain);
  try {
    await setAdd(DISPOSABLE_REDIS_SET_KEY, cleanDomain);
  } catch (_) {}

  return true;
}

// Initial eager load of in-memory set
loadDisposableCache().catch(() => {});

module.exports = {
  isDisposableDomain,
  syncDisposableDomainsFromGitHub,
  addManualDisposableDomain,
  loadDisposableCache
};
