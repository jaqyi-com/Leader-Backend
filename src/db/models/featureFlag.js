
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

// Flags live in Neon (app.feature_flags). ensureDefaults() adds new defaults and drops removed ones,
// leaving every existing flag's status as the admin set it.
const db = require("../appDb");

const FeatureFlag = {
  async ensureDefaults() {
    const keys = DEFAULT_FEATURE_FLAGS.map((f) => f.key);
    await db.exec("DELETE FROM app.feature_flags WHERE NOT (key = ANY($1::text[]))", [keys]);
    for (const f of DEFAULT_FEATURE_FLAGS) {
      await db.exec(
        `INSERT INTO app.feature_flags (key, id, title, category, category_label, description, path, icon, status, badge, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (key) DO NOTHING`,
        [f.key, db.newId(), f.title, f.category, f.categoryLabel || "General", f.description || "", f.path, f.icon || "Layers", f.status, f.badge || "", f.order ?? 100]
      );
    }
  },
  all() {
    return db.many("SELECT * FROM app.feature_flags ORDER BY sort_order ASC, key ASC");
  },
  /** Update one flag; creates it from the defaults when it does not exist yet. Returns the row or null. */
  async set(key, fields) {
    const [row] = await db.update("feature_flags", { key }, fields);
    if (row) return row;
    const def = DEFAULT_FEATURE_FLAGS.find((f) => f.key === key);
    if (!def) return null;
    await this.ensureDefaults();
    const [created] = await db.update("feature_flags", { key }, fields);
    return created || null;
  },
  async reset(updatedBy) {
    await db.exec("DELETE FROM app.feature_flags");
    await this.ensureDefaults();
    if (updatedBy) await db.exec("UPDATE app.feature_flags SET updated_by = $1", [updatedBy]);
  },
};

module.exports = { FeatureFlag, DEFAULT_FEATURE_FLAGS };
