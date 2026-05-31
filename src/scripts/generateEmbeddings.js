/**
 * generateEmbeddings.js  (v3 — pool + auto-reconnect)
 * ─────────────────────────────────────────────────────
 * Fixes v2 bug: single Client dropped by Cloud SQL after ~60 min idle,
 * causing all subsequent UPDATEs to fail with "connection error".
 *
 * v3 strategy:
 *   • Pool (max:2) for all DB operations — auto-reconnects on TCP drop
 *   • Initial big SELECT uses a dedicated pool client with long timeout
 *   • Each UNNEST UPDATE acquires a fresh client from the pool
 *   • keepAlive pings prevent Cloud SQL from dropping idle connections
 *   • Resume-safe: re-fetches only rows WHERE embedding IS NULL
 *
 * Usage:  node src/scripts/generateEmbeddings.js
 * Resume: safe to re-run at any time — skips already-embedded rows
 */

require("dotenv").config();
const { Pool }  = require("pg");
const { OpenAI } = require("openai");

// ── Config ────────────────────────────────────────────────────────────────────
const OPENAI_BATCH   = 1000;  // texts per OpenAI call  (max 2048)
const DB_WRITE_BATCH = 100;   // rows per UNNEST UPDATE (100 × 512-dim ≈ 400 KB — safe)
const EMBED_MODEL    = "text-embedding-3-small";
const EMBED_DIMS     = 512;

