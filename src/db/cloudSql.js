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

// ── Neon connection strings ─────────────────────────────────────
// Two connections:
//   POOLER  — PgBouncer (low latency, many connections, good for short queries)
//   DIRECT  — Neon compute directly (required for pgvector/HNSW ANN queries)
//
// The pooler strips SET statements that pgvector relies on.
// Vector similarity searches must use the direct connection.
const NEON_POOLER_DSN = process.env.NEON_DATABASE_URL;
const NEON_DIRECT_DSN = process.env.NEON_DIRECT_URL ||
  (NEON_POOLER_DSN ? NEON_POOLER_DSN.replace("-pooler.", ".") : null);

if (!NEON_POOLER_DSN) {
  throw new Error(
    "[NeonDB] ❌ NEON_DATABASE_URL environment variable is not set. " +
    "Add it to your .env file and restart the server."
  );
}

let _pool = null;
let _directPool = null;

function getPool() {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString:        NEON_POOLER_DSN,

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
    console.error("[NeonDB] ⚠️  Pool error (will auto-reconnect):", err.message);
  });

  console.log("[NeonDB] ✅ Pool ready → Neon PostgreSQL (neondb / final schema)");

  return _pool;
}

/** Direct connection pool for pgvector/HNSW queries. */
function getDirectPool() {
  if (_directPool) return _directPool;

  _directPool = new Pool({
    connectionString:        NEON_DIRECT_DSN,
    max:                     2,      // Only for vector search — limit connections
    min:                     0,
    idleTimeoutMillis:       30000,  // Keep warm — HNSW cold starts are expensive
    connectionTimeoutMillis: 15000,  // Direct connections take longer
    keepAlive:               true,
    keepAliveInitialDelayMillis: 10000,
    application_name:        "leader-backend-vector",
  });

  _directPool.on("error", (err) => {
    console.error("[NeonDB/vector] ⚠️  Direct pool error:", err.message);
  });

  console.log("[NeonDB] ✅ Direct pool ready → Neon (vector/pgvector queries)");

  return _directPool;
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

/**
 * Run a query against the DIRECT Neon connection (non-pooler).
 * Required for pgvector/HNSW ANN queries — PgBouncer pooler does not
 * preserve the session-level SET statements pgvector requires.
 *
 * @param {string} text     SQL with $1, $2, … placeholders
 * @param {Array}  params   Array of parameter values
 * @param {number} [timeoutMs=25000]  Per-query statement timeout in ms
 * @returns {Promise<import('pg').QueryResult>}
 */
async function directQuery(text, params = [], timeoutMs = 25000) {
  const client = await getDirectPool().connect();
  try {
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * Run a query against the DIRECT Neon connection with temporary session settings
 * (e.g. SET LOCAL hnsw.ef_search = 1000). Runs everything in a transaction block.
 *
 * @param {string} text     SQL with $1, $2, … placeholders
 * @param {Array}  params   Array of parameter values
 * @param {Array<string>} sessionCommands Commands to run inside transaction before query
 * @param {number} [timeoutMs=25000]  Per-query statement timeout in ms
 * @returns {Promise<import('pg').QueryResult>}
 */
async function directQueryWithSession(text, params = [], sessionCommands = [], timeoutMs = 25000) {
  const client = await getDirectPool().connect();
  try {
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    if (sessionCommands.length > 0) {
      await client.query("BEGIN;");
      for (const cmd of sessionCommands) {
        await client.query(cmd);
      }
      const res = await client.query(text, params);
      await client.query("COMMIT;");
      return res;
    } else {
      return await client.query(text, params);
    }
  } catch (err) {
    if (sessionCommands.length > 0) {
      try { await client.query("ROLLBACK;"); } catch (_) {}
    }
    throw err;
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

module.exports = { query, directQuery, directQueryWithSession, testConnection, closePool, getPool, getDirectPool, SCHEMA, TABLE };
