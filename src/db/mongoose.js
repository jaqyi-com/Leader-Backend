const mongoose = require("mongoose");
const dns = require("dns");
const logger = require("../utils/logger").forAgent("Database");

// Fix for ECONNREFUSED on some networks where local DNS fails SRV lookups (e.g. Atlas)
try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e) {
  logger.warn("Could not set custom DNS servers, continuing with system defaults");
}

// --- CONNECTION ---
async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
    });
    logger.info("✅ Connected to MongoDB Atlas");
  } catch (error) {
    logger.error(`❌ MongoDB Connection Error: ${error.message}`);
    logger.warn("⚠️  Server will continue running without MongoDB. DB-dependent endpoints will return errors.");
    // Retry in 30s instead of killing the process
    setTimeout(connectDB, 30000);
  }
}

// --- SCHEMAS ---

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  domain: { type: String, required: true, unique: true },
  website: String,
  directorySource: String,
  description: String,
  icpScore: Number,
  primarySegment: String,
  estimatedEngineers: Number,
  techStackClasses: [String],
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const contactSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  firstName: String,
  lastName: String,
  title: String,
  companyName: String,
  companyDomain: String,
  linkedin: String,
  phone: String,
  enrichmentStatus: String,
  emailStatus: String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const outreachLogSchema = new mongoose.Schema({
  email: { type: String, required: true },
  contactName: String,
  companyName: String,
  type: String,
  status: String,
  step: Number,
  sentAt: Date,
  subject: String,
  body: String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const responseSchema = new mongoose.Schema({
  email: String,
  receivedAt: Date,
  originalBody: String,
  intent: String,
  urgency: String,
  summary: String,
  nextSteps: String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const leadScoreSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  contactName: String,
  title: String,
  companyName: String,
  companySize: String,
  revenue: String,
  firmographicScore: Number,
  behavioralScore: Number,
  engagementScore: Number,
  totalScore: Number,
  priority: String,
  reasoning: String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const autonomousLeadSchema = new mongoose.Schema({
  company: { type: String, required: true },
  website: { type: String, required: true },
  contact_name: String,
  contact_role: String,
  notes: String,
  status: { type: String, default: "new" }, // new, researching, researched, drafting, drafted, sent
  dossier: {
    summary: String,
    pain_points: [String],
    tech_stack: [String],
    recent_news: String,
    icp_score: Number,
  },
  draft: {
    subject: String,
    body: String,
    context: String,
  },
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const websiteSchema = new mongoose.Schema({
  input_url:         { type: String, required: true, unique: true },
  fetch_failed:      { type: Boolean, default: false },
  pipeline_error:    String,
  _crawl_level:      String,
  // Crawl session linkage
  crawlRunId:        { type: String, index: true },
  // Content
  website_title:     String,
  short_description: String,
  brand_name:        String,
  favicon_url:       String,
  dom_data:          String,
  website_language:  String,
  // Contact
  contact_email:     String,
  phone_number:      String,
  // Developer
  developer_name:    String,
  developer_email:   String,
  developer_phone:   String,
  // Social
  facebook_url:      String,
  instagram_url:     String,
  twitter_url:       String,
  linkedin_url:      String,
  youtube_url:       String,
  github_url:        String,
  // Tech
  technology_stack:  String,
  framework_used:    String,
  backend_language:  String,
  database_used:     String,
  hosting_provider:  String,
  // Keywords
  keyword_present:   [String],
  // Country
  country:           String,
  // Extra
  extra_data:        mongoose.Schema.Types.Mixed,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

// Crawl Run — tracks each crawl session as a unit
const crawlRunSchema = new mongoose.Schema({
  crawlRunId:    { type: String, required: true, unique: true, index: true },
  label:         String,          // human-readable name e.g. "5 URLs · 2026-04-27"
  source:        { type: String, enum: ["direct_urls", "csv_upload"], default: "direct_urls" },
  urlCount:      { type: Number, default: 0 },
  keywords:      [String],
  customFields:  [String],
  status:        { type: String, enum: ["running", "completed", "failed"], default: "running" },
  successCount:  { type: Number, default: 0 },
  failedCount:   { type: Number, default: 0 },
  orgId:         { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const placeSchema = new mongoose.Schema({
  place_id: { type: String, required: true, unique: true },
  name: String,
  phone: String,
  website: String,
  address: String,
  lat: Number,
  lng: Number,
  types: [String],
  rating: Number,
  user_ratings_total: Number,
  category_keyword: String,
  raw: mongoose.Schema.Types.Mixed,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const placeSearchHistorySchema = new mongoose.Schema({
  lat: Number,
  lng: Number,
  radius: Number,
  keyword: String,
  placesFound: Number,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const Company = mongoose.models.Company || mongoose.model("Company", companySchema);
const Contact = mongoose.models.Contact || mongoose.model("Contact", contactSchema);
const OutreachLog = mongoose.models.OutreachLog || mongoose.model("OutreachLog", outreachLogSchema);
const Response = mongoose.models.Response || mongoose.model("Response", responseSchema);
const LeadScore = mongoose.models.LeadScore || mongoose.model("LeadScore", leadScoreSchema);
const AutonomousLead = mongoose.models.AutonomousLead || mongoose.model("AutonomousLead", autonomousLeadSchema);
const Place = mongoose.models.Place || mongoose.model("Place", placeSchema);
const PlaceSearchHistory = mongoose.models.PlaceSearchHistory || mongoose.model("PlaceSearchHistory", placeSearchHistorySchema);
const Website = mongoose.models.Website || mongoose.model("Website", websiteSchema);
const CrawlRun = mongoose.models.CrawlRun || mongoose.model("CrawlRun", crawlRunSchema);

// --- SOCIAL POST SCHEMA ---
const socialPostSchema = new mongoose.Schema({
  keywords:          { type: [String], default: [] },
  platform:          { type: String, enum: ["linkedin", "instagram", "facebook", "x", "twitter"], default: "linkedin" },
  connectionId:      String,  // Unified.to connection ID for the account
  generatedContent:  { type: String, required: true },
  trendSummary:      String,  // Why this topic is trending (LLM analysis)
  hashtags:          [String],
  status: {
    type: String,
    enum: ["draft", "pending_approval", "approved", "rejected", "published", "failed"],
    default: "draft",
  },
  approvalToken:     String,  // UUID for secure email approval link
  approvalEmail:     String,  // Email address for approval
  publishedAt:       Date,
  unifiedPostId:     String,  // Unified.to post ID after publishing
  errorMessage:      String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const SocialPost = mongoose.models.SocialPost || mongoose.model("SocialPost", socialPostSchema);

// New auth/org models
const User = require("./models/user");
const Organization = require("./models/organization");
const Member = require("./models/member");

// Chatbot / RAG models
const ChatKnowledgeChunk = require("./models/chatKnowledgeChunk");
const ChatKnowledgeSource = require("./models/chatKnowledgeSource");
const ChatConversation = require("./models/chatConversation");
const ChatMessage = require("./models/chatMessage");

// ─── Auto Scraper ────────────────────────────────────────────────────────────
const autoScraperSessionSchema = new mongoose.Schema({
  sessionId:   { type: String, required: true, unique: true, index: true },
  keyword:     { type: String, required: true },
  location:    String,
  lat:         Number,
  lng:         Number,
  source:      { type: String, enum: ["google_search", "places_scraper"], default: "google_search" },
  status:      { type: String, enum: ["discovering", "crawling", "filtering", "done", "failed"], default: "discovering" },
  urlsFound:   { type: Number, default: 0 },
  crawlRunId:  String,
  leadsFound:  { type: Number, default: 0 },
  orgId:       { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const autoScraperLeadSchema = new mongoose.Schema({
  sessionId:      { type: String, index: true },
  crawlRunId:     { type: String, index: true },
  input_url:      String,
  brand_name:     String,
  website_title:  String,
  contact_email:  String,
  phone_number:   String,
  developer_email: String,
  developer_phone: String,
  technology_stack: String,
  framework_used:  String,
  country:         String,
  keyword:         String,
  location:        String,
  orgId:           { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const AutoScraperSession = mongoose.models.AutoScraperSession || mongoose.model("AutoScraperSession", autoScraperSessionSchema);
const AutoScraperLead    = mongoose.models.AutoScraperLead    || mongoose.model("AutoScraperLead",    autoScraperLeadSchema);

// ─── Unified Lead Generator ──────────────────────────────────────────────────
// ─── Outreach Campaign ──────────────────────────────────────────────────────
const outreachContactDeliverySchema = new mongoose.Schema({
  day:     Number,
  channel: String,
  status:  { type: String, enum: ["sent", "failed", "skipped"], default: "sent" },
  error:   String,
  sentAt:  Date,
}, { _id: false });

const outreachCampaignContactSchema = new mongoose.Schema({
  contactId:          String,
  contactSource:      String,
  name:               String,
  email:              String,
  phone:              String,
  companyName:        String,
  score:              Number,
  icebreaker:         String,
  personalizedSubject:String,
  personalizedEmail:  String,
  whatsappMessage:    String,
  status: { type: String, enum: ["pending", "contacted", "replied", "bounced"], default: "pending" },
  deliveries:         [outreachContactDeliverySchema],
}, { _id: true });

const outreachCampaignSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  status:       { type: String, enum: ["draft", "active", "paused", "completed"], default: "draft" },
  channels:     [{ type: String, enum: ["email", "whatsapp", "sms"] }],
  sequence:     [{ day: Number, channel: String, label: String }],
  contacts:     [outreachCampaignContactSchema],
  sentCount:    { type: Number, default: 0 },
  repliedCount: { type: Number, default: 0 },
  launchedAt:   Date,
  orgId:        { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const OutreachCampaign = mongoose.models.OutreachCampaign || mongoose.model("OutreachCampaign", outreachCampaignSchema);

const generatedLeadSchema = new mongoose.Schema({
  // Identity
  fullName:       String,
  firstName:      String,
  lastName:       String,
  jobTitle:       String,
  // Contact
  email:          String,
  emailConfidence: Number,  // 0–100 from Hunter.io
  emailVerified:  { type: Boolean, default: false },
  phone:          String,
  linkedinUrl:    String,
  // Company
  companyName:    String,
  companyDomain:  String,
  companyWebsite: String,
  industry:       String,
  employeeCount:  String,
  country:        String,
  city:           String,
  // Source tracking
  source: {
    type: String,
    enum: ["linkedin_finder", "email_finder", "company_intel", "ai_research", "auto_scraper", "places_scraper", "manual"],
    default: "manual",
  },
  sourceQuery:    String,   // the query/prompt that generated this lead
  // Status workflow
  status: {
    type: String,
    enum: ["new", "contacted", "replied", "qualified", "rejected"],
    default: "new",
  },
  // AI Research
  researchNotes:  String,
  outreachDraft:  String,
  // Tags
  tags:           [String],
  orgId:          { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const GeneratedLead = mongoose.models.GeneratedLead || mongoose.model("GeneratedLead", generatedLeadSchema);


module.exports = {
  connectDB,
  Company,
  Contact,
  OutreachLog,
  Response,
  LeadScore,
  AutonomousLead,
  Place,
  PlaceSearchHistory,
  Website,
  CrawlRun,
  SocialPost,
  AutoScraperSession,
  AutoScraperLead,
  GeneratedLead,
  OutreachCampaign,
  // Auth / Org layer
  User,
  Organization,
  Member,
  // Chatbot / RAG
  ChatKnowledgeChunk,
  ChatKnowledgeSource,
  ChatConversation,
  ChatMessage,
};
