/**
 * Admin Analytics Route  — OWNER ONLY
 * GET /api/analytics/{live,traffic,users}
 *
 * Hard-locked to ADMIN_EMAIL (set in .env).
 * Any other authenticated user receives 403 Forbidden.
 * Data is returned globally (not scoped to a single org) so the
 * owner can see metrics across ALL organisations on the platform.
 */

const router = require("express").Router();
const db     = require("../db/appDb");

// ─── Owner guard ─────────────────────────────────────────────────────────────
// Must come before every handler on this router.
const getAdminEmails = () => {
  const builtinAdmins = [
    "akshat.v@jaqyi.com"
  ];
  const envVal = process.env.ADMIN_EMAIL || "";
  const envList = envVal.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([...builtinAdmins, ...envList]));
};

router.use((req, res, next) => {
  const callerEmail = (req.user?.email || "").toLowerCase().trim();
  if (!callerEmail) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    return res.status(503).json({ error: "Analytics admin email not configured on server." });
  }
  if (!adminEmails.includes(callerEmail)) {
    return res.status(403).json({ error: "Access denied. This section is restricted to the application owner." });
  }
  next();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Run a query, returning [] on error (a broken widget must not take the whole dashboard down). */
async function safe(text, params = []) {
  try { return await db.many(text, params); } catch { return []; }
}
const count = async (where = "TRUE", params = []) =>
  (await safe(`SELECT count(*)::int AS n FROM app.page_views WHERE ${where}`, params))[0]?.n ?? 0;
const liveCount = async () =>
  (await safe("SELECT count(DISTINCT session_id)::int AS n FROM app.page_views WHERE created_at >= now() - interval '5 minutes' AND session_id <> ''"))[0]?.n ?? 0;
/** Top values of one column in the last 7 days. */
const topBy = (col, where, limit) => safe(
  `SELECT ${col} AS k, count(*)::int AS count FROM app.page_views
    WHERE created_at >= now() - interval '7 days' AND ${where}
    GROUP BY ${col} ORDER BY count DESC LIMIT ${Number(limit) || 10}`
);

// ─── GET /api/analytics/live — lightweight, pollable ─────────────────────────
router.get("/live", async (req, res) => {
  res.json({ live: await liveCount(), ts: new Date().toISOString() });
});

// ─── GET /api/analytics/traffic ──────────────────────────────────────────────
router.get("/traffic", async (req, res) => {
  try {
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── Basic KPI counts ──────────────────────────────────────────────────────
    const [totalViews, todayViews, weekViews, uniqueRow, liveVisitors] = await Promise.all([
      count(),
      count("created_at >= $1", [todayStart]),
      count("created_at >= now() - interval '7 days'"),
      safe("SELECT count(DISTINCT session_id)::int AS n FROM app.page_views WHERE created_at >= now() - interval '7 days' AND session_id <> ''"),
      liveCount(),
    ]);
    const uniqueVisitors = uniqueRow[0]?.n ?? 0;

    // ── Session intelligence (bounce rate, pages/session, avg duration) ───────
    const [sess = { totalSessions: 0, bouncedSessions: 0, totalPageViews: 0, totalDuration: 0 }] = await safe(
      `SELECT count(*)::int AS total_sessions,
              count(*) FILTER (WHERE page_count = 1)::int AS bounced_sessions,
              COALESCE(sum(page_count), 0)::int AS total_page_views,
              COALESCE(sum(total_duration), 0)::bigint AS total_duration
         FROM (SELECT session_id, count(*) AS page_count, sum(duration) AS total_duration
                 FROM app.page_views
                WHERE created_at >= now() - interval '7 days' AND session_id <> ''
                GROUP BY session_id) s`
    );
    const totalDuration     = Number(sess.totalDuration) || 0;
    const bounceRate        = sess.totalSessions > 0 ? Math.round((sess.bouncedSessions / sess.totalSessions) * 100) : 0;
    const avgPagesPerSession= sess.totalSessions > 0 ? Math.round((sess.totalPageViews  / sess.totalSessions) * 10) / 10 : 0;
    const avgDurationSecs   = sess.totalSessions > 0 ? Math.round(totalDuration / Math.max(sess.totalPageViews, 1)) : 0;

    // ── Hourly views — last 24 h (UTC hours, as before) ───────────────────────
    const hourlyRaw = await safe(
      `SELECT extract(hour FROM created_at AT TIME ZONE 'UTC')::int AS hour, count(*)::int AS count
         FROM app.page_views WHERE created_at >= now() - interval '24 hours' GROUP BY 1`
    );
    const hourlyMap = {};
    hourlyRaw.forEach(h => { hourlyMap[h.hour] = h.count; });
    const currentHour = now.getUTCHours();
    const hourlyViews = Array.from({ length: 24 }, (_, i) => {
      const hour = (currentHour + 1 + i) % 24;
      return { hour, count: hourlyMap[hour] ?? 0 };
    });

    // ── 30-day daily trend ────────────────────────────────────────────────────
    const thirtyStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const daily30Raw = await safe(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM app.page_views WHERE created_at >= $1 GROUP BY 1`,
      [thirtyStart]
    );
    const dailyMap = {};
    daily30Raw.forEach(d => { dailyMap[d.day] = d.count; });
    const daily30 = Array.from({ length: 30 }, (_, i) => {
      const dateStr = new Date(thirtyStart.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return { date: dateStr, count: dailyMap[dateStr] ?? 0 };
    });

    // ── Traffic heatmap (day × hour, last 30 days; row 0 = Sunday) ────────────
    const heatRaw = await safe(
      `SELECT extract(dow FROM created_at AT TIME ZONE 'UTC')::int AS day,
              extract(hour FROM created_at AT TIME ZONE 'UTC')::int AS hour, count(*)::int AS count
         FROM app.page_views WHERE created_at >= $1 GROUP BY 1, 2`,
      [thirtyStart]
    );
    const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
    heatRaw.forEach(r => { heatmap[r.day][r.hour] = r.count; });

    // ── Top lists (last 7 days) ───────────────────────────────────────────────
    const [topPages, topReferrers, entryPages, devicesRaw, browsersRaw, countries] = await Promise.all([
      topBy("path", "TRUE", 10),
      topBy("referrer", "referrer NOT IN ('Direct', '')", 8),
      topBy("path", "is_entry", 8),
      topBy("device", "TRUE", 50),
      topBy("browser", "TRUE", 50),
      topBy("country", "country <> 'Unknown'", 8),
    ]);
    const utmCampaigns = await safe(
      `SELECT utm_source AS source, utm_medium AS medium, utm_campaign AS campaign, count(*)::int AS count
         FROM app.page_views WHERE created_at >= now() - interval '7 days' AND utm_campaign <> ''
        GROUP BY 1, 2, 3 ORDER BY count DESC LIMIT 10`
    );

    const deviceTotal = devicesRaw.reduce((s, d) => s + d.count, 0) || 1;
    const devices = devicesRaw.map(d => ({ device: d.k || "Unknown", count: d.count, pct: Math.round((d.count / deviceTotal) * 100) }));
    const browserTotal = browsersRaw.reduce((s, d) => s + d.count, 0) || 1;
    const browsers = browsersRaw.map(b => ({ browser: b.k || "Unknown", count: b.count, pct: Math.round((b.count / browserTotal) * 100) }));

    // ── Recent visits ─────────────────────────────────────────────────────────
    const recentVisits = await safe("SELECT * FROM app.page_views ORDER BY created_at DESC LIMIT 25");

    res.json({
      generatedAt: now.toISOString(),
      kpis: {
        totalViews, todayViews, weekViews, uniqueVisitors, liveVisitors,
        bounceRate, avgPagesPerSession, avgDurationSecs,
      },
      hourlyViews,
      daily30,
      heatmap,
      topPages:     topPages.map(p     => ({ path: p.k || "/",      count: p.count })),
      topReferrers: topReferrers.map(r => ({ referrer: r.k || "?",  count: r.count })),
      entryPages:   entryPages.map(e   => ({ path: e.k || "/",      count: e.count })),
      utmCampaigns: utmCampaigns.map(u => ({ source: u.source, medium: u.medium, campaign: u.campaign, count: u.count })),
      devices,
      browsers,
      countries: countries.map(c => ({ country: c.k, count: c.count })),
      recentVisits: recentVisits.map(v => ({
        path: v.path, device: v.device, browser: v.browser,
        country: v.country, city: v.city, referrer: v.referrer,
        duration: v.duration, utmSource: v.utmSource,
        utmCampaign: v.utmCampaign, isEntry: v.isEntry,
        when: v.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/users ───────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const users = await db.many(
      "SELECT id, name, email, avatar, is_email_verified, google_id, plan, paid_at, created_at FROM app.users ORDER BY created_at DESC"
    );

    const stats = {
      total: users.length,
      paid: users.filter(u => u.plan === "lifetime").length,
      verified: users.filter(u => u.isEmailVerified).length,
      googleAuth: users.filter(u => u.googleId).length,
    };

    res.json({
      success: true,
      stats,
      users: users.map(u => ({
        id: u._id,
        name: u.name || "Unnamed",
        email: u.email,
        avatar: u.avatar || null,
        isEmailVerified: !!u.isEmailVerified,
        provider: u.googleId ? "google" : "password",
        plan: u.plan || "free",
        paidAt: u.paidAt || null,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
