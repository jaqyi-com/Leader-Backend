"use strict";
// ============================================================
// CLOUD SQL — PostgreSQL Connection Pool
// ============================================================
// Used ONLY for the In-Build Database feature.
// MongoDB Atlas remains untouched for all other features.
//
// Cloud SQL Instance : sigma-current-497209-i6:us-central1:leader
// Public IP          : 34.71.167.187
// Database           : doott  |  Schema: public  |  Table: usa_business_data
//
// ── Serverless (Vercel) considerations ───────────────────────
//   • max: 3  — each function instance is short-lived; don't open 10 connections
//   • keepAlive: true  — prevents idle TCP drops on Cloud SQL
//   • idleTimeoutMillis: 10000  — release connections quickly after use
//   • connectionTimeoutMillis: 10000  — allow extra time for SSL handshake on cold start
//   • statement_timeout (per-query via options)  — prevent runaway queries
// ============================================================

const { Pool } = require("pg");

const SCHEMA = process.env.CLOUD_SQL_SCHEMA || "public";
const TABLE  = process.env.CLOUD_SQL_TABLE  || "usa_business_data";

let _pool = null;

function getPool() {
  if (_pool) return _pool;

  // Cloud SQL public IP requires SSL.
  // rejectUnauthorized: false avoids needing to bundle the server cert — safe for
  // backend-to-Cloud-SQL internal traffic (not user-facing TLS).
  // Override with CLOUD_SQL_SSL=false ONLY for local plain Postgres testing.
  const sslConfig =
    process.env.CLOUD_SQL_SSL === "false"
      ? false
      : { rejectUnauthorized: false };

  _pool = new Pool({
    host:                    process.env.CLOUD_SQL_HOST     || "34.71.167.187",
    port:                    parseInt(process.env.CLOUD_SQL_PORT || "5432", 10),
    database:                process.env.CLOUD_SQL_DB       || "doott",
    user:                    process.env.CLOUD_SQL_USER     || "postgres",
    password:                process.env.CLOUD_SQL_PASSWORD,
    ssl:                     sslConfig,

    // ── Pool tuning for Vercel serverless ───────────────────────
    max:                     3,      // serverless: keep pool small
    min:                     0,      // don't hold connections between invocations
    idleTimeoutMillis:       10000,  // release idle connections quickly
    connectionTimeoutMillis: 10000,  // SSL handshake on cold start needs time

    // ── TCP keep-alive prevents Cloud SQL from closing idle sockets ──
    keepAlive:               true,
    keepAliveInitialDelayMillis: 10000,

    // ── Identify the app in Cloud SQL logs ───────────────────────
    application_name:        "leader-backend",
  });

  _pool.on("error", (err) => {
    // Log pool-level errors (e.g. connection dropped mid-pool)
    // These are non-fatal — the pool will reconnect automatically.
    console.error("[CloudSQL] ⚠️  Pool error (will auto-reconnect):", err.message);
  });

  console.log(
    `[CloudSQL] ✅ Pool ready → ${process.env.CLOUD_SQL_HOST || "34.71.167.187"}` +
    `:${process.env.CLOUD_SQL_PORT || "5432"}` +
    `/${process.env.CLOUD_SQL_DB || "doott"}`
  );

  return _pool;
}

/**
 * Run a parameterised query against Cloud SQL.
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
    console.log("[CloudSQL] ✅ Connected. Server time:", res.rows[0].now);
    return true;
  } catch (err) {
    console.error("[CloudSQL] ❌ Connection failed:", err.message);
    return false;
  }
}

/** Gracefully drain the pool (call on process exit / Vercel shutdown). */
async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    console.log("[CloudSQL] Pool closed.");
  }
}

module.exports = { query, testConnection, closePool, getPool, SCHEMA, TABLE };
