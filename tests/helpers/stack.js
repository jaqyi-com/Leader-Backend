"use strict";
// Hermetic local stack for integration tests: throwaway mongod + throwaway PostgreSQL
// (synthetic rows only) + the real backend. Nothing here touches Neon, Atlas or any real data.

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawn, spawnSync, execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const PG_BIN = ["/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/opt/postgresql@17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin"]
  .find((d) => fs.existsSync(path.join(d, "initdb")));
const hasMongod = spawnSync("mongod", ["--version"]).status === 0;
const available = { mongod: hasMongod, postgres: Boolean(PG_BIN) };

// Ports that fetch()/undici refuses to connect to ("bad port") — never hand these out.
const BAD_PORTS = new Set([4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);
const usedPorts = new Set();
const rand = (base, span) => {
  for (let i = 0; i < 100; i++) {
    const n = base + Math.floor(Math.random() * span);
    if (!BAD_PORTS.has(n) && !usedPorts.has(n)) { usedPorts.add(n); return n; }
  }
  throw new Error("no free test port");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATUSES = ["pending", "deliverable", "pending", "undeliverable", "pending", "risky", "unknown", "pending", "pending"];

/** Deterministic synthetic people — 250 rows, no real data. */
function syntheticPeople(n = 250) {
  const cities = [["Mumbai", "Maharashtra"], ["Pune", "Maharashtra"], ["Delhi", "Delhi"], ["Chennai", "Tamil Nadu"], ["Austin", "TX"]];
  // 8 titles vs 5 cities: coprime periods, so title and city are not correlated.
  // Several contain "cto"/"it" inside other words (Factory, Director, Doctor, Recruiter) on purpose.
  const titles = ["Software Engineer", "Sales Manager", "CTO", "Designer", "Factory Manager", "Director", "Recruiter", "Doctor"];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const [city, state] = cities[i % cities.length];
    rows.push({
      full_name: `Person ${String(i).padStart(3, "0")}`,
      job_title: titles[i % titles.length],
      city, state,
      emails: i % 2 === 0 ? `person${i}@example.test` : (i % 4 === 1 ? "{}" : ""),
      phones: i % 3 === 0 ? `+9100000${String(i).padStart(5, "0")}` : "{}",
      // Mirrors production: unverified rows are "pending" with is_email_valid NULL; every verified
      // non-deliverable status (undeliverable / risky / unknown) has is_email_valid FALSE.
      email_status: STATUSES[i % STATUSES.length],
      is_email_valid: { deliverable: true, undeliverable: false, risky: false, unknown: false }[STATUSES[i % STATUSES.length]] ?? null,
    });
  }
  return rows;
}

async function startPostgres(state) {
  const { Pool } = require("pg");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doott-pg-"));
  const port = rand(55000, 4000);
  execFileSync(path.join(PG_BIN, "initdb"), ["-D", dir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C", "-A", "trust"], { stdio: "ignore" });
  const proc = spawn(path.join(PG_BIN, "postgres"), ["-D", dir, "-p", String(port), "-k", dir, "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off"], { stdio: "ignore" });
  const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  const pool = new Pool({ connectionString: url, max: 2 });
  for (let i = 0; i < 80; i++) { try { await pool.query("select 1"); break; } catch { await sleep(250); } }
  await pool.query("create schema final");
  await pool.query(`create table final.people (
    uuid uuid primary key default gen_random_uuid(), company_uuid text, full_name text, first_name text, last_name text,
    job_title text, linked_url text, location text, city text, state text, pincode text, lat text, long text,
    geo_source text, emails text, phones text, created_at text, embedding text,
    is_email_valid boolean, email_status text, email_score numeric, email_verified_at timestamptz)`);
  const rows = syntheticPeople();
  for (const r of rows) {
    await pool.query(
      "insert into final.people (full_name, job_title, city, state, emails, phones, email_status, is_email_valid, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,'2026-01-01')",
      [r.full_name, r.job_title, r.city, r.state, r.emails, r.phones, r.email_status, r.is_email_valid]);
  }
  await pool.query("analyze final.people");
  state.pg = { proc, dir, pool, url, rows };
  return state.pg;
}

async function startMongo(state) {
  const mongoose = require("mongoose");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doott-mongo-"));
  const port = rand(27100, 800);
  const proc = spawn("mongod", ["--dbpath", dir, "--port", String(port), "--bind_ip", "127.0.0.1", "--nounixsocket", "--quiet"], { stdio: "ignore" });
  const uri = `mongodb://127.0.0.1:${port}/integration_test`;
  const conn = mongoose.createConnection();
  for (let i = 0; i < 60; i++) { try { await conn.openUri(uri, { serverSelectionTimeoutMS: 500 }); break; } catch { await sleep(250); } }
  await conn.close();
  state.mongo = { proc, dir, uri };
  return state.mongo;
}

/**
 * @param {{postgres?: boolean}} opts
 */
async function startStack({ postgres = false, env = {} } = {}) {
  const state = {};
  const mongo = await startMongo(state);
  const pg = postgres ? await startPostgres(state) : null;
  const apiPort = rand(4300, 700);
  const secret = "integration-secret-" + "q".repeat(40);
  const base = `http://127.0.0.1:${apiPort}`;
  state.server = spawn(process.execPath, [path.join(ROOT, "src/server.js")], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH, NODE_ENV: "production", PORT: String(apiPort), JWT_SECRET: secret,
      MONGO_URI: mongo.uri, NEON_DATABASE_URL: pg ? pg.url : "postgresql://u:p@127.0.0.1:1/x",
      OPENAI_API_KEY: "fake", APOLLO_API_KEY: "fake", SMTP_USER: "fake", SMTP_PASS: "fake",
      // generous limits so ordinary tests are not throttled; abuse tests override these
      RATE_LIMIT_AUTH_MAX: "100000", RATE_LIMIT_LOGIN_ACCOUNT_MAX: "100000", RATE_LIMIT_DATA_MAX: "100000",
      ...env,
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + "/", { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* retry */ }
    await sleep(250);
  }

  const http = async (method, url, { token, body } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    let json = null; try { json = await res.json(); } catch { /* not json */ }
    return { status: res.status, json };
  };

  let n = 0;
  const newUser = async (label = "user") => {
    const email = `${label}${++n}.${Date.now()}@example.test`;
    const password = "Passw0rd!integration";
    const r = await http("POST", "/api/auth/register", { body: { name: label, email, password } });
    if (r.status !== 201) throw new Error("register failed: " + r.status);
    const l = await http("POST", "/api/auth/login", { body: { email, password } });
    return { email, password, token: l.json.token, orgId: String(l.json.org?._id || l.json.org?.id) };
  };

  /** Set a user's plan directly in the test database ("free" | "lifetime"). */
  const setPlan = async (email, plan) => {
    const mongoose = require("mongoose");
    const conn = mongoose.createConnection();
    await conn.openUri(mongo.uri, { serverSelectionTimeoutMS: 3000 });
    await conn.collection("users").updateOne({ email: email.toLowerCase() }, { $set: { plan } });
    await conn.close();
  };

  // PostgreSQL must be stopped with SIGINT ("fast shutdown"): a SIGKILL leaks its System V
  // shared-memory segment, and macOS allows only ~32 of those system-wide (initdb then fails
  // with "No space left on device").
  const stopProc = (proc, signal) => new Promise((resolve) => {
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return resolve();
    const t = setTimeout(() => { try { proc.kill("SIGKILL"); } catch { /* ignore */ } resolve(); }, 10000);
    proc.once("exit", () => { clearTimeout(t); resolve(); });
    try { proc.kill(signal); } catch { clearTimeout(t); resolve(); }
  });

  const stop = async () => {
    try { await state.pg?.pool.end(); } catch { /* ignore */ }
    await Promise.all([stopProc(state.server, "SIGTERM"), stopProc(state.mongo?.proc, "SIGTERM"), stopProc(state.pg?.proc, "SIGINT")]);
    for (const d of [state.mongo?.dir, state.pg?.dir]) { try { d && fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
  };
  process.on("exit", () => {
    try { state.server && state.server.kill("SIGTERM"); } catch { /* ignore */ }
    try { state.mongo?.proc && state.mongo.proc.kill("SIGTERM"); } catch { /* ignore */ }
    try { state.pg?.proc && state.pg.proc.kill("SIGINT"); } catch { /* ignore */ }
  });

  return { base, secret, http, newUser, setPlan, stop, pg, mongo };
}

module.exports = { startStack, available, syntheticPeople };
