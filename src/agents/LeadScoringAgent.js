// ============================================================
// LEAD SCORING AGENT (Phase 5)
// Scores and prioritizes leads based on multiple signals
// Company size + Revenue + Engagement + Sentiment + Alignment
// ============================================================

const Sentiment = require("sentiment");
const logger = require("../utils/logger").forAgent("LeadScoringAgent");
const icpConfig = require("../config/icp.config");
const { formatRevenue } = require("../utils/helpers");

const HIGH_PRIORITY_SCORE = parseInt(process.env.HIGH_PRIORITY_SCORE || "75");
const MEDIUM_PRIORITY_SCORE = parseInt(process.env.MEDIUM_PRIORITY_SCORE || "50");

class LeadScoringAgent {
  constructor() {
    this.sentimentAnalyzer = new Sentiment();
    this.scoredLeads = [];
  }

  /**
   * MAIN ENTRY POINT
   * Scores all contacts, then deduplicates by company (best contact per company wins).
   */
  async run(contacts, companies, outreachLog = [], responses = []) {
    logger.info(`=== LEAD SCORING AGENT STARTING ===`);
    logger.info(`Scoring ${contacts.length} contacts`);

    const scored = [];

    for (const contact of contacts) {
      const company = companies.find(
        (c) => c.id === contact.companyId || c.name === contact.company
      );

      const contactOutreach = outreachLog.filter((o) => o.contactId === contact.id);
      const contactResponses = responses.filter((r) => r.contactId === contact.id);

      const score = this.scoreContact(contact, company, contactOutreach, contactResponses);
      scored.push(score);
    }

    // Sort by total score descending
    scored.sort((a, b) => b.totalScore - a.totalScore);

    // ── Deduplicate by company: keep only the highest-scoring contact per company ──
    // This prevents duplicate rows in Lead Scores when a company has multiple contacts
    const seenCompanies = new Map();
    const deduped = [];
    for (const entry of scored) {
      const companyKey = (entry.companyId || entry.companyName || "").toLowerCase();
      if (!seenCompanies.has(companyKey)) {
        seenCompanies.set(companyKey, true);
        deduped.push(entry);
      } else {
        logger.debug(`Dedup: skipping additional contact for company "${entry.companyName}"`);
      }
    }

    logger.info(`Lead score dedup: ${scored.length} contacts → ${deduped.length} unique companies`);

    // Assign priority labels
    const prioritized = deduped.map((s) => ({
      ...s,
      priority: this.getPriorityLabel(s.totalScore),
    }));

    this.scoredLeads = prioritized;

    // Log distribution
    const high = prioritized.filter((p) => p.priority === "HIGH").length;
    const med = prioritized.filter((p) => p.priority === "MEDIUM").length;
    const low = prioritized.filter((p) => p.priority === "LOW").length;

    logger.info(`Scoring complete: ${high} HIGH | ${med} MEDIUM | ${low} LOW priority`);

    return prioritized;
  }

  /**
   * Score a single contact across all dimensions
   */
  scoreContact(contact, company, outreachHistory, responses) {
    const companyScore = this.scoreCompany(company);
    const roleScore = this.scoreRole(contact.title);
    const engagementScore = this.scoreEngagement(outreachHistory, responses);
    const sentimentScore = this.scoreSentiment(responses);
    const alignmentScore = this.scoreStrategicAlignment(contact, company);

    const totalScore = Math.min(100, Math.round(
      companyScore * 0.30 +
      roleScore * 0.20 +
      engagementScore * 0.25 +
      sentimentScore * 0.15 +
      alignmentScore * 0.10
    ));

    return {
      contactId: contact.id,
      contactName: contact.name,
      title: contact.title,
      email: contact.email,
      companyId: company?.id,
      companyName: contact.company,
      companySize: company?.employeeCount ? this._sizeLabel(company.employeeCount) : "Unknown",
      revenue: company?.revenue ? formatRevenue(company.revenue) : "Unknown",
      totalScore,
      companyScore: Math.round(companyScore),
      roleScore: Math.round(roleScore),
      engagementScore: Math.round(engagementScore),
      sentimentScore: Math.round(sentimentScore),
      alignmentScore: Math.round(alignmentScore),
      touchCount: outreachHistory.length,
      responseCount: responses.length,
      lastActivity: outreachHistory.slice(-1)[0]?.sentAt || null,
      buyingSignals: responses.flatMap((r) => r.buyingSignals || []),
      scoreBreakdown: {
        company: `${Math.round(companyScore)}/100 (weight: 30%)`,
        role: `${Math.round(roleScore)}/100 (weight: 20%)`,
        engagement: `${Math.round(engagementScore)}/100 (weight: 25%)`,
        sentiment: `${Math.round(sentimentScore)}/100 (weight: 15%)`,
        alignment: `${Math.round(alignmentScore)}/100 (weight: 10%)`,
      },
      scoredAt: new Date().toISOString(),
      source: contact.source || company?.source || "Direct / Unknown",
    };
  }

