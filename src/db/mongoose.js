const mongoose = require("mongoose");
const dns = require("dns");
const logger = require("../utils/logger").forAgent("Database");

// Fix for ECONNREFUSED on some local networks where DNS fails SRV lookups (e.g. Atlas)
// Do NOT override DNS on Vercel or AWS Lambda as it breaks VPC internal resolvers
if (!process.env.VERCEL) {
  try {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
  } catch (e) {
    logger.warn("Could not set custom DNS servers, continuing with system defaults");
  }
}

// --- CONNECTION ---
let isConnecting = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (isConnecting) return isConnecting;

  if (!process.env.MONGO_URI) {
    logger.warn("MONGO_URI not configured, skipping MongoDB connection.");
    return;
  }

  isConnecting = mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS:         8000,
    socketTimeoutMS:          30000,
    maxPoolSize:              10,
    minPoolSize:              0,
  }).then(m => {
    isConnecting = null;
    logger.info("✅ Connected to MongoDB Atlas");
    return m.connection;
  }).catch(error => {
    isConnecting = null;
    logger.error(`❌ MongoDB Connection Error: ${error.message}`);
    logger.warn("⚠️  Server will continue running without MongoDB. DB-dependent endpoints will return errors.");
    if (!process.env.VERCEL) {
      const retryTimer = setTimeout(connectDB, 30000);
      if (retryTimer.unref) retryTimer.unref();
    }
  });

  return isConnecting;
}

// --- SCHEMAS ---

// ─── Page View (website traffic tracking) ─────────────────────────────────────
const pageViewSchema = new mongoose.Schema({
  path:        { type: String, default: "/" },
  referrer:    { type: String, default: "Direct" },
  device:      { type: String, default: "Desktop" },
  browser:     { type: String, default: "Unknown" },
  country:     { type: String, default: "Unknown" },
  city:        { type: String, default: "" },
  ip:          { type: String, default: "" },
  sessionId:   { type: String, default: "" },
  duration:    { type: Number, default: 0 },    // seconds spent on PREVIOUS page
  utmSource:   { type: String, default: "" },
  utmMedium:   { type: String, default: "" },
  utmCampaign: { type: String, default: "" },
  isEntry:     { type: Boolean, default: false }, // first page of a session
}, { timestamps: true });
// Index for fast time-range queries and unique-visitor counts
pageViewSchema.index({ createdAt: -1 });
pageViewSchema.index({ sessionId: 1, createdAt: -1 });

const PageView = mongoose.models.PageView || mongoose.model("PageView", pageViewSchema);

// Auth / org models
const User = require("./models/user");
const Organization = require("./models/organization");
const Member = require("./models/member");

module.exports = {
  connectDB,
  PageView,
  User,
  Organization,
  Member,
};
