// ============================================================
// REPORTING AGENT (Phase 6)
// Provides complete pipeline console summaries based on Mongo state
// ============================================================

const logger = require("../utils/logger").forAgent("ReportingAgent");

class ReportingAgent {
  constructor() {
    this.reportData = {};
  }

  /**
   * MAIN ENTRY POINT
   * Generates summary reports locally and relies on Mongo for persistence.
   */
  async run({ companies = [], contacts = [], outreachLog = [], responses = [], leadScores = [] }) {
    logger.info(`=== REPORTING AGENT STARTING ===`);
    
    // Generate console summary
    this.printSummary({ companies, contacts, outreachLog, responses, leadScores });

    logger.info(`=== REPORTING COMPLETE ===`);
    return { success: true };
  }

  /**
   * Print a formatted summary report to console
   */
  printSummary({ companies, contacts, outreachLog, responses, leadScores }) {
    const divider = "═".repeat(60);
    const line = "─".repeat(60);

    console.log(`\n${divider}`);
    console.log(`   LEADER AGENT — PIPELINE SUMMARY`);
    console.log(`   ${new Date().toLocaleString()}`);
    console.log(divider);

    console.log(`\n📡 DISCOVERY`);
    console.log(line);
    console.log(`  Companies discovered:    ${companies.length}`);
    console.log(`  ICP-qualified:           ${companies.filter((c) => c.icpScore >= 50).length}`);

    const segments = {};
    companies.forEach((c) => {
      const seg = c.primarySegment || "Unknown";
      segments[seg] = (segments[seg] || 0) + 1;
    });
    console.log(`  By segment:`);
    Object.entries(segments)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([seg, count]) => console.log(`    • ${seg}: ${count}`));

    console.log(`\n👥 ENRICHMENT`);
    console.log(line);
    console.log(`  Contacts enriched:       ${contacts.length}`);
    console.log(`  With verified email:     ${contacts.filter((c) => c.emailStatus === "verified").length}`);
    console.log(`  With phone:              ${contacts.filter((c) => c.phone).length}`);

    const roles = {};
    contacts.forEach((c) => {
      const role = this._categorizeRole(c.title);
      roles[role] = (roles[role] || 0) + 1;
    });
    console.log(`  By role category:`);
    Object.entries(roles).forEach(([r, n]) => console.log(`    • ${r}: ${n}`));

    console.log(`\n📧 OUTREACH`);
    console.log(line);
    console.log(`  Total sent:              ${outreachLog.filter((o) => o.status === "sent").length}`);
    console.log(`  Email:                   ${outreachLog.filter((o) => o.type === "email" && o.status === "sent").length}`);


    const stepCounts = {};
    outreachLog.forEach((o) => {
      if (o.status === "sent") stepCounts[o.step] = (stepCounts[o.step] || 0) + 1;
    });
    Object.entries(stepCounts).forEach(([step, count]) =>
      console.log(`    • Step ${step}: ${count} sent`)
    );

    console.log(`\n💬 RESPONSES`);
    console.log(line);
    const responseRate = outreachLog.length > 0
      ? ((responses.length / outreachLog.filter((o) => o.status === "sent").length) * 100).toFixed(1)
      : "0";
    console.log(`  Inbound responses:       ${responses.length}`);
    console.log(`  Response rate:           ${responseRate}%`);

    const intentCounts = {};
    responses.forEach((r) => {
      intentCounts[r.intent] = (intentCounts[r.intent] || 0) + 1;
    });
    Object.entries(intentCounts).forEach(([intent, count]) =>
      console.log(`    • ${intent}: ${count}`)
    );

    console.log(`\n🎯 LEAD SCORES`);
    console.log(line);
    const high = leadScores.filter((l) => l.priority === "HIGH");
    const med = leadScores.filter((l) => l.priority === "MEDIUM");
    const low = leadScores.filter((l) => l.priority === "LOW");
    const avg = leadScores.length
      ? Math.round(leadScores.reduce((a, b) => a + b.totalScore, 0) / leadScores.length)
      : 0;

    console.log(`  🔴 HIGH priority:        ${high.length}`);
    console.log(`  🟡 MEDIUM priority:      ${med.length}`);
    console.log(`  🟢 LOW priority:         ${low.length}`);
    console.log(`  Average score:           ${avg}/100`);

    if (high.length > 0) {
      console.log(`\n⭐ TOP 5 HIGH-PRIORITY LEADS`);
      console.log(line);
      high.slice(0, 5).forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.contactName} (${l.title})`);
        console.log(`     @ ${l.companyName} | Score: ${l.totalScore}/100`);
        console.log(`     Revenue: ${l.revenue} | Size: ${l.companySize}`);
      });
    }

    console.log(`\n${divider}\n`);
  }

  _categorizeRole(title = "") {
    const t = title.toLowerCase();
    if (t.includes("cto") || t.includes("chief technology")) return "C-Suite";
    if (t.includes("vp") || t.includes("vice president")) return "VP Level";
    if (t.includes("director")) return "Director";
    if (t.includes("engineer")) return "Engineer";
    if (t.includes("manager")) return "Manager";
    return "Other";
  }
}

module.exports = ReportingAgent;
