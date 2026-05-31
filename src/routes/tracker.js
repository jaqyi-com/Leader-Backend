/**
 * Page View Tracker  — POST /api/track
 * Public endpoint (no auth). Called by the frontend on every route change.
 *
 * Accepts: { path, referrer, sessionId, duration, utmSource, utmMedium, utmCampaign, isEntry }
 * Stores a PageView document and asynchronously geo-resolves the IP.
 */

const router = require("express").Router();
const fetch  = require("node-fetch");
const { PageView } = require("../db/mongoose");

// ── UA helpers ────────────────────────────────────────────────────────────────
function parseDevice(ua = "") {
  if (/iPad|Tablet/i.test(ua))                                           return "Tablet";
  if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return "Mobile";
  return "Desktop";
}

function parseBrowser(ua = "") {
  if (/Edg\//i.test(ua))     return "Edge";
  if (/OPR|Opera/i.test(ua)) return "Opera";
  if (/Chrome/i.test(ua))    return "Chrome";
  if (/Firefox/i.test(ua))   return "Firefox";
  if (/Safari/i.test(ua))    return "Safari";
  return "Other";
}

function isBot(ua = "") {
  return /bot|crawl|spider|slurp|search|archiver|checker|validator|headless/i.test(ua);
}

function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.headers["x-real-ip"]
    || req.socket?.remoteAddress
    || "";
}

function isPrivateIp(ip = "") {
  return !ip || ip === "::1" || ip.startsWith("127.")
    || ip.startsWith("192.168.") || ip.startsWith("10.")
    || ip.startsWith("172.16.") || ip === "localhost";
}

async function geoLookup(ip) {
  if (isPrivateIp(ip)) return { country: "Local", city: "Localhost" };
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=countryCode,city,status`,
      { timeout: 3500 }
    );
    if (res.ok) {
      const d = await res.json();
      if (d.status === "success") return { country: d.countryCode || "Unknown", city: d.city || "" };
    }
  } catch { /* silent */ }
  return { country: "Unknown", city: "" };
}

// ── POST /api/track ───────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const ua = req.headers["user-agent"] || "";
    if (isBot(ua)) return res.json({ ok: true });

    const {
      path        = "/",
      referrer    = "Direct",
      sessionId   = "",
      duration    = 0,
      utmSource   = "",
      utmMedium   = "",
      utmCampaign = "",
      isEntry     = false,
    } = req.body;

    const ip      = getClientIp(req);
    const device  = parseDevice(ua);
    const browser = parseBrowser(ua);

    // Save immediately — respond fast, geo-resolve async
    const pv = await PageView.create({
      path:        (path      || "/").slice(0, 300),
      referrer:    (referrer  || "Direct").slice(0, 300),
      device,
      browser,
      country:     "Unknown",
      city:        "",
      ip,
      sessionId:   (sessionId || "").slice(0, 64),
      duration:    Math.min(Math.max(Number(duration) || 0, 0), 86400), // clamp 0–24h
      utmSource:   (utmSource   || "").slice(0, 100),
      utmMedium:   (utmMedium   || "").slice(0, 100),
      utmCampaign: (utmCampaign || "").slice(0, 100),
      isEntry:     !!isEntry,
    });

    // Respond before geo lookup — never add latency to the user
    res.json({ ok: true });

    // Async geo update (fire-and-forget)
    geoLookup(ip).then(({ country, city }) =>
      PageView.findByIdAndUpdate(pv._id, { country, city }).catch(() => {})
    ).catch(() => {});

  } catch {
    res.json({ ok: false });
  }
});

module.exports = router;
