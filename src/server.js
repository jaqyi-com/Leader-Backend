require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const fetch = require("node-fetch");
const FormData = require("form-data");
const passport = require("passport");
const logger = require("./utils/logger");
const validateCredentials = require("./utils/validateEnv");
const PipelineOrchestrator = require("./orchestrator");
const dedup = require("./utils/deduplication");
const { connectDB } = require("./db/mongoose");
const { cacheGet, cacheSet, cacheDel } = require("./db/redis");
const { pipelineLimiter, placesLimiter, generalLimiter } = require("./middleware/rateLimiter");
const { auth } = require("./middleware/auth");
const authRouter = require("./routes/auth");
const orgRouter = require("./routes/org");
const socialRouter = require("./routes/social");
const chatbotRouter = require("./routes/chatbot");
const { configurePassport } = require("./config/passport");

connectDB();
configurePassport();

// ---- Filesystem paths (use /tmp on Vercel serverless) ----
const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? "/tmp/data" : path.join(__dirname, "../data");
const SCHEDULES_FILE = path.join(DATA_DIR, "schedules.json");
const activeCronJobs = {};

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULES_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveSchedules(schedules) {
  fs.mkdirSync(path.dirname(SCHEDULES_FILE), { recursive: true });
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

function getNextRun(cronExpr) {
  try {
    return cronExpr;
  } catch {
    return null;
  }
}

function registerCronJob(phase, cronExpr, schedules, pipelineRef) {
  if (activeCronJobs[phase]) {
    activeCronJobs[phase].stop();
    delete activeCronJobs[phase];
  }
  if (!cronExpr || schedules[phase]?.enabled === false) return;
  if (!cron.validate(cronExpr)) return;
  activeCronJobs[phase] = cron.schedule(cronExpr, async () => {
    logger.info(`[Scheduler] Running scheduled phase: ${phase}`);
    try {
      if (phase === "all") await pipelineRef.runFull();
      else if (phase === "scrape") await pipelineRef.runScraping();
      else if (phase === "enrich") await pipelineRef.runEnrichment();
      else if (phase === "outreach") await pipelineRef.runOutreach(1);
      else if (phase === "score") await pipelineRef.runScoring();
      else if (phase === "report") await pipelineRef.runReporting();
    } catch (err) {
      logger.error(`[Scheduler] Phase ${phase} failed: ${err.message}`);
    }
  });
  logger.info(`[Scheduler] Registered cron for '${phase}': ${cronExpr}`);
}

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — restrict to known frontend origins in production
// Clean up trailing slashes from env variables just in case
const cleanFrontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, "") : null;
const cleanCorsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.replace(/\/$/, "") : null;

