const router = require("express").Router();
const { FeatureFlag, DEFAULT_FEATURE_FLAGS } = require("../db/models/featureFlag");
const logger = require("../utils/logger");

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

// ─── Preset Configurations ───
const PRESETS = {
  full_suite: {
    name: "Full Enterprise Suite",
    description: "Enable all 30+ features across Lead Gen, AI, Crawlers, Outreach, CRM, and ERP.",
    apply: (flags) => flags.map(f => ({ ...f, status: f.key === "admin" ? "admin_only" : "enabled" }))
  },
  lead_gen_core: {
    name: "Core Lead Gen Only",
    description: "Keep Lead Gen, Cities, Categories, and Ask Doott enabled. Turn off CRM, ERP, and Crawlers.",
    apply: (flags) => flags.map(f => {
      if (f.category === "lead_gen" || f.key === "chatbot" || f.key === "docs" || f.key === "settings") {
        return { ...f, status: "enabled" };
      }
      if (f.key === "admin") return { ...f, status: "admin_only" };
      return { ...f, status: "disabled" };
    })
  },
  ai_and_outreach: {
    name: "AI & Outreach Focus",
    description: "Enable Lead Gen, AI Chatbot, Autonomous SDR, and Social Outreach. Disable ERP & Accounting.",
    apply: (flags) => flags.map(f => {
      if (f.category === "erp_suite") {
        return { ...f, status: "disabled" };
      }
      if (f.key === "admin") return { ...f, status: "admin_only" };
      return { ...f, status: "enabled" };
    })
  },
  lean_crm: {
    name: "Lean Sales & CRM",
    description: "Enable Lead Gen and CRM Suite. Disable complex ERP and Autonomous agents.",
    apply: (flags) => flags.map(f => {
      if (f.category === "erp_suite" || f.key === "autonomous_agents") {
        return { ...f, status: "disabled" };
      }
      if (f.key === "admin") return { ...f, status: "admin_only" };
      return { ...f, status: "enabled" };
    })
  }
};

// ─── Public / Client Feature Flags Endpoint ───
// GET /api/features
// Returns active feature flags map to frontend (e.g. { companies: 'enabled', accounting: 'disabled' })
router.get("/features", async (req, res) => {
  try {
    await FeatureFlag.ensureDefaults();
    const flags = await FeatureFlag.find({}).sort({ order: 1 }).lean();

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
    DEFAULT_FEATURE_FLAGS.forEach(f => {
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
    res.json({ success: true, features: fallbackMap, raw: DEFAULT_FEATURE_FLAGS });
  }
});

const getAdminEmails = () => {
  const envVal = process.env.ADMIN_EMAIL || "akshat.v@jaqyi.com,akshatv00001@gmail.com";
  return envVal.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
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
    const flags = await FeatureFlag.find({}).sort({ order: 1 }).lean();

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

    const updated = await FeatureFlag.findOneAndUpdate(
      { key },
      { $set: updateFields },
      { new: true, upsert: true }
    );

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

    const ops = flags.map(f => ({
      updateOne: {
        filter: { key: f.key },
        update: {
          $set: {
            status: f.status,
            badge: f.badge || "",
            order: f.order != null ? f.order : 100,
            updatedBy: req.user.email,
          }
        },
        upsert: true
      }
    }));

    if (ops.length > 0) {
      await FeatureFlag.bulkWrite(ops);
    }

    logger.info(`[AdminFeatureFlags] Bulk updated ${flags.length} features by ${req.user.email}`);

    const allFlags = await FeatureFlag.find({}).sort({ order: 1 }).lean();
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

    const currentFlags = await FeatureFlag.find({}).lean();
    const updatedFlags = preset.apply(currentFlags);

    const ops = updatedFlags.map(f => ({
      updateOne: {
        filter: { key: f.key },
        update: {
          $set: {
            status: f.status,
            updatedBy: req.user.email,
          }
        }
      }
    }));

    if (ops.length > 0) {
      await FeatureFlag.bulkWrite(ops);
    }

    logger.info(`[AdminFeatureFlags] Applied preset '${preset.name}' by ${req.user.email}`);

    const allFlags = await FeatureFlag.find({}).sort({ order: 1 }).lean();
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
    await FeatureFlag.deleteMany({});
    await FeatureFlag.insertMany(DEFAULT_FEATURE_FLAGS);

    logger.info(`[AdminFeatureFlags] Reset all features to factory defaults by ${req.user.email}`);

    const allFlags = await FeatureFlag.find({}).sort({ order: 1 }).lean();
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
