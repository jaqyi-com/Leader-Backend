/**
 * Analytics Dashboard Route
 * GET /api/analytics
 *
 * Returns a unified snapshot of key metrics across the entire platform:
 *   • Lead generation (Companies, Contacts, GeneratedLeads, Places)
 *   • Outreach activity (OutreachLog, OutreachCampaigns, Responses)
 *   • Lead scoring distribution
 *   • Crawler / website intelligence (CrawlRuns, Websites, AutoScraperSessions)
 *   • Social media posts
 *   • CRM (Deals, Activities, Invoices, Payments)
 *   • Payroll & HR (Employees, Payslips, Attendance)
 *   • Accounting (Vouchers)
 *   • Inventory (Stock items, Orders)
 *   • Growth over time (last 30 days, daily buckets)
 */

const router = require("express").Router();
const db     = require("../db/mongoose");

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

module.exports = router;
