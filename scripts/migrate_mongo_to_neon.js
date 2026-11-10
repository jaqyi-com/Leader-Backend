#!/usr/bin/env node
"use strict";
// ============================================================
// Copy the app data from MongoDB Atlas into Neon (schema "app")
// ============================================================
//   node scripts/migrate_mongo_to_neon.js --dry-run   # counts only, writes nothing
//   node scripts/migrate_mongo_to_neon.js             # copy
//
// Safe to run more than once: rows keep their MongoDB ids; a row that already exists in Neon is only
// overwritten when the MongoDB copy is newer (updatedAt), so changes made in Neon after the switch win.
// Page views are insert-only. Expired one-time Claude codes are skipped.
// Reads MONGO_URI and NEON_DATABASE_URL from .env. Prints counts only — never any row contents.
// ============================================================

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const db = require("../src/db/appDb");
const { getPool } = require("../src/db/cloudSql");

const DRY = process.argv.includes("--dry-run");
const BATCH = 500;

const hex = (v) => (v == null ? null : typeof v === "object" && v.toHexString ? v.toHexString() : String(v));
const date = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
const idDate = (doc) => (doc._id && doc._id.getTimestamp ? doc._id.getTimestamp() : new Date());

// collection → table mapping. `cols` maps column → (doc) => value.
const PLAN = [
  {
    coll: "users", table: "users",
    cols: {
      id: (d) => hex(d._id), name: (d) => String(d.name || (d.email || "").split("@")[0] || "User"),
      email: (d) => String(d.email || "").toLowerCase().trim(), password_hash: (d) => d.passwordHash || null,
      google_id: (d) => d.googleId || null, avatar: (d) => d.avatar || null,
      is_email_verified: (d) => Boolean(d.isEmailVerified),
      email_verify_token: (d) => d.emailVerifyToken || null, email_verify_token_expires: (d) => date(d.emailVerifyTokenExpires),
      password_reset_token: (d) => d.passwordResetToken || null, password_reset_expires: (d) => date(d.passwordResetExpires),
      default_org_id: (d) => hex(d.defaultOrgId), plan: (d) => d.plan || "lifetime",
      razorpay_payment_id: (d) => d.razorpayPaymentId || null, razorpay_order_id: (d) => d.razorpayOrderId || null,
      paid_at: (d) => date(d.paidAt), token_version: (d) => Number(d.tokenVersion) || 0,
    },
  },
  {
    coll: "organizations", table: "organizations",
    cols: {
      id: (d) => hex(d._id), name: (d) => String(d.name || "Organization"), slug: (d) => String(d.slug || hex(d._id)),
      logo: (d) => d.logo || null, plan: (d) => d.plan || "free", owner_id: (d) => hex(d.ownerId),
      website: (d) => d.website || null, industry: (d) => d.industry || null,
    },
  },
  {
    coll: "members", table: "members",
    cols: {
      id: (d) => hex(d._id), org_id: (d) => hex(d.orgId), user_id: (d) => hex(d.userId),
      role: (d) => d.role || "member", status: (d) => d.status || "active", invited_by: (d) => hex(d.invitedBy),
      invite_email: (d) => d.inviteEmail || null, invite_token: (d) => d.inviteToken || null,
      invite_token_expires: (d) => date(d.inviteTokenExpires), joined_at: (d) => date(d.joinedAt),
    },
  },
  {
    coll: "apikeys", table: "api_keys",
    cols: {
      id: (d) => hex(d._id), user_id: (d) => hex(d.userId), name: (d) => String(d.name || "API key"), prefix: (d) => String(d.prefix || ""),
      key_hash: (d) => d.keyHash, last_used_at: (d) => date(d.lastUsedAt), revoked_at: (d) => date(d.revokedAt),
    },
  },
  {
    coll: "mcpclients", table: "mcp_clients",
    cols: {
      id: (d) => hex(d._id), client_id: (d) => d.clientId, client_secret_hash: (d) => d.clientSecretHash || null,
      client_name: (d) => d.clientName || "MCP client", redirect_uris: (d) => (Array.isArray(d.redirectUris) ? d.redirectUris : []),
      auth_method: (d) => d.authMethod || "none",
    },
  },
  {
    coll: "mcpauthcodes", table: "mcp_auth_codes", filter: { expiresAt: { $gt: new Date() } },
    cols: {
      id: (d) => hex(d._id), code_hash: (d) => d.codeHash, client_id: (d) => d.clientId, user_id: (d) => hex(d.userId),
      redirect_uri: (d) => d.redirectUri, code_challenge: (d) => d.codeChallenge, resource: (d) => d.resource || null,
      expires_at: (d) => date(d.expiresAt),
    },
  },
  {
    coll: "mcpgrants", table: "mcp_grants",
    cols: {
      id: (d) => hex(d._id), client_id: (d) => d.clientId, client_name: (d) => d.clientName || "MCP client",
      user_id: (d) => hex(d.userId), refresh_token_hash: (d) => d.refreshTokenHash, refresh_expires_at: (d) => date(d.refreshExpiresAt),
      revoked_at: (d) => date(d.revokedAt), last_used_at: (d) => date(d.lastUsedAt),
    },
  },
  {
    coll: "featureflags", table: "feature_flags", pk: "key",
    cols: {
      key: (d) => String(d.key).toLowerCase(), id: (d) => hex(d._id), title: (d) => d.title || d.key, category: (d) => d.category || "system",
      category_label: (d) => d.categoryLabel || "General", description: (d) => d.description || "", path: (d) => d.path || "/",
      icon: (d) => d.icon || "Layers", status: (d) => d.status || "enabled", badge: (d) => d.badge || "",
      sort_order: (d) => (d.order != null ? Number(d.order) : 100), updated_by: (d) => d.updatedBy || "system",
    },
  },
  {
    coll: "pageviews", table: "page_views", insertOnly: true,
    cols: {
      id: (d) => hex(d._id), path: (d) => String(d.path || "/"), referrer: (d) => String(d.referrer ?? "Direct"),
      device: (d) => String(d.device || "Desktop"), browser: (d) => String(d.browser || "Unknown"),
      country: (d) => String(d.country || "Unknown"), city: (d) => String(d.city || ""), ip: (d) => String(d.ip || ""),
      session_id: (d) => String(d.sessionId || ""), duration: (d) => Math.round(Number(d.duration) || 0),
      utm_source: (d) => String(d.utmSource || ""), utm_medium: (d) => String(d.utmMedium || ""),
      utm_campaign: (d) => String(d.utmCampaign || ""), is_entry: (d) => Boolean(d.isEntry),
    },
  },
];

