"use strict";
// ============================================================
// NEON PostgreSQL — Connection Pool
// ============================================================
// Used for the In-Build Database feature (companies + people).
// MongoDB Atlas remains untouched for all other features.
//
// Neon instance  : ep-cool-shape-aik0wbtp-pooler.c-4.us-east-1.aws.neon.tech
// Database       : neondb   |  Schema: final
// Tables         : final.companies  |  final.people
//
// ── Serverless (Vercel) considerations ───────────────────────
//   • max: 5  — Neon's pooler handles connection limits serverside
//   • idleTimeoutMillis: 10000  — release idle connections quickly
//   • connectionTimeoutMillis: 10000  — allow time for SSL handshake
// ============================================================

const { Pool } = require("pg");

const SCHEMA = process.env.NEON_SCHEMA || "final";
const TABLE  = process.env.NEON_TABLE  || "companies";

// Neon connection string — supports both env var override and hardcoded default.
const NEON_DSN =
  process.env.NEON_DATABASE_URL ||
  "postgresql://neondb_owner:npg_0RCpItxXTuf6@ep-cool-shape-aik0wbtp-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

let _pool = null;

function getPool() {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString:        NEON_DSN,

    // ── Pool tuning ──────────────────────────────────────────
    max:                     5,      // Neon pooler handles many connections well
    min:                     0,      // don't hold connections between invocations
    idleTimeoutMillis:       10000,  // release idle connections quickly
    connectionTimeoutMillis: 10000,  // SSL handshake on cold start needs time

    // ── TCP keep-alive prevents Neon from closing idle sockets ──
    keepAlive:               true,
    keepAliveInitialDelayMillis: 10000,

    // ── Identify the app in Neon logs ────────────────────────
    application_name:        "leader-backend",
  });

  _pool.on("error", (err) => {
    // Log pool-level errors (e.g. connection dropped mid-pool)
    // These are non-fatal — the pool will reconnect automatically.
    console.error("[NeonDB] ⚠️  Pool error (will auto-reconnect):", err.message);
  });

  console.log("[NeonDB] ✅ Pool ready → Neon PostgreSQL (neondb / final schema)");

  return _pool;
}

/**
 * Run a parameterised query against Neon PostgreSQL.
 * Automatically acquires and releases a client from the pool.
 *
 * @param {string} text     SQL with $1, $2, … placeholders
 * @param {Array}  params   Array of parameter values
 * @param {number} [timeoutMs=30000]  Per-query statement timeout in ms
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = [], timeoutMs = 30000) {
  const client = await getPool().connect();
  try {
    // Set per-query statement timeout to prevent long-running queries from
    // blocking Vercel's serverless function timeout (max 60s on free tier).
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/** Quick connectivity check — logs result and returns true/false. */
async function testConnection() {
  try {
    const res = await query("SELECT NOW() AS now", [], 5000);
    console.log("[NeonDB] ✅ Connected. Server time:", res.rows[0].now);
    return true;
  } catch (err) {
    console.error("[NeonDB] ❌ Connection failed:", err.message);
    return false;
  }
}

/** Gracefully drain the pool (call on process exit / Vercel shutdown). */
async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    console.log("[NeonDB] Pool closed.");
  }
}

module.exports = { query, testConnection, closePool, getPool, SCHEMA, TABLE };
