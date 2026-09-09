import os
import sys
import time
from dotenv import load_dotenv
from psycopg2.extras import execute_values
import psycopg2

# Load environment variables from .env
load_dotenv(dotenv_path="/Volumes/akshat/LeadGenerator/.env")

# ── Neon PostgreSQL Connection ──
# Read from NEON_DATABASE_URL env var — NEVER hardcode credentials here!
NEON_DSN = os.getenv("NEON_DATABASE_URL")
if not NEON_DSN:
    raise RuntimeError("NEON_DATABASE_URL env var is not set. Check your .env file.")

def connect_db():
    return psycopg2.connect(
        dsn=NEON_DSN,
        connect_timeout=10,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5
    )

def get_connection_and_cursor():
    while True:
        try:
            conn = connect_db()
            conn.autocommit = True
            cursor = conn.cursor()
            cursor.execute("SET enable_seqscan = off;")
            return conn, cursor
        except Exception as e:
            print(f"⚠️ Database connection failed: {e}. Retrying in 5 seconds...", flush=True)
            time.sleep(5)

def main():
    print("Initializing sentence-transformers with Xenova/all-MiniLM-L6-v2...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')

    conn, cursor = get_connection_and_cursor()
    batch_size = 500

    # 1. PROCESS COMPANIES
    print("✅ All companies processed (skipped check).")

    # 2. PROCESS PEOPLE
    print("⏳ Starting People Embeddings...", flush=True)
    people_batch_size = 1000  # ⚡ Optimal throughput balance for Neon serverless WAL flushing
    total_processed = 0
    batch_count = 0
    while True:
        try:
            t0 = time.time()
            cursor.execute("""
                SELECT uuid, full_name, job_title, location, city, state
                FROM final.people
                WHERE embedding IS NULL
                LIMIT %s
            """, (people_batch_size,))
            rows = cursor.fetchall()
            t_fetch = time.time() - t0

            if not rows:
                print("🎉 No more un-embedded records found for people!", flush=True)
                break

            uuids = [r[0] for r in rows]
            texts = [
                f"Name: {r[1] or ''} | Title: {r[2] or ''} | Location: {r[3] or r[4] or r[5] or ''}".strip()
                for r in rows
            ]

            t1 = time.time()
            embeddings = model.encode(texts, show_progress_bar=False)
            t_encode = time.time() - t1

            # Bulk update
            t2 = time.time()
            update_data = [(embeddings[i].tolist(), uuids[i]) for i in range(len(uuids))]
            execute_values(cursor, """
                UPDATE final.people AS p
                SET embedding = v.embedding::vector
                FROM (VALUES %s) AS v(embedding, uuid)
                WHERE p.uuid = v.uuid::uuid
            """, update_data)
            t_update = time.time() - t2

            total_processed += len(rows)
            batch_count += 1
            print(f"   Batch #{batch_count}: {len(rows)} people | Fetch: {t_fetch:.2f}s | Encode: {t_encode:.2f}s | Update: {t_update:.2f}s (Total: {total_processed:,})", flush=True)

            # ⚠️ THERMAL SAFETY: 1s sleep between batches prevents CPU from pegging at 100%
            # and shutting down the MacBook. DO NOT remove this sleep.
            time.sleep(1.0)

        except (psycopg2.OperationalError, psycopg2.InterfaceError) as err:
            print(f"⚠️ Connection lost during people batch ({err}). Reconnecting...", flush=True)
            try:
                cursor.close()
                conn.close()
            except Exception:
                pass
            conn, cursor = get_connection_and_cursor()
            time.sleep(2)
        except Exception as e:
            print(f"❌ Unexpected error: {e}. Retrying batch in 5 seconds...", flush=True)
            time.sleep(5)

    cursor.close()
    conn.close()
    print("🎉 Embedding process completed successfully!")


if __name__ == '__main__':
    main()
