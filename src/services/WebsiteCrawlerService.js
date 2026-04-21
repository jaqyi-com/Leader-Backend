// ============================================================
// WEBSITE CRAWLER SERVICE
// Full Node.js port of Crawler2 Python pipeline
// Extractors: DOM, Footer, Developer, Social, Keywords, Language, Tech
// ============================================================

const axios = require("axios");
const cheerio = require("cheerio");
const logger = require("../utils/logger").forAgent("WebsiteCrawler");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_KEYWORDS = ["ai", "machine learning", "saas", "cloud", "fintech", "healthcare", "blockchain"];

const SOCIAL_DOMAINS = {
  facebook: "facebook.com",
  instagram: "instagram.com",
  twitter: "twitter.com",
  linkedin: "linkedin.com",
  youtube: "youtube.com",
  github: "github.com",
};

const TECH_SIGNATURES = {
  // CMS
  WordPress:  ["wp-content", "wp-includes"],
  Shopify:    ["cdn.shopify.com", "shopify-payment-button"],
  Wix:        ["wixsite.com"],
  Webflow:    ["webflow.js"],
  Drupal:     ["drupal-settings-json"],
  // Frontend
  "React":    ["__react", "react-dom", "data-reactroot"],
  "Next.js":  ["_next/static", "__NEXT_DATA__"],
  "Vue.js":   ["__vue__", "vue.runtime"],
  Angular:    ["ng-version"],
  // Backend
  Django:     ["csrfmiddlewaretoken"],
  Flask:      ["flask-session"],
  Laravel:    ["laravel_session", "XSRF-TOKEN"],
  "Express.js": ["x-powered-by: express"],
  // Hosting
  Vercel:     ["x-vercel-id", "vercel.app"],
  Netlify:    ["netlify.app", "x-nf-request-id"],
  Cloudflare: ["cf-ray", "cloudflare"],
  AWS:        ["amazonaws.com", "awselb"],
  // Analytics
  "Google Analytics":    ["google-analytics.com", "gtag("],
  "Google Tag Manager":  ["googletagmanager.com"],
  // Payments
  Stripe:  ["js.stripe.com"],
  PayPal:  ["paypal.com/sdk"],
  // DB / BaaS
  Firebase:  ["firebase", "firestore"],
  Supabase:  ["supabase"],
};

const HOSTING_PROVIDERS = ["Vercel", "Netlify", "Cloudflare", "AWS"];
const DATABASE_TECH    = ["Firebase", "Supabase"];
const BACKEND_STACK    = ["Django", "Flask", "Laravel", "Express.js"];
const FRAMEWORK_PRIORITY = ["Next.js", "React", "Vue.js", "Angular", "WordPress", "Shopify", "Wix", "Webflow"];

const EMAIL_REGEX = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const PHONE_REGEX = /\+?\d[\d\s().\-]{7,}\d/g;

const DEV_PATTERNS = [
  /(?:developed|built|created|designed)\s+by\s+(.+)/i,
  /(?:website|site)\s+by\s+(.+)/i,
  /powered\s+by\s+(.+)/i,
];

const STOP_TOKENS = ["|", "©", "all rights reserved", "privacy policy", "terms of service", "cookies", "contact"];
const IGNORE_WORDS = ["promotion", "sale", "support", "info@", "sales@"];
const DEV_KEYWORDS_FOOTER = ["developed by", "created by", "designed by", "built by", "powered by", "copyright"];

// Pipeline state (in-memory log stream)
let pipelineRunning = false;
let pipelineLogs = [];
const pipelineListeners = new Set();

function pushLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  pipelineLogs.push(line);
  if (pipelineLogs.length > 500) pipelineLogs.shift();
  for (const cb of pipelineListeners) {
    try { cb(line); } catch (_) {}
  }
  logger.info(msg);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. URL NORMALIZER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function normalizeUrl(url) {
  url = url.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  // Strip trailing slash
  url = url.replace(/\/$/, "");
  return url;
}

