"use strict";
// ============================================================
// APP DATABASE — Neon PostgreSQL, schema "app"
// ============================================================
// Accounts, organisations, API keys, Claude (MCP) connections, feature flags and page views.
// They sit next to the lead data in Neon, in their own schema so the "final" lead tables are never
// touched. (Moved from MongoDB Atlas on 2026-11-10.)
//
// Rows are returned with `_id` and camelCase fields, and ids are 24 hex characters (the format used
// before the move), so tokens and ids issued earlier stay valid.
// The schema is created on first use (idempotent; see SCHEMA_SQL).
// ============================================================

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { getPool } = require("./cloudSql");

const SCHEMA_VERSION = 2;

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.schema_meta (id int PRIMARY KEY, version int NOT NULL);

CREATE TABLE IF NOT EXISTS app.users (
  id                          text PRIMARY KEY,
  name                        text NOT NULL,
  email                       text NOT NULL,
  password_hash               text,
  google_id                   text,
  avatar                      text,
  is_email_verified           boolean NOT NULL DEFAULT false,
  email_verify_token          text,
  email_verify_token_expires  timestamptz,
  password_reset_token        text,
  password_reset_expires      timestamptz,
  default_org_id              text,
  plan                        text NOT NULL DEFAULT 'lifetime',
  razorpay_payment_id         text,
  razorpay_order_id           text,
  paid_at                     timestamptz,
  token_version               integer NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON app.users (lower(email));
CREATE INDEX IF NOT EXISTS users_google_id_idx ON app.users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_reset_token_idx ON app.users (password_reset_token) WHERE password_reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_verify_token_idx ON app.users (email_verify_token) WHERE email_verify_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.organizations (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  logo        text,
  plan        text NOT NULL DEFAULT 'free',
  owner_id    text,
  website     text,
  industry    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organizations_owner_idx ON app.organizations (owner_id);

CREATE TABLE IF NOT EXISTS app.members (
  id                    text PRIMARY KEY,
  org_id                text NOT NULL,
  user_id               text,
  role                  text NOT NULL DEFAULT 'member',
  status                text NOT NULL DEFAULT 'active',
  invited_by            text,
  invite_email          text,
  invite_token          text,
  invite_token_expires  timestamptz,
  joined_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS members_org_user_key ON app.members (org_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS members_user_idx ON app.members (user_id);
CREATE INDEX IF NOT EXISTS members_org_idx ON app.members (org_id);
CREATE INDEX IF NOT EXISTS members_invite_token_idx ON app.members (invite_token) WHERE invite_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.api_keys (
  id            text PRIMARY KEY,
  user_id       text NOT NULL,
  name          text NOT NULL,
  prefix        text NOT NULL,
  key_hash      text NOT NULL UNIQUE,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON app.api_keys (user_id);

CREATE TABLE IF NOT EXISTS app.mcp_clients (
  id                  text PRIMARY KEY,
  client_id           text NOT NULL UNIQUE,
  client_secret_hash  text,
  client_name         text NOT NULL DEFAULT 'MCP client',
  redirect_uris       text[] NOT NULL,
  auth_method         text NOT NULL DEFAULT 'none',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.mcp_auth_codes (
  id              text PRIMARY KEY,
  code_hash       text NOT NULL UNIQUE,
  client_id       text NOT NULL,
  user_id         text NOT NULL,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  resource        text,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_auth_codes_expires_idx ON app.mcp_auth_codes (expires_at);

CREATE TABLE IF NOT EXISTS app.mcp_grants (
  id                  text PRIMARY KEY,
  client_id           text NOT NULL,
  client_name         text NOT NULL DEFAULT 'MCP client',
  user_id             text NOT NULL,
  refresh_token_hash  text NOT NULL UNIQUE,
  refresh_expires_at  timestamptz NOT NULL,
  revoked_at          timestamptz,
  last_used_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_grants_user_idx ON app.mcp_grants (user_id);
CREATE INDEX IF NOT EXISTS mcp_grants_client_idx ON app.mcp_grants (client_id);

-- v2: counts behind the country picker and the city / category cards (src/utils/explorerCounts.js)
CREATE TABLE IF NOT EXISTS app.explorer_counts (
  key          text PRIMARY KEY,
  data         jsonb NOT NULL,
  generated_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.feature_flags (
  key             text PRIMARY KEY,
  id              text NOT NULL,
  title           text NOT NULL,
  category        text NOT NULL,
  category_label  text NOT NULL DEFAULT 'General',
  description     text NOT NULL DEFAULT '',
  path            text NOT NULL,
  icon            text NOT NULL DEFAULT 'Layers',
  status          text NOT NULL DEFAULT 'enabled',
  badge           text NOT NULL DEFAULT '',
  sort_order      integer NOT NULL DEFAULT 100,
  updated_by      text NOT NULL DEFAULT 'system',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.page_views (
  id            text PRIMARY KEY,
  path          text NOT NULL DEFAULT '/',
  referrer      text NOT NULL DEFAULT 'Direct',
  device        text NOT NULL DEFAULT 'Desktop',
  browser       text NOT NULL DEFAULT 'Unknown',
  country       text NOT NULL DEFAULT 'Unknown',
  city          text NOT NULL DEFAULT '',
  ip            text NOT NULL DEFAULT '',
  session_id    text NOT NULL DEFAULT '',
  duration      integer NOT NULL DEFAULT 0,
  utm_source    text NOT NULL DEFAULT '',
  utm_medium    text NOT NULL DEFAULT '',
  utm_campaign  text NOT NULL DEFAULT '',
  is_entry      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS page_views_created_idx ON app.page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_session_idx ON app.page_views (session_id, created_at DESC);
`;

// ── ids ──────────────────────────────────────────────────────────────────────
// Same format as MongoDB ObjectIds (4-byte timestamp + 8 random bytes, as 24 hex characters).
function newId() {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  return ts + crypto.randomBytes(8).toString("hex");
}
const isId = (v) => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v);

// ── schema bootstrap (once per process) ──────────────────────────────────────
let readyPromise = null;
async function migrate() {
  const pool = getPool();
  try {
    const r = await pool.query("SELECT version FROM app.schema_meta WHERE id = 1");
    if (r.rows[0] && r.rows[0].version >= SCHEMA_VERSION) return;
  } catch { /* schema not created yet */ }
  const client = await pool.connect();
  try {
    // One transaction with a transaction-level lock: safe through Neon's pooler and when several
    // cold-starting instances race to create the schema.
    await client.query(
      `BEGIN; SELECT pg_advisory_xact_lock(727274001); ${SCHEMA_SQL}
       INSERT INTO app.schema_meta (id, version) VALUES (1, ${SCHEMA_VERSION})
         ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version; COMMIT;`
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
function ready() {
  if (!readyPromise) readyPromise = migrate().catch((err) => { readyPromise = null; throw err; });
  return readyPromise;
}

// ── row mapping ──────────────────────────────────────────────────────────────
const SPECIAL_TO_COL = { _id: "id", order: "sort_order" };
const SPECIAL_TO_KEY = { id: "_id", sort_order: "order" };
const toCol = (k) => SPECIAL_TO_COL[k] || k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const toKey = (c) => SPECIAL_TO_KEY[c] || c.replace(/_([a-z])/g, (_, c1) => c1.toUpperCase());
function mapRow(row) {
  if (!row) return null;
  const out = {};
  for (const [c, v] of Object.entries(row)) out[toKey(c)] = v;
  return out;
}

// ── query helpers ────────────────────────────────────────────────────────────
async function many(text, params = []) {
  await ready();
  const r = await getPool().query(text, params);
  return r.rows.map(mapRow);
}
async function one(text, params = []) {
  return (await many(text, params))[0] || null;
}
/** Run a statement and return the affected row count. */
async function exec(text, params = []) {
  await ready();
  return (await getPool().query(text, params)).rowCount;
}

/** INSERT a camelCase object into app.<table>; returns the stored row. */
async function insert(table, obj) {
  const data = { _id: newId(), ...obj };
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const cols = keys.map(toCol);
  const vals = keys.map((k) => data[k]);
  return one(
    `INSERT INTO app.${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(", ")}) RETURNING *`,
    vals
  );
}

/** UPDATE app.<table> SET <patch> WHERE <where>; returns updated rows. `where` is a camelCase equality map. */
async function update(table, where, patch) {
  const pk = Object.keys(patch).filter((k) => patch[k] !== undefined);
  const wk = Object.keys(where);
  const params = [];
  const set = pk.map((k) => { params.push(patch[k]); return `${toCol(k)} = $${params.length}`; });
  set.push("updated_at = now()");
  const cond = wk.map((k) => {
    if (where[k] === null) return `${toCol(k)} IS NULL`;
    params.push(where[k]);
    return `${toCol(k)} = $${params.length}`;
  });
  return many(`UPDATE app.${table} SET ${set.join(", ")} WHERE ${cond.join(" AND ")} RETURNING *`, params);
}

/** Run fn(q) inside one transaction on a single connection; q(text, params) returns mapped rows. */
async function transaction(fn) {
  await ready();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(async (text, params = []) => (await client.query(text, params)).rows.map(mapRow));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── users ────────────────────────────────────────────────────────────────────
const hashPassword = (plain) => bcrypt.hash(plain, 12);
async function checkPassword(user, plain) {
  if (!user?.passwordHash || typeof plain !== "string") return false;
  return bcrypt.compare(plain, user.passwordHash);
}
/** A user without password hash, tokens or internal counters (what the API returns). */
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, emailVerifyToken, emailVerifyTokenExpires, passwordResetToken, passwordResetExpires, tokenVersion, ...rest } = u;
  return rest;
}
const findUserById = (id) => (isId(String(id)) ? one("SELECT * FROM app.users WHERE id = $1", [String(id)]) : Promise.resolve(null));
const findUserByEmail = (email) => one("SELECT * FROM app.users WHERE lower(email) = lower($1)", [String(email || "").trim()]);

/** The user's first active membership (their default organisation when none is set). */
const firstMembership = (userId) =>
  one("SELECT * FROM app.members WHERE user_id = $1 AND status = 'active' ORDER BY created_at ASC LIMIT 1", [String(userId)]);

const findOrgById = (id) => (isId(String(id)) ? one("SELECT * FROM app.organizations WHERE id = $1", [String(id)]) : Promise.resolve(null));

module.exports = {
  ready, newId, isId, mapRow, many, one, exec, insert, update, transaction,
  hashPassword, checkPassword, publicUser, findUserById, findUserByEmail, firstMembership, findOrgById,
  SCHEMA_SQL,
};