  /**
   * Score company based on size and revenue
   */
  scoreCompany(company) {
    if (!company) return 20; // Unknown = low base

    let score = 0;

    // Employee count scoring
    const emp = company.employeeCount || 0;
    const empRange = icpConfig.company.employeeRanges.find(
      (r) => emp >= r.min && emp <= r.max
    );
    score += empRange ? empRange.score : 0;

    // Revenue scoring
    const rev = company.revenue || 0;
    const revRange = icpConfig.company.revenueRanges.find(
      (r) => rev >= r.min && rev <= r.max
    );
    score += revRange ? revRange.score : 0;

    // Technology signal match
    const techSignals = company.technologies || [];
    const signalMatches = icpConfig.company.technologySignals.filter((sig) =>
      techSignals.some((t) => t.toLowerCase().includes(sig.toLowerCase()))
    ).length;
    score += Math.min(20, signalMatches * 5);

    // Geographic match
    const hq = company.headquarters || "";
    const geoMatch = icpConfig.company.geographics.some((g) =>
      hq.toLowerCase().includes(g.toLowerCase())
    );
    score += geoMatch ? 10 : 0;

    return Math.min(100, score);
  }

  /**
   * Score contact role by seniority/relevance
   */
  scoreRole(title = "") {
    const t = title.toLowerCase();

    if (icpConfig.roles.primary.some((r) => t.includes(r.toLowerCase()))) return 100;
    if (icpConfig.roles.secondary.some((r) => t.includes(r.toLowerCase()))) return 70;
    if (icpConfig.roles.tertiary.some((r) => t.includes(r.toLowerCase()))) return 40;

    // Generic technical roles
    if (t.includes("engineer") || t.includes("architect")) return 30;
    if (t.includes("manager") || t.includes("director")) return 50;
    if (t.includes("vp") || t.includes("vice president")) return 80;
    if (t.includes("c-level") || t.includes("chief")) return 90;

    return 20; // Unknown role
  }

  /**
   * Score engagement based on outreach history
   */
  scoreEngagement(outreachHistory, responses) {
    let score = 0;

    // Penalize no engagement
    if (outreachHistory.length === 0) return 0;

    // Score for completed touch points
    score += Math.min(30, outreachHistory.length * 10);

    // Massive bonus for any response
    if (responses.length > 0) {
      score += 40;

      // Extra for multiple responses (real interest)
      score += Math.min(20, (responses.length - 1) * 10);

      // Check response intent
      const intents = responses.map((r) => r.intent);
      if (intents.includes("Interested")) score += 20;
      if (intents.includes("Needs More Info")) score += 10;
      if (intents.includes("Not Interested")) score = Math.max(0, score - 30);
    }

    return Math.min(100, score);
  }

  /**
   * Score sentiment of responses using NLP
   */
  scoreSentiment(responses) {
    if (responses.length === 0) return 50; // Neutral baseline

    let totalSentiment = 0;
    let count = 0;

    for (const response of responses) {
      if (response.sentiment === "Positive") {
        totalSentiment += 100;
      } else if (response.sentiment === "Neutral") {
        totalSentiment += 50;
      } else if (response.sentiment === "Negative") {
        totalSentiment += 0;
      } else if (response.emailBody) {
        // Fallback: run NLP sentiment on email body
        const result = this.sentimentAnalyzer.analyze(response.emailBody);
        const normalized = Math.max(0, Math.min(100, 50 + result.comparative * 20));
        totalSentiment += normalized;
      } else {
        totalSentiment += 50;
      }
      count++;
    }

    return count > 0 ? totalSentiment / count : 50;
  }

  /**
   * Score strategic alignment (do they have the tech signals we look for?)
   */
  scoreStrategicAlignment(contact, company) {
    let score = 50; // Base

    const text = [
      company?.description || "",
      contact.title || "",
      (company?.technologies || []).join(" "),
      (company?.keywords || []).join(" "),
    ].join(" ").toLowerCase();

    // Check for sensor integration signals
    const sensorKeywords = ["lidar", "sensor", "slam", "imu", "depth", "3d", "mapping", "perception"];
    const sensorMatches = sensorKeywords.filter((kw) => text.includes(kw)).length;
    score += Math.min(30, sensorMatches * 6);

    // ROS compatibility signal
    if (text.includes("ros") || text.includes("robot operating system")) {
      score += 20;
    }

    return Math.min(100, score);
  }

  getPriorityLabel(score) {
    if (score >= HIGH_PRIORITY_SCORE) return "HIGH";
    if (score >= MEDIUM_PRIORITY_SCORE) return "MEDIUM";
    return "LOW";
  }

  _sizeLabel(count) {
    if (count >= 1000) return "Enterprise (1000+)";
    if (count >= 200) return "Mid-Market (200-999)";
    if (count >= 50) return "SMB (50-199)";
    return "Startup (<50)";
  }

  /**
   * Get top N urgent leads
   */
  getHighPriorityLeads(n = 10) {
    return this.scoredLeads
      .filter((l) => l.priority === "HIGH")
      .slice(0, n);
  }

  /**
   * Get leads needing attention (responded but not followed up)
   */
  getLeadsNeedingFollowUp() {
    return this.scoredLeads.filter(
      (l) => l.responseCount > 0 && l.touchCount < 3
    );
  }

  getStats() {
    const high = this.scoredLeads.filter((l) => l.priority === "HIGH").length;
    const med = this.scoredLeads.filter((l) => l.priority === "MEDIUM").length;
    const low = this.scoredLeads.filter((l) => l.priority === "LOW").length;
    const avgScore = this.scoredLeads.length
      ? Math.round(this.scoredLeads.reduce((a, b) => a + b.totalScore, 0) / this.scoredLeads.length)
      : 0;

    return {
      total: this.scoredLeads.length,
      highPriority: high,   // used by dashboard
      mediumPriority: med,  // used by dashboard
      lowPriority: low,     // used by dashboard
      high,                 // legacy alias
      medium: med,          // legacy alias
      low,                  // legacy alias
      avgScore,
    };
  }
}

module.exports = LeadScoringAgent;
