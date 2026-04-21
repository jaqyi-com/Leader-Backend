// ============================================================
// PIPELINE ORCHESTRATOR
// Coordinates all 6 agents in sequence or individually
// The "brain" that wires everything together
// ============================================================

const logger = require("./utils/logger").forAgent("Orchestrator");
const dedup = require("./utils/deduplication");
const cliProgress = require("cli-progress");
const chalk = require("chalk");

const ScrapingAgent    = require("./agents/ScrapingAgent");
const EnrichmentAgent  = require("./agents/EnrichmentAgent");
const OutreachAgent    = require("./agents/OutreachAgent");
const LeadScoringAgent = require("./agents/LeadScoringAgent");
const ReportingAgent   = require("./agents/ReportingAgent");

class PipelineOrchestrator {
  constructor() {
    this.scraping    = new ScrapingAgent();
    this.enrichment  = new EnrichmentAgent();
    this.outreach    = new OutreachAgent();
    this.scoring     = new LeadScoringAgent();
    this.reporting   = new ReportingAgent();

    // Shared pipeline state
    this.state = {
      companies : [],
      contacts  : [],
      outreachLog: [],
      responses : [],
      leadScores: [],
    };
  }

  async _initDedup() {
    if (!dedup.isLoaded) {
      await dedup.loadFromDB();
    }
  }

