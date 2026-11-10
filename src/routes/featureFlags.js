const router = require("express").Router();
const { FeatureFlag, DEFAULT_FEATURE_FLAGS } = require("../db/models/featureFlag");
const logger = require("../utils/logger");

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

// Features every signed-in user always gets, whatever is stored in the flag collection:
// Settings holds personal account controls (password, API keys, sign-out, delete account).
const ALWAYS_ON = new Set(["settings"]);
const applyAlwaysOn = (flags) => flags.map((f) => (ALWAYS_ON.has(f.key)
  ? { ...f, status: "enabled", alwaysOn: true, description: "Always on: every user can manage their account here." }
  : f));

// ─── Preset Configurations ───
const PRESETS = {
  all_enabled: {
    name: "Enable Everything",
    description: "Turn on every data feature, Docs and Settings.",
    apply: (flags) => flags.map(f => ({ ...f, status: f.key === "admin" ? "admin_only" : "enabled" }))
  },
  data_only: {
    name: "Data Only",
    description: "Keep the data features on. Hide Docs and Settings.",
    apply: (flags) => flags.map(f => {
      if (f.key === "admin") return { ...f, status: "admin_only" };
      if (f.category === "lead_gen") return { ...f, status: "enabled" };
      return { ...f, status: "disabled" };
    })
  }
};

// ─── Public / Client Feature Flags Endpoint ───
// GET /api/features
// Returns active feature flags map to frontend (e.g. { companies: 'enabled', docs: 'disabled' })
router.get("/features", async (req, res) => {
  try {
    await FeatureFlag.ensureDefaults();
    const flags = applyAlwaysOn(await FeatureFlag.all());

    const featureMap = {};
    flags.forEach(f => {
      featureMap[f.key] = {
        status: f.status,
        badge: f.badge,
        title: f.title,
        path: f.path,
        category: f.category,
        categoryLabel: f.categoryLabel,
        icon: f.icon,
      };
    });

    res.json({
      success: true,
      features: featureMap,
      raw: flags,
    });
  } catch (err) {
    logger.error(`[FeatureFlags] Error fetching features: ${err.message}`);
    // Fallback to default in-memory definition
    const fallbackMap = {};
    applyAlwaysOn(DEFAULT_FEATURE_FLAGS).forEach(f => {
      fallbackMap[f.key] = {
        status: f.status,
        badge: f.badge,
        title: f.title,
        path: f.path,
        category: f.category,
        categoryLabel: f.categoryLabel,
        icon: f.icon,
      };
    });
    res.json({ success: true, features: fallbackMap, raw: applyAlwaysOn(DEFAULT_FEATURE_FLAGS) });
  }
});

const getAdminEmails = () => {
  const builtinAdmins = [
    "akshat.v@jaqyi.com"
  ];
  const envVal = process.env.ADMIN_EMAIL || "";
  const envList = envVal.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([...builtinAdmins, ...envList]));
};

// ─── Admin Guard Middleware ───
function adminGuard(req, res, next) {
  const callerEmail = (req.user?.email || "").toLowerCase().trim();
  if (!callerEmail) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0 || !adminEmails.includes(callerEmail)) {
    return res.status(403).json({ error: "Access denied. Feature management is restricted to application administrator." });
  }
  next();
}

// ─── Admin Endpoints (Owner Only) ───

// GET /api/admin/features
router.get("/admin/features", adminGuard, async (req, res) => {
  try {
    await FeatureFlag.ensureDefaults();
    const flags = applyAlwaysOn(await FeatureFlag.all());

    const summary = {
      total: flags.length,
      enabled: flags.filter(f => f.status === "enabled").length,
      admin_only: flags.filter(f => f.status === "admin_only").length,
      disabled: flags.filter(f => f.status === "disabled").length,
    };

    res.json({
      success: true,
      summary,
      presets: Object.keys(PRESETS).map(k => ({ key: k, ...PRESETS[k] })),
      flags,
    });
  } catch (err) {
    logger.error(`[AdminFeatureFlags] Error: ${err.message}`);
    res.status(500).json({ error: "Failed to load admin features: " + err.message });
  }
});