const ALLOWED_ORIGINS = [
  "http://localhost:5174",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://leader-backend-oty3.vercel.app", // Explicitly allow current production frontend
  cleanFrontendUrl,
  cleanCorsOrigin,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin requests (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Clean the incoming origin just in case
      const incomingOrigin = origin.replace(/\/$/, "");
      if (ALLOWED_ORIGINS.includes(incomingOrigin)) return callback(null, true);
      // In development allow all
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      
      console.error(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(passport.initialize());

validateCredentials();
const pipeline = new PipelineOrchestrator();

// ------------------------------------------------------------
// AUTH & ORG ROUTES (public — no auth required)
// ------------------------------------------------------------
app.use("/api/auth", authRouter);
app.use("/api/org", orgRouter);
app.use("/api/social", socialRouter);

// ------------------------------------------------------------
// CHATBOT / RAG ROUTES (protected — auth enforced in router)
// ------------------------------------------------------------
app.use("/api/chatbot", chatbotRouter);

// ------------------------------------------------------------
// API ROUTES
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    name: "Leader API",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/api/stats", generalLimiter, async (req, res) => {
  try {
    const CACHE_KEY = "cache:stats";
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return res.json({ ...cached, _cache: "hit" });
    }
    const stats = pipeline.getFullStats();
    const payload = { status: "running", stats };
    await cacheSet(CACHE_KEY, payload, 300); // 5 min TTL
    res.json({ ...payload, _cache: "miss" });
  } catch (err) {
    logger.error(`Error getting stats: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/reset", async (req, res) => {
  try {
    await dedup.clearMongo();
    await cacheDel("cache:stats");   // invalidate stats cache
    await cacheDel("cache:sheets");  // invalidate sheets cache
    res.json({ success: true, message: "Deduplication memory + Redis cache cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/all",    pipelineLimiter, async (req, res) => {
  logger.info("API Request: Run Full Pipeline");
  try {
    await pipeline.runFull();
    const stats = pipeline.getFullStats();
    res.json({ 
      success: true,
      message: "Full pipeline completed successfully",
      stats
    });
  } catch (err) {
    logger.error(`Full pipeline failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/scrape",  pipelineLimiter, async (req, res) => {
  logger.info("API Request: Scraping Phase");
  try {
    const companies = await pipeline.runScraping(req.body);
    res.json({ 
      success: true, 
      message: "Scraping completed", 
      companiesDiscovered: (companies || []).length
    });
  } catch (err) {
    logger.error(`Scraping failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/enrich",  pipelineLimiter, async (req, res) => {
  logger.info("API Request: Enrichment Phase");
  try {
    const contacts = await pipeline.runEnrichment();
    if (!contacts) {
      return res.status(400).json({ error: "No companies available. Run scrape first." });
    }
    res.json({ 
      success: true, 
      message: "Enrichment completed", 
      contactsEnriched: contacts.length
    });
  } catch (err) {
    logger.error(`Enrichment failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/outreach/preview", async (req, res) => {
  logger.info("API Request: Outreach Preview");
  try {
    const contactsFile = path.join(DATA_DIR, "contacts.json");
    let contacts = [];
    
    if (fs.existsSync(contactsFile)) {
      contacts = JSON.parse(fs.readFileSync(contactsFile, "utf-8"));
      logger.info(`Loaded ${contacts.length} contacts for preview`);
    } else {
      return res.status(400).json({ error: "No contacts found. Please run the Enrichment phase first." });
    }

    if (contacts.length === 0) {
      return res.status(400).json({ error: "No contacts available. Run Enrichment phase first." });
    }

    const totalContacts = contacts.length;
    let limit = parseInt(req.body.limit);
    if (isNaN(limit) || limit <= 0) limit = totalContacts;
    
    let offset = parseInt(req.body.offset);
    if (isNaN(offset) || offset < 0) offset = 0;

    contacts = contacts.slice(offset, offset + limit);
    const hasMore = (offset + limit) < totalContacts;

    const icpPath = path.join(__dirname, "config/icp.config.js");
    delete require.cache[require.resolve(icpPath)];
    const icp = require(icpPath);
    
    const outreachConfigPath = path.join(__dirname, "config/outreach.config.js");
    delete require.cache[require.resolve(outreachConfigPath)];
    const outreachConfig = require(outreachConfigPath);
    
    const llm = require("./integrations/OpenAILLM");
    const OutreachAgent = require("./agents/OutreachAgent");
    const outreachAgent = new OutreachAgent();

    const stepConfig = outreachConfig.sequences.standard.find(s => s.step === 1);
    if (!stepConfig) {
      return res.status(500).json({ error: "No outreach sequence configured for step 1" });
    }

    const template = outreachConfig.promptTemplates[stepConfig.templateId];
    if (!template) {
      return res.status(500).json({ error: `Template ${stepConfig.templateId} not found` });
    }

    const previews = [];
    const companyName = icp?.valueProposition?.company || "Leader";
    const senderName = process.env.SMTP_FROM_NAME || "The Leader Team";
    const signatureHtml = `<br><br>Best regards,<br><b>${senderName}</b><br>${companyName}<br><a href="${icp?.valueProposition?.website || '#'}">${icp?.valueProposition?.website || ''}</a>`;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      try {
        const variables = outreachAgent._buildPersonalizationVariables(contact);
        const { subject, textBody } = await llm.generateOutreachEmail(template, variables);
        
        previews.push({
          id: contact.id || `preview_${i}`,
          to: contact.email,
          toName: contact.name,
          company: contact.company,
          subject: subject,
          body: textBody,
          signature: signatureHtml,
          approved: null,
        });
        logger.info(`Generated preview ${i + 1}/${contacts.length} for ${contact.name}`);
      } catch (err) {
        logger.error(`Failed to generate preview for ${contact.name}: ${err.message}`);
        previews.push({
          id: contact.id || `preview_${i}`,
          to: contact.email,
          toName: contact.name,
          company: contact.company,
          subject: `${companyName} — Partnership Opportunity`,
          body: `Hi ${contact.firstName || contact.name},\n\nI came across ${contact.company} and was impressed by your work in robotics.\n\nAt ${companyName}, we provide precision sensing solutions. I'd love to explore if there's a fit.\n\nWould you be open to a brief call?`,
          signature: signatureHtml,
          approved: null,
        });
      }
    }

    res.json({ success: true, previews, total: totalContacts, hasMore });
  } catch (err) {
    logger.error(`Outreach preview failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/outreach", async (req, res) => {
  const step = parseInt(req.body.step || 1);
  const approved = req.body.approved || null;
  logger.info(`API Request: Outreach Phase (Step ${step})`);
  try {
    const results = await pipeline.runOutreach(step, approved);
    if (!results) {
      return res.status(400).json({ error: "No contacts available. Run enrich first." });
    }
    res.json({
      success: true,
      message: `Outreach Step ${step} completed`,
      results
    });
  } catch (err) {
    logger.error(`Outreach failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/score", async (req, res) => {
  logger.info("API Request: Lead Scoring Phase");
  try {
    const scores = await pipeline.runScoring();
    res.json({ 
      success: true, 
      message: "Scoring completed",
      highPriority: scores.filter(s => s.priority === "HIGH").length,
      mediumPriority: scores.filter(s => s.priority === "MEDIUM").length,
      lowPriority: scores.filter(s => s.priority === "LOW").length
    });
  } catch (err) {
    logger.error(`Scoring failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/report", async (req, res) => {
  logger.info("API Request: Reporting Phase");
  try {
    await pipeline.runReporting();
    res.json({ success: true, message: "Dashboard report generated" });
  } catch (err) {
    logger.error(`Reporting failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/reply", async (req, res) => {
  logger.info("API Request: Process Inbound Reply");
  const replyData = req.body;
  if (!replyData || !replyData.from || !replyData.body) {
    return res.status(400).json({ error: "Invalid reply data. Must include 'from' and 'body' fields." });
  }

  try {
    const analysis = await pipeline.processInboundReply(replyData);
    res.json({
      success: true,
      message: "Reply processed",
      analysis
    });
  } catch (err) {
    logger.error(`Reply processing failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Load & register saved schedules on startup
const savedSchedules = loadSchedules();
for (const [phase, cfg] of Object.entries(savedSchedules)) {
  if (cfg.enabled && cfg.cron) {
    registerCronJob(phase, cfg.cron, savedSchedules, pipeline);
  }
}

app.get("/api/schedule", (req, res) => {
  try {
    const schedules = loadSchedules();
    const phases = ["all", "scrape", "enrich", "outreach", "score", "report"];
    const result = {};
    for (const phase of phases) {
      result[phase] = schedules[phase] || { cron: "", enabled: false };
      result[phase].active = !!activeCronJobs[phase];
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/schedule", (req, res) => {
  try {
    const { phase, cron: cronExpr, enabled } = req.body;
    const validPhases = ["all", "scrape", "enrich", "outreach", "score", "report"];
    if (!validPhases.includes(phase)) {
      return res.status(400).json({ error: "Invalid phase name" });
    }
    if (cronExpr && !cron.validate(cronExpr)) {
      return res.status(400).json({ error: "Invalid cron expression" });
    }

    const schedules = loadSchedules();
    schedules[phase] = { cron: cronExpr || "", enabled: !!enabled };
    saveSchedules(schedules);
    registerCronJob(phase, cronExpr, schedules, pipeline);

    logger.info(`[Scheduler] Schedule updated for '${phase}': ${cronExpr}, enabled: ${enabled}`);
    res.json({ success: true, phase, cron: cronExpr, enabled: !!enabled, active: !!activeCronJobs[phase] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/icp", (req, res) => {
  try {
    const icpPath = path.join(__dirname, "config/icp.config.js");
    delete require.cache[require.resolve(icpPath)];
    const icp = require(icpPath);
    res.json(icp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/icp", (req, res) => {
  try {
    const icpPath = path.join(__dirname, "config/icp.config.js");
    fs.writeFileSync(icpPath, `module.exports = ${JSON.stringify(req.body, null, 2)};\n`);
    delete require.cache[require.resolve(icpPath)];
    res.json({ success: true, message: "ICP configuration updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/env", (req, res) => {
  try {
    const defaultEnv = {
      MONGO_URI: process.env.MONGO_URI || "",
    };

    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) {
      return res.json(defaultEnv);
    }
    const envContent = fs.readFileSync(envPath, "utf-8");
    const parsed = require("dotenv").parse(envContent);
    // Merge file and process.env explicitly mapped fields
    res.json({ ...defaultEnv, ...parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/env", (req, res) => {
  try {
    const envPath = path.join(process.cwd(), ".env");
    let content = "";
    for (const [key, value] of Object.entries(req.body)) {
      if (value.includes("\\n")) {
        content += `${key}="${value}"\n`;
      } else {
        content += `${key}=${value}\n`;
      }
    }
    fs.writeFileSync(envPath, content);
    require("dotenv").config({ override: true }); // Reload into process.env
    res.json({ success: true, message: "Credentials updated. Some changes may require a server restart." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/logs", (req, res) => {
  try {
    const logsDir = path.join(IS_VERCEL ? "/tmp/logs" : path.join(__dirname, "../logs"));
    if (!fs.existsSync(logsDir)) return res.json({ lines: [] });

    const files = fs.readdirSync(logsDir)
      .filter(f => f.endsWith(".log"))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(logsDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return res.json({ lines: [] });

    const latestLog = path.join(logsDir, files[0].name);
    const content = fs.readFileSync(latestLog, "utf8");
    const lines = content.trim().split("\n").slice(-200);
    res.json({ lines, file: files[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================
// AUTONOMOUS SDR BOT ROUTES (Manual, 1-by-1 AI Outreach)
// ============================================================

app.get("/api/autonomous", async (req, res) => {
  try {
    const leads = await require("./db/mongoose").AutonomousLead.find().sort({ createdAt: -1 });
    // Map _id to id
    const mapped = leads.map(l => { const obj = l.toObject(); obj.id = obj._id.toString(); return obj; });
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous", async (req, res) => {
  try {
    const AutonomousLead = require("./db/mongoose").AutonomousLead;
    const newLead = await AutonomousLead.create({
      ...req.body,
      status: "new",
    });
    const obj = newLead.toObject();
    obj.id = obj._id.toString();
    res.json({ success: true, lead: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/autonomous/:id", async (req, res) => {
  try {
    const lead = await require("./db/mongoose").AutonomousLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    const leadObj = lead.toObject();
    leadObj.id = leadObj._id.toString();
    res.json(leadObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/:id/research", async (req, res) => {
  try {
    const AutonomousLead = require("./db/mongoose").AutonomousLead;
    const lead = await AutonomousLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    
    lead.status = "researching";
    await lead.save();

    let siteText = "";
    if (lead.website) {
       try {
         const response = await fetch(lead.website, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
         if (response.ok) {
           const html = await response.text();
           siteText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 6000);
         }
       } catch (e) {
         logger.warn(`Could not scrape website ${lead.website}: ${e.message}`);
       }
    }

    const OpenAILLM = require("./integrations/OpenAILLM");
    const dossier = await OpenAILLM.researchLead(lead, siteText);
    
    lead.dossier = dossier;
    lead.status = "researched";
    await lead.save();
    
    const leadObj = lead.toObject();
    leadObj.id = leadObj._id.toString();
    res.json({ success: true, lead: leadObj });
  } catch (err) {
    logger.error(`Autonomous research failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/:id/outreach", async (req, res) => {
  try {
    const AutonomousLead = require("./db/mongoose").AutonomousLead;
    const lead = await AutonomousLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (!lead.dossier) return res.status(400).json({ error: "Run research first" });
    
    const OpenAILLM = require("./integrations/OpenAILLM");
    const senderInfo = {
       name: process.env.SMTP_FROM_NAME || "The Team",
       role: "Founder",
       company: "Leader"
    };

    const draft = await OpenAILLM.draftAutonomousEmail(lead, lead.dossier, senderInfo);
    
    lead.draft = draft;
    lead.status = "outreach_drafted";
    await lead.save();
    
    const leadObj = lead.toObject();
    leadObj.id = leadObj._id.toString();
    res.json({ success: true, lead: leadObj });
  } catch (err) {
    logger.error(`Autonomous outreach failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================
// SHEETS API  — Served from MongoDB (no Google Sheets)
// ============================================================
app.get("/api/sheets/data", generalLimiter, async (req, res) => {
  try {
    const CACHE_KEY = "cache:sheets";
    const cached = await cacheGet(CACHE_KEY);
    if (cached) return res.json(cached);

    const db = require("./db/mongoose");
    const [companies, contacts, outreach, responses, scores] = await Promise.all([
      db.Company.find().sort({ createdAt: -1 }).limit(500).lean(),
      db.Contact.find().sort({ createdAt: -1 }).limit(500).lean(),
      db.OutreachLog.find().sort({ createdAt: -1 }).limit(500).lean(),
      db.Response.find().sort({ createdAt: -1 }).limit(500).lean(),
      db.LeadScore.find().sort({ createdAt: -1 }).limit(500).lean(),
    ]);

    const toTable = (docs, fieldOrder) => {
      if (!docs.length) return { headers: fieldOrder, rows: [] };
      const headers = fieldOrder;
      const rows = docs.map(d => headers.map(h => {
        const v = d[h];
        if (Array.isArray(v)) return v.join(", ");
        if (v instanceof Date) return v.toISOString();
        return v ?? "";
      }));
      return { headers, rows };
    };

    const payload = {
      Companies:      toTable(companies,  ["name","website","industry","companySize","revenue","country","city","linkedin","status","icpScore","primarySegment","createdAt"]),
      Contacts:       toTable(contacts,   ["name","email","phone","title","company","linkedin","emailStatus","createdAt"]),
      "Outreach Log": toTable(outreach,   ["contactName","company","email","subject","status","step","type","sentAt"]),
      Responses:      toTable(responses,  ["from","company","intent","sentiment","body","receivedAt"]),
      "Lead Scores":  toTable(scores,     ["contactName","title","companyName","totalScore","priority","revenue","companySize","createdAt"]),
    };

    await cacheSet(CACHE_KEY, payload, 120); // 2 min TTL
    res.json(payload);
  } catch (err) {
    logger.error(`/api/sheets/data error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/sheets/row", async (req, res) => {
  try {
    const { sheet, rowIndex } = req.body;
    const db = require("./db/mongoose");
    const modelMap = {
      "Companies": db.Company, "Contacts": db.Contact,
      "Outreach Log": db.OutreachLog, "Responses": db.Response, "Lead Scores": db.LeadScore,
    };
    const Model = modelMap[sheet];
    if (!Model) return res.status(400).json({ error: `Unknown sheet: ${sheet}` });
    const docs = await Model.find().sort({ createdAt: -1 }).skip(rowIndex).limit(1).lean();
    if (!docs.length) return res.status(404).json({ error: "Row not found" });
    await Model.findByIdAndDelete(docs[0]._id);
    await cacheDel("cache:sheets"); // invalidate sheets cache after mutation
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/sheets/clear", async (req, res) => {
  try {
    const { sheet } = req.body;
    const db = require("./db/mongoose");
    const modelMap = {
      "Companies": db.Company, "Contacts": db.Contact,
      "Outreach Log": db.OutreachLog, "Responses": db.Response, "Lead Scores": db.LeadScore,
    };
    const Model = modelMap[sheet];
    if (!Model) return res.status(400).json({ error: `Unknown sheet: ${sheet}` });
    await Model.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scrape run history — reads from all MongoDB collections timestamped by run
app.get("/api/sheets/runs", async (req, res) => {
  try {
    const db = require("./db/mongoose");
    const runs = await db.Company.aggregate([
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } }, { $limit: 20 },
    ]);
    res.json({ runs: runs.map(r => ({ tabName: `Run ${r._id}`, count: r.count })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sheets/runs/:tabName", async (req, res) => {
  try {
    res.json({ headers: ["name","website","industry","companySize","revenue","country","status"], rows: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CRAWLER API (Native Express Routes)
// ============================================================
const crawlerRouter = require("./api/crawler");
app.use("/api/crawler", crawlerRouter);

// Export for Vercel / serverless environments
module.exports = app;

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`\n🚀 Leader API Server running on port ${PORT}`);
    logger.info(`Dashboard API ready at http://0.0.0.0:${PORT}`);
  });
  
  server.timeout = 600000;
}