  // ──────────────────────────────────────────────────────────
  // FULL PIPELINE
  // ──────────────────────────────────────────────────────────
  async runFull() {
    this._printBanner();
    logger.info("Starting FULL pipeline run");
    await this._initDedup();

    const timer = this._startTimer();

    await this.runScraping();
    await this.runEnrichment();
    await this.runOutreach();
    await this.runScoring();
    await this.runReporting();

    const elapsed = timer();
    logger.info(`Full pipeline completed in ${elapsed}`);
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 2 — SCRAPING
  // ──────────────────────────────────────────────────────────
  async runScraping() {
    await this._initDedup();
    logger.info(chalk.cyan("\n▶ PHASE 2: Company Discovery & Scraping"));

    const bar = this._createProgressBar("Scraping");
    bar.start(100, 0, { status: "Starting scraper..." });

    bar.update(10, { status: "Fetching robotics directories..." });
    const companies = await this.scraping.run();

    bar.update(90, { status: "Saving to MongoDB..." });
    this.state.companies = companies;
    await this._saveState("companies", companies);

    bar.update(100, { status: "Done" });
    bar.stop();

    logger.info(`  ✓ ${companies.length} ICP-qualified companies discovered`);
    return companies;
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 3 — ENRICHMENT
  // ──────────────────────────────────────────────────────────
  async runEnrichment() {
    await this._initDedup();
    logger.info(chalk.cyan("\n▶ PHASE 3: Decision-Maker Identification & Enrichment"));

    if (this.state.companies.length === 0) {
      this.state.companies = await this._loadState("companies") || [];
    }

    if (this.state.companies.length === 0) {
      logger.warn("No companies found. Run scraping phase first.");
      return;
    }

    const bar = this._createProgressBar("Enrichment");
    bar.start(this.state.companies.length, 0, { status: "Starting enrichment..." });

    const { companies, contacts } = await this.enrichment.run(this.state.companies);

    this.state.companies = companies;
    this.state.contacts  = contacts;
    await this._saveState("companies", companies);
    await this._saveState("contacts",  contacts);

    bar.update(this.state.companies.length, { status: "Done" });
    bar.stop();

    logger.info(`  ✓ ${contacts.length} decision-makers enriched`);
    return contacts;
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 4 — OUTREACH
  // ──────────────────────────────────────────────────────────
  async runOutreach(step = 1, approvedEmailIds = null) {
    await this._initDedup();
    logger.info(chalk.cyan(`\n▶ PHASE 4: AI-Personalized Outreach (Step ${step})`));

    if (this.state.contacts.length === 0) {
      this.state.contacts = await this._loadState("contacts") || this.enrichment.loadSavedContacts();
    }

    if (this.state.contacts.length === 0) {
      logger.warn("No contacts found. Run enrichment phase first.");
      return;
    }

    const results = await this.outreach.run(this.state.contacts, step, approvedEmailIds);

    const log = this.outreach.getOutreachLog();
    this.state.outreachLog = log;
    await this._saveState("outreach_log", log);

    logger.info(`  ✓ ${results.sent.length} messages sent`);
    return results;
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 5 — SCORING
  // ──────────────────────────────────────────────────────────
  async runScoring() {
    await this._initDedup();
    logger.info(chalk.cyan("\n▶ PHASE 5: Lead Scoring & Prioritization"));

    if (!this.state.contacts.length)    this.state.contacts    = await this._loadState("contacts") || [];
    if (!this.state.companies.length)   this.state.companies   = await this._loadState("companies") || [];
    if (!this.state.outreachLog.length) this.state.outreachLog = await this._loadState("outreach_log") || [];
    if (!this.state.responses.length)   this.state.responses   = await this._loadState("responses") || [];

    const scores = await this.scoring.run(
      this.state.contacts,
      this.state.companies,
      this.state.outreachLog,
      this.state.responses
    );

    this.state.leadScores = scores;
    await this._saveState("lead_scores", scores);

    const stats = this.scoring.getStats();
    logger.info(`  ✓ ${stats.high} HIGH | ${stats.medium} MEDIUM | ${stats.low} LOW priority`);
    return scores;
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 6 — REPORTING
  // ──────────────────────────────────────────────────────────
  async runReporting() {
    await this._initDedup();
    logger.info(chalk.cyan("\n▶ PHASE 6: Reporting Phase"));

    if (!this.state.companies.length)   this.state.companies   = await this._loadState("companies") || [];
    if (!this.state.contacts.length)    this.state.contacts    = await this._loadState("contacts") || [];
    if (!this.state.outreachLog.length) this.state.outreachLog = await this._loadState("outreach_log") || [];
    if (!this.state.responses.length)   this.state.responses   = await this._loadState("responses") || [];
    if (!this.state.leadScores.length)  this.state.leadScores  = await this._loadState("lead_scores") || [];

    await this.reporting.run(this.state);
    logger.info("  ✓ Console Report generated. All data is persisted in MongoDB Atlas.");
  }

  // ──────────────────────────────────────────────────────────
  // PROCESS AN INBOUND REPLY (called ad-hoc)
  // ──────────────────────────────────────────────────────────
  async processInboundReply(replyData) {
    logger.info(chalk.cyan("\n▶ Processing inbound reply..."));

    const analysis = await this.outreach.processInboundResponse(replyData);

    const responses = await this._loadState("responses") || [];
    responses.push(analysis);
    await this._saveState("responses", [analysis]); // just upsert the new one
    this.state.responses = responses;

    // Report
    await this.reporting.run({ responses: [analysis] });

    logger.info(`  Intent: ${analysis.intent} | Urgency: ${analysis.urgency}`);
    return analysis;
  }

  // ──────────────────────────────────────────────────────────
  // MONGODB STATE PERSISTENCE
  // ──────────────────────────────────────────────────────────
  async _saveState(key, data) {
    if (!data || !data.length) return;
    const mongoose = require("./db/mongoose");
    try {
      if (key === "companies") {
        const ops = data.map(c => ({ updateOne: { filter: { domain: c.domain || c.name }, update: { $set: c }, upsert: true } }));
        await mongoose.Company.bulkWrite(ops);
      }
      if (key === "contacts") {
        const ops = data.map(c => ({ updateOne: { filter: { email: c.email }, update: { $set: c }, upsert: true } }));
        await mongoose.Contact.bulkWrite(ops);
      }
      if (key === "outreach_log") {
        const ops = data.map(c => ({ updateOne: { filter: { email: c.email, step: c.step }, update: { $set: c }, upsert: true } }));
        await mongoose.OutreachLog.bulkWrite(ops);
      }
      if (key === "responses") {
        const ops = data.map(c => ({ updateOne: { filter: { email: c.from || c.email, receivedAt: c.date }, update: { $set: c }, upsert: true } }));
        await mongoose.Response.bulkWrite(ops);
      }
      if (key === "lead_scores") {
        const ops = data.map(c => ({ updateOne: { filter: { email: c.email }, update: { $set: c }, upsert: true } }));
        await mongoose.LeadScore.bulkWrite(ops);
      }
    } catch (err) {
      logger.warn(`Could not save state to MongoDB [${key}]: ${err.message}`);
    }
  }

  async _loadState(key) {
    const mongoose = require("./db/mongoose");
    try {
      if (key === "companies") return await mongoose.Company.find().lean();
      if (key === "contacts") return await mongoose.Contact.find().lean();
      if (key === "outreach_log") return await mongoose.OutreachLog.find().lean();
      if (key === "responses") return await mongoose.Response.find().lean();
      if (key === "lead_scores") return await mongoose.LeadScore.find().lean();
    } catch (err) {
      logger.warn(`Could not load state from MongoDB [${key}]: ${err.message}`);
    }
    return [];
  }

  // ──────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────
  _createProgressBar(label) {
    return new cliProgress.SingleBar(
      {
        format: `  ${chalk.cyan(label.padEnd(12))} [{bar}] {percentage}% | {status}`,
        barCompleteChar: "█",
        barIncompleteChar: "░",
        hideCursor: true,
        clearOnComplete: false,
      },
      cliProgress.Presets.shades_classic
    );
  }

  _startTimer() {
    const start = Date.now();
    return () => {
      const ms = Date.now() - start;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    };
  }

  _printBanner() {
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════╗
║           LEADER — MULTI-AGENT INTELLIGENCE ENGINE       ║
║          Robotics Market Intelligence & Outreach         ║
║                  Powered by Trinity Agents               ║
╚══════════════════════════════════════════════════════════╝
`));
  }

  getFullStats() {
    return {
      scraping   : this.scraping.getStats(),
      enrichment : this.enrichment.getStats(),
      outreach   : this.outreach.getStats(),
      scoring    : this.scoring.getStats(),
    };
  }
}

module.exports = PipelineOrchestrator;
