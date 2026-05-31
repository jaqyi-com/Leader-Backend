/**
 * Admin Analytics Route  — OWNER ONLY
 * GET /api/analytics
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
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

router.use((req, res, next) => {
  const callerEmail = (req.user?.email || "").toLowerCase().trim();
  if (!callerEmail) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!ADMIN_EMAIL) {
    // ADMIN_EMAIL not set in .env — deny all for safety
    return res.status(503).json({ error: "Analytics admin email not configured on server." });
  }
  if (callerEmail !== ADMIN_EMAIL) {
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

/**
 * Returns a $dateToString format string & bucket count
 * for "last N days" trend data.
 */
function trendPipeline(Model, days = 30, matchFilter = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return safeAggregate(Model, [
    { $match: { createdAt: { $gte: since }, ...matchFilter } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

// ─── Main Route ─────────────────────────────────────────────────────────────

/**
 * GET /api/analytics
 *
 * Query params:
 *   days  (number, default 30) — window for trend data
 */
router.get("/", async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);

    // ── Parallel data fetching ───────────────────────────────────────────────
    const [
      // Lead generation
      totalCompanies,
      totalContacts,
      totalGeneratedLeads,
      totalPlaces,

      // Outreach
      totalOutreachSent,
      totalOutreachReplied,
      totalResponses,
      totalCampaigns,
      activeCampaigns,

      // Lead scores
      highPriorityLeads,
      mediumPriorityLeads,
      lowPriorityLeads,

      // Crawler / Website Intel
      totalWebsites,
      totalCrawlRuns,
      completedCrawlRuns,
      totalAutoScraperSessions,

      // Social media
      totalSocialPosts,
      publishedPosts,
      pendingApprovalPosts,

      // CRM
      totalDeals,
      wonDeals,
      lostDeals,
      openDeals,
      totalActivities,
      totalInvoices,
      totalPayments,

      // Payroll / HR
      totalEmployees,
      totalPayslips,

      // Accounting
      totalVouchers,

      // Inventory
      totalStockItems,
      totalOrders,

      // Outreach status breakdown
      outreachStatusAgg,

      // Generated lead status breakdown
      generatedLeadStatusAgg,

      // Deal stage/value aggregation
      dealValueAgg,

      // Social platform breakdown
      socialPlatformAgg,

      // Trend data (daily counts over `days` window)
      contactTrend,
      generatedLeadTrend,
      outreachTrend,
      crawlRunTrend,
      dealTrend,

    ] = await Promise.all([
      // Lead generation
      safeCount(db.Company),
      safeCount(db.Contact),
      safeCount(db.GeneratedLead),
      safeCount(db.Place),

      // Outreach
      safeCount(db.OutreachLog, { status: { $in: ["sent", "delivered"] } }),
      safeCount(db.OutreachLog, { status: "replied" }),
      safeCount(db.Response),
      safeCount(db.OutreachCampaign),
      safeCount(db.OutreachCampaign, { status: "active" }),

      // Lead scores
      safeCount(db.LeadScore, { priority: "HIGH" }),
      safeCount(db.LeadScore, { priority: "MEDIUM" }),
      safeCount(db.LeadScore, { priority: "LOW" }),

      // Crawler
      safeCount(db.Website),
      safeCount(db.CrawlRun),
      safeCount(db.CrawlRun, { status: "completed" }),
      safeCount(db.AutoScraperSession),

      // Social
      safeCount(db.SocialPost),
      safeCount(db.SocialPost, { status: "published" }),
      safeCount(db.SocialPost, { status: "pending_approval" }),

      // CRM
      safeCount(db.Deal),
      safeCount(db.Deal, { stage: "won" }),
      safeCount(db.Deal, { stage: "lost" }),
      safeCount(db.Deal, { stage: { $nin: ["won", "lost"] } }),
      safeCount(db.Activity),
      safeCount(db.Invoice),
      safeCount(db.Payment),

      // Payroll
      safeCount(db.Employee),
      safeCount(db.Payslip),

      // Accounting
      safeCount(db.Voucher),

      // Inventory
      safeCount(db.StockItem),
      safeCount(db.Order),

      // Breakdowns
      safeAggregate(db.OutreachLog, [
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      safeAggregate(db.GeneratedLead, [
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      safeAggregate(db.Deal, [
        {
          $group: {
            _id: "$stage",
            count: { $sum: 1 },
            totalValue: { $sum: "$value" },
          },
        },
        { $sort: { totalValue: -1 } },
      ]),

      safeAggregate(db.SocialPost, [
        { $group: { _id: "$platform", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Trends
      trendPipeline(db.Contact,       days),
      trendPipeline(db.GeneratedLead, days),
      trendPipeline(db.OutreachLog,   days),
      trendPipeline(db.CrawlRun,      days),
      trendPipeline(db.Deal,          days),
    ]);

    // ── Payment revenue total ────────────────────────────────────────────────
    const paymentRevenueAgg = await safeAggregate(db.Payment, [
      { $match: { status: { $in: ["paid", "completed"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = paymentRevenueAgg[0]?.total ?? 0;

    // ── Response intent breakdown ────────────────────────────────────────────
    const responseIntentAgg = await safeAggregate(db.Response, [
      { $group: { _id: "$intent", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // ── Reply-rate (only meaningful when sent > 0) ───────────────────────────
    const totalOutreachLogs = await safeCount(db.OutreachLog);
    const replyRate =
      totalOutreachLogs > 0
        ? Math.round((totalOutreachReplied / totalOutreachLogs) * 10000) / 100
        : 0;

    // ── Build & return payload ───────────────────────────────────────────────
    res.json({
      generatedAt: new Date().toISOString(),
      window: { days },

      // ── Overview KPIs ──────────────────────────────────────────────────────
      overview: {
        totalLeads:         totalContacts + totalGeneratedLeads,
        totalCompanies,
        totalContacts,
        totalGeneratedLeads,
        totalPlaces,
        totalWebsites,
        replyRate: `${replyRate}%`,
      },

      // ── Lead Generation ────────────────────────────────────────────────────
      leadGeneration: {
        companies:      totalCompanies,
        contacts:       totalContacts,
        generatedLeads: totalGeneratedLeads,
        places:         totalPlaces,
        generatedLeadStatusBreakdown: generatedLeadStatusAgg.map(s => ({
          status: s._id || "unknown",
          count:  s.count,
        })),
      },

      // ── Lead Scoring ───────────────────────────────────────────────────────
      leadScoring: {
        high:   highPriorityLeads,
        medium: mediumPriorityLeads,
        low:    lowPriorityLeads,
        total:  highPriorityLeads + mediumPriorityLeads + lowPriorityLeads,
      },

      // ── Outreach ───────────────────────────────────────────────────────────
      outreach: {
        totalLogs:       totalOutreachLogs,
        sent:            totalOutreachSent,
        replied:         totalOutreachReplied,
        replyRate:       `${replyRate}%`,
        totalResponses,
        campaigns: {
          total:  totalCampaigns,
          active: activeCampaigns,
        },
        statusBreakdown: outreachStatusAgg.map(s => ({
          status: s._id || "unknown",
          count:  s.count,
        })),
        responseIntents: responseIntentAgg.map(r => ({
          intent: r._id || "unknown",
          count:  r.count,
        })),
      },

      // ── Crawler / Website Intelligence ─────────────────────────────────────
      crawler: {
        totalWebsites,
        crawlRuns: {
          total:     totalCrawlRuns,
          completed: completedCrawlRuns,
        },
        autoScraperSessions: totalAutoScraperSessions,
      },

      // ── Social Media ───────────────────────────────────────────────────────
      social: {
        total:          totalSocialPosts,
        published:      publishedPosts,
        pendingApproval: pendingApprovalPosts,
        platformBreakdown: socialPlatformAgg.map(p => ({
          platform: p._id || "unknown",
          count:    p.count,
        })),
      },

      // ── CRM ────────────────────────────────────────────────────────────────
      crm: {
        deals: {
          total:  totalDeals,
          open:   openDeals,
          won:    wonDeals,
          lost:   lostDeals,
          stageBreakdown: dealValueAgg.map(d => ({
            stage:      d._id || "unknown",
            count:      d.count,
            totalValue: d.totalValue ?? 0,
          })),
        },
        activities: totalActivities,
        invoices:   totalInvoices,
        payments:   totalPayments,
        revenue:    totalRevenue,
      },

      // ── Payroll / HR ───────────────────────────────────────────────────────
      hr: {
        employees: totalEmployees,
        payslips:  totalPayslips,
      },

      // ── Accounting ─────────────────────────────────────────────────────────
      accounting: {
        vouchers: totalVouchers,
      },

      // ── Inventory ──────────────────────────────────────────────────────────
      inventory: {
        stockItems: totalStockItems,
        orders:     totalOrders,
      },

      // ── Trend Data ─────────────────────────────────────────────────────────
      trends: {
        contacts:       contactTrend.map(t => ({ date: t._id, count: t.count })),
        generatedLeads: generatedLeadTrend.map(t => ({ date: t._id, count: t.count })),
        outreach:       outreachTrend.map(t => ({ date: t._id, count: t.count })),
        crawlRuns:      crawlRunTrend.map(t => ({ date: t._id, count: t.count })),
        deals:          dealTrend.map(t => ({ date: t._id, count: t.count })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/analytics/traffic ──────────────────────────────────────────────
// Website traffic stats — admin-only (covered by router.use guard above)
router.get("/traffic", async (req, res) => {
  try {
    const { PageView } = db;
    const now      = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dayStart   = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // ── KPI counts ────────────────────────────────────────────────────────────
    const [totalViews, todayViews, weekViews] = await Promise.all([
      safeCount(PageView),
      safeCount(PageView, { createdAt: { $gte: todayStart } }),
      safeCount(PageView, { createdAt: { $gte: weekStart } }),
    ]);

    // Unique visitors = distinct sessionIds in last 7 days
    const uniqueResult = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart }, sessionId: { $ne: "" } } },
      { $group: { _id: "$sessionId" } },
      { $count: "total" },
    ]);
    const uniqueVisitors = uniqueResult[0]?.total ?? 0;

    // ── Hourly views — last 24 hours (24 buckets, one per hour) ───────────────
    const hourlyRaw = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: dayStart } } },
      { $group: {
        _id: { $hour: "$createdAt" },
        count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);
    // Fill all 24 hour slots
    const hourlyMap = {};
    hourlyRaw.forEach(h => { hourlyMap[h._id] = h.count; });
    const currentHour = now.getHours();
    const hourlyViews = Array.from({ length: 24 }, (_, i) => {
      // Rotate so earliest hour comes first
      const hour = (currentHour + 1 + i) % 24;
      return { hour, count: hourlyMap[hour] ?? 0 };
    });

    // ── Top pages (last 7 days) ────────────────────────────────────────────────
    const topPages = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: "$path", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // ── Devices ───────────────────────────────────────────────────────────────
    const devicesRaw = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: "$device", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const deviceTotal = devicesRaw.reduce((s, d) => s + d.count, 0) || 1;
    const devices = devicesRaw.map(d => ({
      device: d._id || "Unknown",
      count:  d.count,
      pct:    Math.round((d.count / deviceTotal) * 100),
    }));

    // ── Browsers ──────────────────────────────────────────────────────────────
    const browsersRaw = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: "$browser", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const browserTotal = browsersRaw.reduce((s, d) => s + d.count, 0) || 1;
    const browsers = browsersRaw.map(b => ({
      browser: b._id || "Unknown",
      count:   b.count,
      pct:     Math.round((b.count / browserTotal) * 100),
    }));

    // ── Top countries ─────────────────────────────────────────────────────────
    const countries = await safeAggregate(PageView, [
      { $match: { createdAt: { $gte: weekStart }, country: { $ne: "Unknown" } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    // ── Recent visits (last 20) ───────────────────────────────────────────────
    const recentVisits = await PageView.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      generatedAt: now.toISOString(),
      kpis: { totalViews, todayViews, weekViews, uniqueVisitors },
      hourlyViews,
      topPages: topPages.map(p => ({ path: p._id || "/", count: p.count })),
      devices,
      browsers,
      countries: countries.map(c => ({ country: c._id, count: c.count })),
      recentVisits: recentVisits.map(v => ({
        path:      v.path,
        device:    v.device,
        browser:   v.browser,
        country:   v.country,
        city:      v.city,
        referrer:  v.referrer,
        when:      v.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