function removeWww(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.replace(/^www\./, "");
      return parsed.toString();
    }
  } catch (_) {}
  return url;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. DOM FETCHER  (port of dom_basic.py + http_client.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function safeGet(url) {
  try {
    const resp = await axios.get(url, {
      timeout: 12000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CrawlerBot/2.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      validateStatus: (s) => s < 400,
    });
    return { html: resp.data, responseHeaders: resp.headers };
  } catch (_) {
    return null;
  }
}

async function extractDomBasic(url) {
  pushLog(`[DOM_BASIC] Fetching HTML: ${url}`);

  let result = await safeGet(url);

  // SSL hostname fallback: remove www
  if (!result) {
    const fixed = removeWww(url);
    if (fixed !== url) {
      pushLog(`[SSL FIX] Retrying without www → ${fixed}`);
      result = await safeGet(fixed);
      if (result) url = fixed;
    }
  }

  if (!result) {
    pushLog(`[DOM_BASIC] ❌ Failed to fetch: ${url}`);
    return { website_title: null, short_description: null, favicon_url: null, html_text: "", $: null, raw_html: "", fetch_failed: true, response_headers: {} };
  }

  const raw_html = typeof result.html === "string" ? result.html : String(result.html);
  const $ = cheerio.load(raw_html);

  const website_title = ($("title").text() || "").trim() || null;

  const metaDesc = $("meta[name='description']").attr("content");
  const short_description = metaDesc ? metaDesc.trim() : null;

  const faviconTag = $("link[rel*='icon']").first().attr("href");
  const favicon_url = faviconTag || null;

  const html_text = $.text().replace(/\s+/g, " ").trim().slice(0, 12000);

  pushLog(`[DOM_BASIC] title:${website_title ? "yes" : "no"} desc:${short_description ? "yes" : "no"}`);

  return {
    website_title,
    short_description,
    favicon_url,
    html_text,
    $,
    raw_html,
    fetch_failed: false,
    response_headers: result.responseHeaders || {},
  };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. FOOTER EXTRACTOR  (port of dom_footer.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractFooterInfo($) {
  pushLog("[DOM_FOOTER] Extracting footer info");

  const footerEl = $("footer").length ? $("footer") : $.root();
  const footerText = footerEl.text().replace(/\s+/g, " ").trim();

  const emails = footerText.match(EMAIL_REGEX) || [];
  const phones = footerText.match(PHONE_REGEX) || [];

  const contact_email = emails[0] || null;
  const phone_number  = phones[0] || null;

  let developer_name  = null;
  let developer_email = null;
  let developer_phone = null;

  const lines = footerText.split(/[\n.;]/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (DEV_KEYWORDS_FOOTER.some(k => lower.includes(k))) {
      developer_name = line.trim();
      const fe = line.match(EMAIL_REGEX);
      const fp = line.match(PHONE_REGEX);
      if (fe) developer_email = fe[0];
      if (fp) developer_phone = fp[0];
      break;
    }
  }

  pushLog(`[DOM_FOOTER] email:${contact_email ? "yes" : "no"} phone:${phone_number ? "yes" : "no"} dev:${developer_name ? "yes" : "no"}`);

  return { contact_email, phone_number, developer_name, developer_email, developer_phone };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. DEVELOPER EXTRACTOR  (port of developer_extractor.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function cleanDeveloperName(raw) {
  if (!raw) return null;
  raw = raw.trim();
  raw = raw.replace(EMAIL_REGEX, "").replace(PHONE_REGEX, "");
  const lower = raw.toLowerCase();
  for (const token of STOP_TOKENS) {
    const idx = lower.indexOf(token);
    if (idx !== -1) raw = raw.slice(0, idx);
  }
  const cleaned = raw.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (IGNORE_WORDS.some(w => cleaned.toLowerCase().includes(w))) return null;
  if (cleaned.length < 3 || cleaned.length > 50) return null;
  return cleaned;
}

function extractDeveloperInfo($) {
  const fallback = { developer_name: "data is not present", developer_email: "data is not present", developer_phone: "data is not present" };
  if (!$) return fallback;

  pushLog("[DEV] Extracting developer attribution");

  const footerEl = $("footer").length ? $("footer") : $.root();
  const rawLines = [];
  footerEl.find("*").addBack().each((_, el) => {
    const txt = $(el).clone().children().remove().end().text().trim();
    if (txt) rawLines.push(txt);
  });

  const lines = rawLines.length ? rawLines : [$.root().text()];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (IGNORE_WORDS.some(w => lower.includes(w))) continue;

    for (const pattern of DEV_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        const raw = m[1];
        const fe = raw.match(EMAIL_REGEX);
        const fp = raw.match(PHONE_REGEX);
        const devName = cleanDeveloperName(raw);
        if (devName) {
          pushLog(`[DEV] Found: ${devName}`);
          return {
            developer_name:  devName,
            developer_email: fe ? fe[0] : "data is not present",
            developer_phone: fp ? fp[0] : "data is not present",
          };
        }
      }
    }
  }

  pushLog("[DEV] Developer attribution not found");
  return fallback;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. SOCIAL LINKS EXTRACTOR  (port of social_extractor.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractSocialLinks($) {
  const results = {};
  if (!$) return results;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    for (const [name, domain] of Object.entries(SOCIAL_DOMAINS)) {
      if (href.toLowerCase().includes(domain) && !results[`${name}_url`]) {
        results[`${name}_url`] = href;
      }
    }
  });

  return results;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. KEYWORD DETECTOR  (port of keyword_detector.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function detectKeywords(text, keywords) {
  if (!text) return [];
  const kws = keywords && keywords.length ? keywords : DEFAULT_KEYWORDS;
  const lower = text.toLowerCase();
  const found = kws.filter(k => lower.includes(k.toLowerCase()));
  if (found.length) pushLog(`[KEYWORD] Found: ${found.join(", ")}`);
  return found;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. LANGUAGE DETECTOR  (port of language_detector.py)
//    Uses basic heuristic / CLD-lite via franc-min if available
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let franc;
try { franc = require("franc-min"); } catch (_) {}

function detectLanguage(text) {
  if (!text || text.trim().length < 200) return null;
  try {
    if (franc) {
      const lang = franc(text.slice(0, 500));
      if (lang && lang !== "und") {
        pushLog(`[LANG] Detected: ${lang}`);
        return lang;
      }
    }
    // Fallback heuristic: check <html lang="...">
    return null;
  } catch (_) {
    return null;
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. TECH DETECTOR  (port of tech_detector.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function detectTech(url, rawHtml, responseHeaders) {
  pushLog("[TECH] Detecting technology stack");

  if (!rawHtml) return { technology_stack: null, framework_used: null, backend_language: null, database_used: null, hosting_provider: null };

  const htmlLower = rawHtml.toLowerCase();
  const headerStr = JSON.stringify(responseHeaders || {}).toLowerCase();
  const detected = new Set();

  // Signature scan on HTML + headers
  for (const [tech, patterns] of Object.entries(TECH_SIGNATURES)) {
    for (const p of patterns) {
      if (htmlLower.includes(p.toLowerCase()) || headerStr.includes(p.toLowerCase())) {
        detected.add(tech);
        break;
      }
    }
  }

  // Additional header-based hosting detection
  if (headerStr.includes("x-vercel-id"))    detected.add("Vercel");
  if (headerStr.includes("x-nf-request-id")) detected.add("Netlify");
  if (headerStr.includes("cf-ray"))          detected.add("Cloudflare");
  if (headerStr.includes("x-amz"))           detected.add("AWS");

  const detectedArr = [...detected];

  const framework_used = FRAMEWORK_PRIORITY.find(f => detected.has(f)) || null;
  const hosting_provider = HOSTING_PROVIDERS.find(h => detected.has(h)) || null;
  const database_used    = DATABASE_TECH.find(d => detected.has(d)) || null;

  let backend_language = null;
  const foundBackend = BACKEND_STACK.find(b => detected.has(b));
  if (foundBackend) {
    if (["Django", "Flask"].includes(foundBackend)) backend_language = "Python";
    else if (foundBackend === "Laravel") backend_language = "PHP";
    else if (foundBackend === "Express.js") backend_language = "Node.js";
  }

  pushLog(`[TECH] Stack: ${detectedArr.join(", ") || "none detected"}`);

  return {
    technology_stack: detectedArr.length ? detectedArr.join(", ") : null,
    framework_used,
    backend_language,
    database_used,
    hosting_provider,
  };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. IS DATA SUFFICIENT  (port of level_decider.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function isDataSufficient(record) {
  const requiredCount = [
    record.website_title,
    record.contact_email,
    record.phone_number,
    record.technology_stack || record.framework_used,
  ].filter(Boolean).length;
  return requiredCount >= 2;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. WEBSITE RECORD BUILDER  (port of website_builder.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function buildWebsiteRecord(url, keywords) {
  url = normalizeUrl(url);
  pushLog(`[BUILDER] Building record: ${url}`);

  // 1. Basic DOM fetch
  const base = await extractDomBasic(url);
  const record = { input_url: url, fetch_failed: base.fetch_failed };

  if (base.fetch_failed) {
    pushLog(`[BUILDER] Fetch failed: ${url}`);
    return record;
  }

  const $ = base.$;
  const raw_html = base.raw_html;
  const html_text = base.html_text;
  const dom_text = html_text;

  record.dom_data = dom_text || null;

  // 2. Title & brand name
  if (base.website_title) {
    record.website_title = base.website_title;
    const titleBrand = base.website_title.split("|")[0].split("-")[0].trim();
    if (titleBrand.length >= 3) record.brand_name = titleBrand;
  }

  // 3. Short description
  if (base.short_description) record.short_description = base.short_description;

  // 4. Favicon
  if (base.favicon_url) record.favicon_url = base.favicon_url;

  // 5. Brand fallback from domain
  if (!record.brand_name) {
    const domain = url.replace(/https?:\/\//i, "").replace(/^www\./, "").split(".")[0];
    if (domain.length >= 3) record.brand_name = domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  // 6. Footer contact extraction
  try {
    const footerData = extractFooterInfo($);
    record.contact_email = footerData.contact_email;
    record.phone_number  = footerData.phone_number;
    record._footer_data  = footerData;
  } catch (e) {
    pushLog(`[BUILDER] Footer extraction failed: ${e.message}`);
  }

  // 7. Developer attribution
  try {
    const devData = extractDeveloperInfo($);
    record.developer_name  = devData.developer_name;
    record.developer_email = devData.developer_email;
    record.developer_phone = devData.developer_phone;
  } catch (e) {
    pushLog(`[BUILDER] Developer extraction failed: ${e.message}`);
  }

  // 8. Social links
  try {
    const socialLinks = extractSocialLinks($);
    for (const [k, v] of Object.entries(socialLinks)) {
      if (!record[k]) record[k] = v;
    }
  } catch (e) {
    pushLog(`[BUILDER] Social extraction failed: ${e.message}`);
  }

  // 9. Keywords
  try {
    record.keyword_present = detectKeywords(dom_text, keywords);
  } catch (e) {
    record.keyword_present = [];
  }

  // 10. Language detection
  try {
    record.website_language = detectLanguage(dom_text);
  } catch (e) {
    record.website_language = null;
  }

  // 11. Tech stack detection
  try {
    const techData = detectTech(url, raw_html, base.response_headers);
    for (const [k, v] of Object.entries(techData)) {
      if (!record[k]) record[k] = v;
    }
  } catch (e) {
    pushLog(`[BUILDER] Tech detection failed: ${e.message}`);
  }

  // 12. HTML lang fallback
  if (!record.website_language && $) {
    const htmlLang = $("html").attr("lang");
    if (htmlLang) record.website_language = htmlLang.slice(0, 5);
  }

  // 13. Construct extra_data (debug)
  record.extra_data = {};
  if (record._footer_data) record.extra_data.footer = record._footer_data;
  delete record._footer_data;

  pushLog(
    `[BUILDER] Done | brand=${record.brand_name} fw=${record.framework_used || "?"} host=${record.hosting_provider || "?"}`
  );

  return record;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. LEVEL PIPELINE  (port of level_pipeline.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function crawlWithLevels(url, keywords) {
  pushLog("=".repeat(60));
  pushLog(`[LEVEL_PIPELINE] Starting: ${url}`);

  // Level 1
  pushLog("[LEVEL_PIPELINE] Running Level 1...");
  const l1 = await buildWebsiteRecord(url, keywords);
  if (isDataSufficient(l1)) {
    pushLog("[LEVEL_PIPELINE] ✅ Data sufficient at Level 1");
    l1._crawl_level = "L1";
    return l1;
  }
  pushLog("[LEVEL_PIPELINE] ❌ Not enough data → L2");

  // Level 2 — retry same URL (sometimes transient failures resolve)
  pushLog("[LEVEL_PIPELINE] Running Level 2...");
  const l2 = await buildWebsiteRecord(url, keywords);
  if (isDataSufficient(l2)) {
    pushLog("[LEVEL_PIPELINE] ✅ Data sufficient at Level 2");
    l2._crawl_level = "L2";
    return l2;
  }
  pushLog("[LEVEL_PIPELINE] ❌ Not enough data → L3 (fallback)");

  // Level 3 — final fallback
  pushLog("[LEVEL_PIPELINE] Running Level 3 (final)...");
  const l3 = await buildWebsiteRecord(url, keywords);
  l3._crawl_level = "L3";
  return l3;
}



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. MAIN PIPELINE RUNNER  (all data saved to MongoDB)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { Website } = require("../db/mongoose");

async function runPipeline({ urls, keywords = [] }) {
  if (pipelineRunning) {
    return { status: "error", reason: "A crawl is already running. Please wait." };
  }

  if (!Array.isArray(urls) || !urls.length) {
    return { status: "error", reason: "No URLs to crawl." };
  }

  pipelineRunning = true;
  pipelineLogs = [];

  pushLog("=".repeat(60));
  pushLog("[PIPELINE] Crawl job started");
  pushLog(`[PIPELINE] urls=${urls.length} keywords=${keywords.join(", ") || "default"}`);
  pushLog("=".repeat(60));

  try {
    const total = urls.length;
    let success = 0, failed = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      pushLog(`[PIPELINE] (${i + 1}/${total}) Crawling: ${url}`);

      try {
        const record = await crawlWithLevels(url, keywords);

        // Upsert to MongoDB
        await Website.findOneAndUpdate(
          { input_url: record.input_url },
          { $set: record },
          { upsert: true, new: true }
        );

        record.fetch_failed ? failed++ : success++;
      } catch (err) {
        pushLog(`[PIPELINE] ❌ Error for ${url}: ${err.message}`);
        await Website.findOneAndUpdate(
          { input_url: url },
          { $set: { input_url: url, fetch_failed: true, pipeline_error: err.message } },
          { upsert: true }
        );
        failed++;
      }
    }

    pushLog("=".repeat(60));
    pushLog(`[PIPELINE] Finished | total=${total} success=${success} failed=${failed}`);
    pushLog("=".repeat(60));

    return { status: "completed", total, success, failed, keywords };
  } catch (err) {
    pushLog(`[PIPELINE] Fatal error: ${err.message}`);
    return { status: "failed", reason: err.message };
  } finally {
    pipelineRunning = false;
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
module.exports = {
  runPipeline,
  isRunning: () => pipelineRunning,
  getRecentLogs: () => [...pipelineLogs],
  onLog: (cb) => pipelineListeners.add(cb),
  offLog: (cb) => pipelineListeners.delete(cb),
};
