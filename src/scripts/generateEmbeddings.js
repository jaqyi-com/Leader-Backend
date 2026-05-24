/**
 * generateEmbeddings.js
 * ─────────────────────
 * One-time script: generates 512-dim OpenAI embeddings for every row in
 * public.usa_business_data and writes them back to the `embedding` column.
 *
 * Usage:   node src/scripts/generateEmbeddings.js
 * Resume:  just run again — it skips rows that already have an embedding
 * Cost:    ~$0.52 for 742k records (text-embedding-3-small @ $0.02/1M tokens)
 * Time:    ~45–60 minutes
 */

require("dotenv").config();
const { Client }   = require("pg");
const { OpenAI }   = require("openai");
const fs           = require("fs");
const path         = require("path");

// ── Config ──────────────────────────────────────────────────────────────────
const BATCH_SIZE        = 500;   // records per DB read
const EMBED_BATCH_SIZE  = 100;   // texts per OpenAI call (max 2048, keep small for safety)
const PROGRESS_FILE     = path.join(__dirname, "embed_progress.json");
const EMBED_MODEL       = "text-embedding-3-small";
const EMBED_DIMS        = 512;
const EMBED_DELAY_MS    = 200;   // pause between OpenAI batches (rate-limit safety)

// ── DB connection (uses akshat — has UPDATE on table) ─────────────────────
const DB_CONFIG = {
  host:                   process.env.CLOUD_SQL_HOST     || "34.71.167.187",
  port:                   5432,
  database:               process.env.CLOUD_SQL_DB       || "doott",
  user:                   "akshat",          // table owner — has UPDATE
  password:               "2420074#Akshat",
  ssl:                    { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
  statement_timeout:       60000,
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildEmbedText(row) {
  const parts = [
    row.business_name,
    row._category,
    [row.city, row.state].filter(Boolean).join(", "),
    row.phone || row.company_phone,
    row.street_address,
  ].filter(v => v && String(v).trim() && v !== "business_name");
  return parts.join(" | ").slice(0, 1000); // keep under token limit
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); }
  catch { return { offset: 0, done: 0, skipped: 0, errors: 0 }; }
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Client(DB_CONFIG);
  await db.connect();
  console.log("✅ Connected to Cloud SQL as akshat");

  // Count total & already embedded
  const totalRes = await db.query(
    `SELECT COUNT(*) AS cnt FROM public.usa_business_data WHERE business_name IS DISTINCT FROM 'business_name'`
  );
  const embeddedRes = await db.query(
    `SELECT COUNT(*) AS cnt FROM public.usa_business_data WHERE embedding IS NOT NULL`
  );
  const total    = parseInt(totalRes.rows[0].cnt);
  const already  = parseInt(embeddedRes.rows[0].cnt);
  console.log(`📊 Total rows: ${total.toLocaleString()}`);
  console.log(`📊 Already embedded: ${already.toLocaleString()} (${((already/total)*100).toFixed(1)}%)`);
  console.log(`📊 Remaining: ${(total - already).toLocaleString()}`);
  console.log(`💰 Estimated cost for remaining: ~$${((total - already) * 35 / 1_000_000 * 0.02).toFixed(3)}`);
  console.log("─────────────────────────────────────────────");

  if (already >= total) {
    console.log("🎉 All records already embedded! Nothing to do.");
    await db.end();
    return;
  }

  const prog = loadProgress();
  let { done, skipped, errors } = prog;
  let offset = 0; // always scan from beginning, skip rows that have embedding
  let processed = 0;
  const startTime = Date.now();

  while (true) {
    // Fetch batch of rows WITHOUT embeddings
    const batch = await db.query(
      `SELECT business_name, _category, city, state, phone, company_phone, street_address,
              ctid
       FROM public.usa_business_data
       WHERE embedding IS NULL
         AND business_name IS DISTINCT FROM 'business_name'
       ORDER BY ctid
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (batch.rows.length === 0) {
      console.log("\n✅ All rows processed!");
      break;
    }

    // Build embed texts
    const texts = batch.rows.map(buildEmbedText);
    const ctids = batch.rows.map(r => r.ctid);

    // Split texts into sub-batches for OpenAI
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const subTexts = texts.slice(i, i + EMBED_BATCH_SIZE);
      const subCtids = ctids.slice(i, i + EMBED_BATCH_SIZE);

      let embeddings;
      try {
        const res = await openai.embeddings.create({
          model:      EMBED_MODEL,
          input:      subTexts,
          dimensions: EMBED_DIMS,
        });
        embeddings = res.data.map(d => d.embedding);
      } catch (e) {
        console.error(`  ⚠️  OpenAI error: ${e.message} — retrying in 5s`);
        await sleep(5000);
        try {
          const res = await openai.embeddings.create({ model: EMBED_MODEL, input: subTexts, dimensions: EMBED_DIMS });
          embeddings = res.data.map(d => d.embedding);
        } catch (e2) {
          console.error(`  ❌ Retry failed: ${e2.message} — skipping batch`);
          errors += subTexts.length;
          continue;
        }
      }

      // Write embeddings back to DB using ctid for fast lookup
      for (let j = 0; j < embeddings.length; j++) {
        try {
          await db.query(
            `UPDATE public.usa_business_data SET embedding = $1 WHERE ctid = $2`,
            [`[${embeddings[j].join(",")}]`, subCtids[j]]
          );
          done++;
        } catch (e) {
          errors++;
        }
      }

      await sleep(EMBED_DELAY_MS);
    }

    processed += batch.rows.length;
    const elapsed  = (Date.now() - startTime) / 1000;
    const rate     = processed / elapsed;
    const remaining = (total - already - processed);
    const eta      = remaining > 0 ? Math.round(remaining / rate) : 0;

    // Progress line
    const pct = (((already + processed) / total) * 100).toFixed(1);
    process.stdout.write(
      `\r⚡ ${(already + processed).toLocaleString()} / ${total.toLocaleString()} (${pct}%) ` +
      `| ${rate.toFixed(0)} rec/s | ETA: ${Math.floor(eta/60)}m${eta%60}s | errors: ${errors}   `
    );

    saveProgress({ offset: processed, done, skipped, errors, pct });
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\n🏁 Done in ${Math.floor(totalTime/60)}m ${totalTime%60}s`);
  console.log(`   Embedded: ${done.toLocaleString()}`);
  console.log(`   Errors:   ${errors}`);
  console.log("\n📌 Next step: Create HNSW index in Cloud SQL Studio:");
  console.log("   CREATE INDEX CONCURRENTLY usa_biz_embedding_hnsw_idx");
  console.log("   ON public.usa_business_data");
  console.log("   USING hnsw (embedding vector_cosine_ops)");
  console.log("   WITH (m = 16, ef_construction = 64);");

  fs.unlinkSync(PROGRESS_FILE);
  await db.end();
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
