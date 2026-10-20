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
const db     = require("../db/mongoose");

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

/** Count documents in a model, catching errors gracefully */
async function safeCount(Model, filter = {}) {
  try {
    return await Model.countDocuments(filter);
  } catch {
    return 0;
  }
}

/** Run an aggregation, returning [] on error */
async function safeAggregate(Model, pipeline) {
  try {
    return await Model.aggregate(pipeline);
  } catch {
    return [];
  }
}

// ─── GET /api/analytics/live — lightweight, pollable ─────────────────────────
router.get("/live", async (req, res) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await safeAggregate(db.PageView, [
      { $match: { createdAt: { $gte: fiveMinAgo }, sessionId: { $ne: "" } } },
      { $group: { _id: "$sessionId" } },
      { $count: "total" },
    ]);
    res.json({ live: result[0]?.total ?? 0, ts: new Date().toISOString() });
  } catch {
    res.json({ live: 0, ts: new Date().toISOString() });
  }
});

// ─── GET /api/analytics/traffic ──────────────────────────────────────────────
router.get("/traffic", async (req, res) => {
  try {
    const { PageView } = db;
    const now          = new Date();
    const todayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart    = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000);
    const dayStart     = new Date(Date.now() -      24 * 60 * 60 * 1000);
    const thirtyStart  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // ── Basic KPI counts ──────────────────────────────────────────────────────
    const [totalViews, todayViews, weekViews] = await Promise.all([
      safeCount(PageView),
      safeCount(PageView, { createdAt: { $gte: todayStart } }),
      safeCount(PageView, { createdAt: { $gte: weekStart } }),
    ]);

    // ── Unique visitors (distinct sessionIds, 7 days) ─────────────────────────
    const uniqueResult = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart }, sessionId: { $ne: "" } } },
      { $group: { _id: "$sessionId" } },
      { $count: "total" },
    ]);
    const uniqueVisitors = uniqueResult[0]?.total ?? 0;

    // ── Live visitors (last 5 min) ────────────────────────────────────────────
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const liveResult = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: fiveMinAgo }, sessionId: { $ne: "" } } },
      { $group: { _id: "$sessionId" } },
      { $count: "total" },
    ]);
    const liveVisitors = liveResult[0]?.total ?? 0;

    // ── Session intelligence (bounce rate, pages/session, avg duration) ───────
    const sessionAgg = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart }, sessionId: { $ne: "" } } },
      { $group: { _id: "$sessionId", pageCount: { $sum: 1 }, totalDuration: { $sum: "$duration" } } },
      { $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        bouncedSessions: { $sum: { $cond: [{ $eq: ["$pageCount", 1] }, 1, 0] } },
        totalPageViews: { $sum: "$pageCount" },
        totalDuration:  { $sum: "$totalDuration" },
      }},
    ]);
    const sess = sessionAgg[0] ?? { totalSessions: 0, bouncedSessions: 0, totalPageViews: 0, totalDuration: 0 };
    const bounceRate        = sess.totalSessions > 0 ? Math.round((sess.bouncedSessions / sess.totalSessions) * 100) : 0;
    const avgPagesPerSession= sess.totalSessions > 0 ? Math.round((sess.totalPageViews  / sess.totalSessions) * 10) / 10 : 0;
    const avgDurationSecs   = sess.totalSessions > 0 ? Math.round(sess.totalDuration / Math.max(sess.totalPageViews, 1)) : 0;

    // ── Hourly views — last 24 h ──────────────────────────────────────────────
    const hourlyRaw = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: dayStart } } },
      { $group: { _id: { $hour: "$createdAt" }, count: { $sum: 1 } } },
    ]);
    const hourlyMap = {};
    hourlyRaw.forEach(h => { hourlyMap[h._id] = h.count; });
    const currentHour = now.getHours();
    const hourlyViews = Array.from({ length: 24 }, (_, i) => {
      const hour = (currentHour + 1 + i) % 24;
      return { hour, count: hourlyMap[hour] ?? 0 };
    });

    // ── 30-day daily trend ────────────────────────────────────────────────────
    const daily30Raw = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: thirtyStart } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const dailyMap = {};
    daily30Raw.forEach(d => { dailyMap[d._id] = d.count; });
    const daily30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(thirtyStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      return { date: dateStr, count: dailyMap[dateStr] ?? 0 };
    });

    // ── Traffic heatmap (day × hour, last 30 days) ────────────────────────────
    // MongoDB dayOfWeek: 1=Sun, 2=Mon … 7=Sat → we remap to 0=Sun…6=Sat
    const heatRaw = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: thirtyStart } } },
      { $group: {
        _id: {
          day:  { $dayOfWeek: "$createdAt" },
          hour: { $hour: "$createdAt" },
        },
        count: { $sum: 1 },
      }},
    ]);
    // Build 7×24 matrix (row=day 0-6, col=hour 0-23)
    const heatmap = Array.from({ length: 7 }, (_, day) =>
      Array.from({ length: 24 }, (_, hour) => {
        const mongoDow = day + 1;
        const entry = heatRaw.find(r => r._id.day === mongoDow && r._id.hour === hour);
        return entry?.count ?? 0;
      })
    );

    // ── Top pages ─────────────────────────────────────────────────────────────
    const topPages = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: "$path", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // ── Top referrers ─────────────────────────────────────────────────────────
    const topReferrers = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart }, referrer: { $nin: ["Direct", "", null] } } },
      { $group: { _id: "$referrer", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    // ── Entry pages (first page of each session) ──────────────────────────────
    const entryPages = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart }, isEntry: true } },
      { $group: { _id: "$path", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    // ── UTM campaigns ─────────────────────────────────────────────────────────
    const utmCampaigns = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart }, utmCampaign: { $nin: ["", null] } } },
      { $group: {
        _id: { source: "$utmSource", medium: "$utmMedium", campaign: "$utmCampaign" },
        count: { $sum: 1 },
      }},
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // ── Devices & Browsers ────────────────────────────────────────────────────
    const devicesRaw = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: "$device", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const deviceTotal = devicesRaw.reduce((s, d) => s + d.count, 0) || 1;
    const devices = devicesRaw.map(d => ({
      device: d._id || "Unknown", count: d.count,
      pct: Math.round((d.count / deviceTotal) * 100),
    }));

    const browsersRaw = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: "$browser", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const browserTotal = browsersRaw.reduce((s, d) => s + d.count, 0) || 1;
    const browsers = browsersRaw.map(b => ({
      browser: b._id || "Unknown", count: b.count,
      pct: Math.round((b.count / browserTotal) * 100),
    }));

    // ── Top countries ─────────────────────────────────────────────────────────
    const countries = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart }, country: { $nin: ["Unknown", null] } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    // ── Recent visits ─────────────────────────────────────────────────────────
    const recentVisits = await PageView.find()
      .sort({ createdAt: -1 }).limit(25).lean();

    res.json({
      generatedAt: now.toISOString(),
      kpis: {
        totalViews, todayViews, weekViews, uniqueVisitors, liveVisitors,
        bounceRate, avgPagesPerSession, avgDurationSecs,
      },
      hourlyViews,
      daily30,
      heatmap,
      topPages:     topPages.map(p    => ({ path: p._id || "/",         count: p.count })),
      topReferrers: topReferrers.map(r => ({ referrer: r._id || "?",    count: r.count })),
      entryPages:   entryPages.map(e   => ({ path: e._id || "/",        count: e.count })),
      utmCampaigns: utmCampaigns.map(u => ({
        source: u._id.source, medium: u._id.medium,
        campaign: u._id.campaign, count: u.count,
      })),
      devices,
      browsers,
      countries: countries.map(c => ({ country: c._id, count: c.count })),
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
    const User = require("../db/models/user");
    const users = await User.find()
      .select("-passwordHash -emailVerifyToken -passwordResetToken -passwordResetExpires -emailVerifyTokenExpires")
      .sort({ createdAt: -1 })
      .lean();

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
        id: u._id.toString(),
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
