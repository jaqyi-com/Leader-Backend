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
    return psycopg2.connect(dsn=NEON_DSN)

def get_connection_and_cursor():
    while True:
        try:
            conn = connect_db()
            conn.autocommit = True
            return conn, conn.cursor()
        except Exception as e:
            print(f"⚠️ Database connection failed: {e}. Retrying in 5 seconds...")
            time.sleep(5)

def main():
    print("Initializing sentence-transformers with Xenova/all-MiniLM-L6-v2...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('all-MiniLM-L6-v2')

    conn, cursor = get_connection_and_cursor()
    batch_size = 500

    # 1. PROCESS COMPANIES
    print("✅ All companies processed (skipped check).")

    # 2. PROCESS PEOPLE
    print("⏳ Starting People Embeddings...", flush=True)
    people_batch_size = 1000  # ⚠️ Thermal balance: 1000 batch + 1s sleep. Sleep is the real protection, not small batch.
    total_processed = 0
    batch_count = 0
    while True:
        try:
            cursor.execute("""
                SELECT uuid, full_name, job_title, location, city, state
                FROM final.people
                WHERE embedding IS NULL
                LIMIT %s
            """, (people_batch_size,))
            rows = cursor.fetchall()
            if not rows:
                print("✅ All people processed.")
                break

            uuids = []
            texts = []
            for r in rows:
                uuid, full_name, job_title, location, city, state = r
                name_str = full_name if full_name else ""
                title_str = job_title if job_title else ""
                loc_str = location if location else ""
                city_str = city if city else ""
                state_str = state if state else ""
                doc = f"Person: {name_str}. Job Title: {title_str}. Location: {loc_str}, {city_str}, {state_str}."
                uuids.append(uuid)
                texts.append(doc)

            # Generate embeddings
            embeddings = model.encode(texts, show_progress_bar=False)

            # Bulk update
            update_data = [(embeddings[i].tolist(), uuids[i]) for i in range(len(uuids))]
            execute_values(cursor, """
                UPDATE final.people AS p
                SET embedding = v.embedding::vector
                FROM (VALUES %s) AS v(embedding, uuid)
                WHERE p.uuid = v.uuid::uuid
            """, update_data)

            total_processed += len(rows)
            batch_count += 1
            print(f"   Batch #{batch_count}: Indexed {len(rows)} people (total so far: {total_processed:,})...", flush=True)

            # ⚠️ THERMAL SAFETY: 1s sleep between batches prevents CPU from pegging at 100%
            # and shutting down the MacBook. DO NOT remove this sleep.
            time.sleep(1.0)

        except (psycopg2.OperationalError, psycopg2.InterfaceError) as err:
            print(f"⚠️ Connection lost during people batch ({err}). Reconnecting...")
            try:
                cursor.close()
                conn.close()
            except Exception:
                pass
            conn, cursor = get_connection_and_cursor()
            time.sleep(2)
        except Exception as e:
            print(f"❌ Unexpected error: {e}. Retrying batch in 5 seconds...")
            time.sleep(5)

    cursor.close()
    conn.close()
    print("🎉 Embedding process completed successfully!")


if __name__ == '__main__':
    main()
