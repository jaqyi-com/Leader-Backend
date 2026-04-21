// ============================================================
// HELPERS - General-purpose utility functions
// ============================================================

const { v4: uuidv4 } = require("uuid");

/**
 * Sleep for given milliseconds (rate limiting / polite scraping)
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sleep with jitter to avoid bot detection
 */
const sleepWithJitter = async (baseMs, jitterMs = 500) => {
  const jitter = Math.random() * jitterMs;
  await sleep(baseMs + jitter);
};

/**
 * Retry a function up to N times with exponential backoff
 */
const retry = async (fn, maxAttempts = 3, baseDelayMs = 1000) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
};

/**
 * Chunk an array into smaller arrays
 */
const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

/**
 * Generate a unique company ID from name
 */
const generateCompanyId = (name) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  return `company-${slug}-${uuidv4().slice(0, 8)}`;
};

/**
 * Generate a unique contact ID
 */
const generateContactId = (name, company) => {
  const nameSlug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const compSlug = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `contact-${nameSlug}-${compSlug}-${uuidv4().slice(0, 6)}`;
};

/**
 * Parse a number from a string like "1,200 employees" → 1200
 */
const parseNumber = (str) => {
  if (!str) return null;
  const cleaned = str.toString().replace(/[^0-9.]/g, "");
  return cleaned ? parseFloat(cleaned) : null;
};

/**
 * Extract domain from URL
 */
const extractDomain = (url) => {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace("www.", "");
  } catch {
    return url;
  }
};

/**
 * Truncate text to max characters
 */
const truncate = (str, maxLen = 500) => {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
};

/**
 * Get current timestamp formatted
 */
const timestamp = () => new Date().toISOString();

/**
 * Format revenue number to human-readable
 */
const formatRevenue = (num) => {
  if (!num) return "Unknown";
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num}`;
};

/**
 * Sanitize text for CSV output
 */
const sanitizeForCsv = (str) => {
  if (!str) return "";
  return str.toString().replace(/"/g, '""').replace(/\n/g, " ");
};

module.exports = {
  sleep,
  sleepWithJitter,
  retry,
  chunkArray,
  generateCompanyId,
  generateContactId,
  parseNumber,
  extractDomain,
  truncate,
  timestamp,
  formatRevenue,
  sanitizeForCsv,
};