// PUT /api/admin/features/:key (Single toggle / badge update)
router.put("/admin/features/:key", adminGuard, async (req, res) => {
  try {
    const { key } = req.params;
    const { status, badge, order, title, description } = req.body;

    const updateFields = {
      updatedBy: req.user.email,
    };
    if (status && ["enabled", "disabled", "admin_only"].includes(status)) {
      updateFields.status = status;
    }
    if (badge !== undefined) updateFields.badge = badge;
    if (order !== undefined) updateFields.order = Number(order);
    if (title) updateFields.title = title;
    if (description) updateFields.description = description;

    const updated = await FeatureFlag.set(key, updateFields);
    if (!updated) return res.status(404).json({ error: `Unknown feature '${key}'.` });

    logger.info(`[AdminFeatureFlags] Updated feature '${key}' -> status: ${updated.status} by ${req.user.email}`);

    res.json({
      success: true,
      message: `Feature '${key}' updated successfully.`,
      flag: updated,
    });
  } catch (err) {
    logger.error(`[AdminFeatureFlags] Update error: ${err.message}`);
    res.status(500).json({ error: "Failed to update feature: " + err.message });
  }
});

// PUT /api/admin/features (Bulk update)
router.put("/admin/features", adminGuard, async (req, res) => {
  try {
    const { flags } = req.body;
    if (!Array.isArray(flags)) {
      return res.status(400).json({ error: "Expected 'flags' array." });
    }

    for (const f of flags) {
      if (!f || typeof f.key !== "string") continue;
      await FeatureFlag.set(f.key, {
        status: ["enabled", "disabled", "admin_only"].includes(f.status) ? f.status : undefined,
        badge: f.badge || "",
        order: f.order != null ? Number(f.order) : 100,
        updatedBy: req.user.email,
      });
    }

    logger.info(`[AdminFeatureFlags] Bulk updated ${flags.length} features by ${req.user.email}`);

    const allFlags = applyAlwaysOn(await FeatureFlag.all());
    res.json({
      success: true,
      message: `Successfully updated ${flags.length} features.`,
      flags: allFlags,
    });
  } catch (err) {
    logger.error(`[AdminFeatureFlags] Bulk update error: ${err.message}`);
    res.status(500).json({ error: "Failed to bulk update features: " + err.message });
  }
});

// POST /api/admin/features/preset (Apply preset)
router.post("/admin/features/preset", adminGuard, async (req, res) => {
  try {
    const { presetKey } = req.body;
    const preset = PRESETS[presetKey];
    if (!preset) {
      return res.status(400).json({ error: `Unknown preset '${presetKey}'. Available: ${Object.keys(PRESETS).join(", ")}` });
    }

    const currentFlags = await FeatureFlag.all();
    for (const f of preset.apply(currentFlags)) {
      await FeatureFlag.set(f.key, { status: f.status, updatedBy: req.user.email });
    }

    logger.info(`[AdminFeatureFlags] Applied preset '${preset.name}' by ${req.user.email}`);

    const allFlags = applyAlwaysOn(await FeatureFlag.all());
    res.json({
      success: true,
      message: `Preset '${preset.name}' applied successfully.`,
      preset: preset.name,
      flags: allFlags,
    });
  } catch (err) {
    logger.error(`[AdminFeatureFlags] Preset error: ${err.message}`);
    res.status(500).json({ error: "Failed to apply preset: " + err.message });
  }
});

// POST /api/admin/features/reset (Reset to defaults)
router.post("/admin/features/reset", adminGuard, async (req, res) => {
  try {
    await FeatureFlag.reset(req.user.email);

    logger.info(`[AdminFeatureFlags] Reset all features to factory defaults by ${req.user.email}`);

    const allFlags = applyAlwaysOn(await FeatureFlag.all());
    res.json({
      success: true,
      message: "Reset all feature flags to factory default settings.",
      flags: allFlags,
    });
  } catch (err) {
    logger.error(`[AdminFeatureFlags] Reset error: ${err.message}`);
    res.status(500).json({ error: "Failed to reset features: " + err.message });
  }
});

module.exports = router;