const POOL_CFG = {
  host:                       "34.71.167.187",
  port:                       5432,
  database:                   "doott",
  user:                       "jaqyi",
  password:                   "2420074",
  ssl:                        { rejectUnauthorized: false },
  // Pool settings
  max:                        2,      // 2 connections: 1 for fetch, 1 for writes
  min:                        0,
  idleTimeoutMillis:          60000,  // keep idle connections up to 60 s
  connectionTimeoutMillis:    30000,
  // TCP keep-alive prevents Cloud SQL from dropping the connection
  keepAlive:                  true,
  keepAliveInitialDelayMillis: 10000, // first ping after 10 s idle
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Build embed text for one row ──────────────────────────────────────────────
function embedText(r) {
  return [
    r.business_name,
    r._category,
    [r.city, r.state].filter(Boolean).join(", "),
    r.phone || r.company_phone,
    r.street_address,
  ]
    .map(v => (v && String(v).trim()) || null)
    .filter(Boolean)
    .join(" | ")
    .slice(0, 1000) || "Unknown Business";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Resilient pool UPDATE — retries up to 3× on connection errors ─────────────
async function poolUpdate(pool, ctids, embStrs) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE public.usa_business_data AS t
         SET    embedding = v.emb::vector(${EMBED_DIMS})
         FROM   unnest($1::text[], $2::text[]) AS v(ctid_str, emb)
         WHERE  t.ctid = v.ctid_str::tid`,
        [ctids, embStrs]
      );
      return true; // success
    } catch (e) {
      if (attempt < 3) {
        process.stderr.write(`\n  ⚠️  UPDATE attempt ${attempt} failed: ${e.message} — retrying in 5s…\n`);
        await sleep(5000);
      } else {
        process.stderr.write(`\n  ❌ UPDATE failed after 3 attempts: ${e.message}\n`);
        return false;
      }
    } finally {
      client.release();
    }
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool(POOL_CFG);
  pool.on("error", (err) =>
    process.stderr.write(`\n⚠️  Pool error (auto-reconnect): ${err.message}\n`)
  );

  // ─ 1. Count rows ─────────────────────────────────────────────────────────
  const totalRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM public.usa_business_data
     WHERE business_name IS DISTINCT FROM 'business_name'`
  );
  const embRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM public.usa_business_data WHERE embedding IS NOT NULL`
  );
  const grandTotal  = parseInt(totalRes.rows[0].cnt);
  const alreadyDone = parseInt(embRes.rows[0].cnt);
  const remaining   = grandTotal - alreadyDone;

  console.log("✅ Connected (pool) as jaqyi");
  console.log(`📊 Grand total : ${grandTotal.toLocaleString()}`);
  console.log(`📊 Already done: ${alreadyDone.toLocaleString()}`);
  console.log(`📊 Remaining   : ${remaining.toLocaleString()}`);
  console.log(`💰 Est. cost   : ~$${(remaining * 35 / 1_000_000 * 0.02).toFixed(3)}`);
  console.log("─────────────────────────────────────────────────────────");

  if (remaining === 0) {
    console.log("🎉 Nothing to do — all rows already embedded!");
    await pool.end();
    return;
  }

  // ─ 2. Fetch all rows that still need embedding ─────────────────────────
  // Use a dedicated client with a long statement_timeout for the big SELECT.
  console.log("⏳ Pre-fetching rows that need embedding (10–30 s)…");
  const fetchStart = Date.now();

  const fetchClient = await pool.connect();
  await fetchClient.query("SET statement_timeout = 300000"); // 5 min
  const fetchRes = await fetchClient.query(
    `SELECT
       ctid::text    AS ctid_str,
       business_name,
       _category,
       city,
       state,
       phone,
       company_phone,
       street_address
     FROM public.usa_business_data
     WHERE embedding IS NULL
       AND business_name IS DISTINCT FROM 'business_name'
     ORDER BY ctid`
  );
  fetchClient.release();

  const rows = fetchRes.rows;
  console.log(`✅ Fetched ${rows.length.toLocaleString()} rows in ${((Date.now()-fetchStart)/1000).toFixed(1)}s`);
  console.log("─────────────────────────────────────────────────────────");

  // ─ 3. Process in batches ─────────────────────────────────────────────────
  let done   = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < rows.length; i += DB_WRITE_BATCH) {
    const batch = rows.slice(i, i + DB_WRITE_BATCH);

    // Call OpenAI in sub-batches of OPENAI_BATCH
    const allEmbeddings = [];
    for (let j = 0; j < batch.length; j += OPENAI_BATCH) {
      const sub   = batch.slice(j, j + OPENAI_BATCH);
      const texts = sub.map(embedText);

      let res = null;
      for (let retry = 3; retry > 0; retry--) {
        try {
          res = await openai.embeddings.create({
            model:      EMBED_MODEL,
            input:      texts,
            dimensions: EMBED_DIMS,
          });
          break;
        } catch (e) {
          if (retry === 1) {
            process.stderr.write(`\n  ⚠️  OpenAI failed (skipping sub-batch): ${e.message}\n`);
          } else {
            await sleep(3000);
          }
        }
      }

      if (res) allEmbeddings.push(...res.data.map(d => d.embedding));
      else     allEmbeddings.push(...Array(sub.length).fill(null));
    }

    // Build ctid / embStr arrays (skip nulls from OpenAI failures)
    const ctids   = [];
    const embStrs = [];
    batch.forEach((row, idx) => {
      const emb = allEmbeddings[idx];
      if (emb) {
        ctids.push(row.ctid_str);
        embStrs.push(`[${emb.join(",")}]`);
      } else {
        errors++;
      }
    });

    // Write to DB using pool (auto-reconnects on connection drop)
    if (ctids.length > 0) {
      const ok = await poolUpdate(pool, ctids, embStrs);
      if (ok) done += ctids.length;
      else    errors += ctids.length;
    }

    // Progress line
    const elapsed = (Date.now() - startTime) / 1000;
    const rate    = done / elapsed;
    const etaSec  = rate > 0 ? Math.round((rows.length - done) / rate) : 9999;
    const pct     = ((alreadyDone + done) / grandTotal * 100).toFixed(1);
    process.stdout.write(
      `\r⚡ ${(alreadyDone + done).toLocaleString()} / ${grandTotal.toLocaleString()} (${pct}%)` +
      ` | ${Math.round(rate)}/s | ETA: ${Math.floor(etaSec/60)}m${etaSec%60}s | err: ${errors}   `
    );
  }

  const totalSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\n🏁 Finished in ${Math.floor(totalSec/60)}m ${totalSec%60}s`);
  console.log(`   Embedded : ${done.toLocaleString()}`);
  console.log(`   Errors   : ${errors}`);
  if (errors > 0) {
    console.log(`\n⚠️  ${errors} rows had errors — re-run to retry them (they still have embedding IS NULL).`);
  } else {
    console.log("\n🎉 All rows embedded successfully!");
  }

  await pool.end();
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
