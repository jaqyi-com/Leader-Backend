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
  // Extra
  extra_data:        mongoose.Schema.Types.Mixed,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
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

const Company = mongoose.models.Company || mongoose.model("Company", companySchema);
const Contact = mongoose.models.Contact || mongoose.model("Contact", contactSchema);
const OutreachLog = mongoose.models.OutreachLog || mongoose.model("OutreachLog", outreachLogSchema);
const Response = mongoose.models.Response || mongoose.model("Response", responseSchema);
const LeadScore = mongoose.models.LeadScore || mongoose.model("LeadScore", leadScoreSchema);
const AutonomousLead = mongoose.models.AutonomousLead || mongoose.model("AutonomousLead", autonomousLeadSchema);
const Place = mongoose.models.Place || mongoose.model("Place", placeSchema);
const Website = mongoose.models.Website || mongoose.model("Website", websiteSchema);

// New auth/org models
const User = require("./models/user");
const Organization = require("./models/organization");
const Member = require("./models/member");

module.exports = {
  connectDB,
  Company,
  Contact,
  OutreachLog,
  Response,
  LeadScore,
  AutonomousLead,
  Place,
  Website,
  // Auth / Org layer
  User,
  Organization,
  Member,
};