async function copy(mdb, step) {
  const pool = getPool();
  const cols = [...Object.keys(step.cols), "created_at", "updated_at"];
  const pk = step.pk || "id";
  const conflict = step.insertOnly
    ? `ON CONFLICT (${pk}) DO NOTHING`
    : `ON CONFLICT (${pk}) DO UPDATE SET ${cols.filter((c) => c !== pk).map((c) => `${c} = EXCLUDED.${c}`).join(", ")}
       WHERE app.${step.table}.updated_at < EXCLUDED.updated_at`;
  const total = await mdb.collection(step.coll).countDocuments(step.filter || {});
  const stats = { source: total, written: 0, skipped: 0, failed: 0 };
  if (DRY || total === 0) return stats;

  const toRow = (d) => [...Object.values(step.cols).map((f) => f(d)), date(d.createdAt) || idDate(d), date(d.updatedAt) || date(d.createdAt) || idDate(d)];
  async function write(rows) {
    const params = [];
    const values = rows.map((r) => `(${r.map((v) => { params.push(v); return "$" + params.length; }).join(", ")})`);
    const res = await pool.query(`INSERT INTO app.${step.table} (${cols.join(", ")}) VALUES ${values.join(", ")} ${conflict}`, params);
    return res.rowCount;
  }

  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    try {
      const n = await write(batch);
      stats.written += n; stats.skipped += batch.length - n;
    } catch {
      // One bad row (e.g. a duplicate email) must not lose the rest: retry the batch row by row.
      for (const r of batch) {
        try { const n = await write([r]); stats.written += n; stats.skipped += 1 - n; }
        catch (e) { stats.failed++; console.warn(`  ! ${step.table} row ${r[0]}: ${e.message}`); }
      }
    }
    batch = [];
  };
  for await (const doc of mdb.collection(step.coll).find(step.filter || {})) {
    batch.push(toRow(doc));
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return stats;
}

(async () => {
  if (!process.env.MONGO_URI || !process.env.NEON_DATABASE_URL) {
    console.error("MONGO_URI and NEON_DATABASE_URL must be set in .env");
    process.exit(1);
  }
  console.log(DRY ? "DRY RUN — nothing is written\n" : "Copying MongoDB Atlas → Neon (schema app)\n");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const mdb = mongoose.connection.db;
  if (!DRY) await db.ready();

  let failed = 0;
  for (const step of PLAN) {
    const s = await copy(mdb, step);
    failed += s.failed;
    let neon = "";
    if (!DRY) neon = `  neon now ${(await getPool().query(`SELECT count(*)::int AS n FROM app.${step.table}`)).rows[0].n}`;
    console.log(`${step.coll.padEnd(14)} → app.${step.table.padEnd(15)} source ${String(s.source).padStart(7)}` +
      (DRY ? "" : `  written ${String(s.written).padStart(7)}  unchanged ${String(s.skipped).padStart(7)}  failed ${s.failed}`) + neon);
  }
  await mongoose.disconnect();
  await getPool().end();
  console.log(failed ? `\nDone with ${failed} failed row(s) — see warnings above.` : "\nDone.");
  process.exit(failed ? 2 : 0);
})().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
