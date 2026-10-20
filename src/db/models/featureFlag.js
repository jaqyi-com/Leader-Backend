const mongoose = require("mongoose");

const DEFAULT_FEATURE_FLAGS = [
  // ── 1. DATA ──
  {
    key: "companies",
    title: "Companies Catalog",
    category: "lead_gen",
    categoryLabel: "Data",
    description: "Search 1.5M+ B2B companies with phone numbers, domains, categories and locations.",
    path: "/app/companies",
    icon: "Building2",
    status: "enabled",
    badge: "",
    order: 10,
  },
  {
    key: "people",
    title: "People Directory",
    category: "lead_gen",
    categoryLabel: "Data",
    description: "Access 45M+ professional profiles with job titles, verified phones and location data.",
    path: "/app/people",
    icon: "Users2",
    status: "enabled",
    badge: "POPULAR",
    order: 20,
  },
  {
    key: "emails",
    title: "Direct Emails Finder",
    category: "lead_gen",
    categoryLabel: "Data",
    description: "Query and extract verified corporate and personal emails.",
    path: "/app/email",
    icon: "Mail",
    status: "enabled",
    badge: "",
    order: 30,
  },
  {
    key: "numbers",
    title: "Phone Numbers Finder",
    category: "lead_gen",
    categoryLabel: "Data",
    description: "Filter direct mobile numbers and business phone contacts.",
    path: "/app/number",
    icon: "Phone",
    status: "enabled",
    badge: "",
    order: 40,
  },
  {
    key: "categories",
    title: "Category Explorer",
    category: "lead_gen",
    categoryLabel: "Data",
    description: "Explore 500+ business categories and industry verticals.",
    path: "/app/categories",
    icon: "Grid3x3",
    status: "enabled",
    badge: "",
    order: 50,
  },
  {
    key: "cities",
    title: "City & Region Explorer",
    category: "lead_gen",
    categoryLabel: "Data",
    description: "Geographic search by state, city, and district across India & Global.",
    path: "/app/cities",
    icon: "MapPin",
    status: "enabled",
    badge: "",
    order: 60,
  },

  // ── 2. SYSTEM & PLATFORM ──
  {
    key: "docs",
    title: "Documentation & Guides",
    category: "system",
    categoryLabel: "System",
    description: "Platform guides, API documentation, and tutorials.",
    path: "/app/docs",
    icon: "BookMarked",
    status: "enabled",
    badge: "",
    order: 700,
  },
  {
    key: "settings",
    title: "Organization Settings",
    category: "system",
    categoryLabel: "System",
    description: "Manage organization details and members.",
    path: "/app/settings",
    icon: "Settings",
    status: "enabled",
    badge: "",
    order: 710,
  },
  {
    key: "admin",
    title: "Admin Control Center",
    category: "system",
    categoryLabel: "System",
    description: "Owner-only dashboard for feature toggles, users, and traffic.",
    path: "/app/admin",
    icon: "ShieldCheck",
    status: "admin_only",
    badge: "OWNER",
    order: 720,
  }

];

const featureFlagSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["lead_gen", "system"],
      index: true,
    },
    categoryLabel: {
      type: String,
      default: "General",
    },
    description: {
      type: String,
      default: "",
    },
    path: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: "Layers",
    },
    status: {
      type: String,
      enum: ["enabled", "disabled", "admin_only"],
      default: "enabled",
      index: true,
    },
    badge: {
      type: String,
      default: "",
      trim: true,
    },
    order: {
      type: Number,
      default: 100,
    },
    updatedBy: {
      type: String,
      default: "system",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Helper static method to initialize defaults if missing
featureFlagSchema.statics.ensureDefaults = async function () {
  const count = await this.countDocuments();
  if (count === 0) {
    await this.insertMany(DEFAULT_FEATURE_FLAGS);
    return;
  }
  
  // Drop flags for features that no longer exist
  await this.deleteMany({ key: { $nin: DEFAULT_FEATURE_FLAGS.map(f => f.key) } });

  // Upsert any newly defined default flags that might not exist yet
  const ops = DEFAULT_FEATURE_FLAGS.map(flag => ({
    updateOne: {
      filter: { key: flag.key },
      update: { $setOnInsert: flag },
      upsert: true,
    }
  }));
  if (ops.length > 0) {
    await this.bulkWrite(ops);
  }
};

const FeatureFlag = mongoose.models.FeatureFlag || mongoose.model("FeatureFlag", featureFlagSchema);

module.exports = {
  FeatureFlag,
  DEFAULT_FEATURE_FLAGS,
};
