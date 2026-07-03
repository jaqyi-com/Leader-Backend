import os
import sys
import time
from dotenv import load_dotenv
from psycopg2.extras import execute_values
import psycopg2

# Load environment variables
load_dotenv(dotenv_path="/Volumes/akshat/LeadGenerator/.env")

# Database Connection Info
DB_HOST = os.getenv("CLOUD_SQL_HOST", "34.9.35.25")
DB_PORT = os.getenv("CLOUD_SQL_PORT", "5432")
DB_NAME = os.getenv("CLOUD_SQL_DB", "doott_new")
DB_USER = os.getenv("CLOUD_SQL_USER", "postgres")
DB_PASS = os.getenv("CLOUD_SQL_PASSWORD")

def connect_db():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        sslmode="require"
    )

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
    print("⏳ Starting Company Embeddings...")
    while True:
        try:
            cursor.execute("""
                SELECT uuid, business_name, website, domain, address, city, state, industry
                FROM final.companies
                WHERE embedding IS NULL
                LIMIT %s
            """, (batch_size,))
            rows = cursor.fetchall()
            if not rows:
                print("✅ All companies processed.")
                break

            uuids = []
            texts = []
            for r in rows:
                uuid, name, website, domain, address, city, state, industry = r
                name_str = name if name else ""
                web_str = website if website else ""
                dom_str = domain if domain else ""
                addr_str = address if address else ""
                city_str = city if city else ""
                state_str = state if state else ""
                ind_str = str(industry) if industry else ""
                doc = f"Company: {name_str}. Website: {web_str} / {dom_str}. Address: {addr_str}, {city_str}, {state_str}. Industry: {ind_str}."
                uuids.append(uuid)
                texts.append(doc)

            # Generate embeddings
            embeddings = model.encode(texts, show_progress_bar=False)

            # Bulk update
            update_data = [(embeddings[i].tolist(), uuids[i]) for i in range(len(uuids))]
            execute_values(cursor, """
                UPDATE final.companies AS c
                SET embedding = v.embedding::vector
                FROM (VALUES %s) AS v(embedding, uuid)
                WHERE c.uuid = v.uuid::uuid
            """, update_data)
            
            print(f"   Indexed {len(rows)} companies...")
        
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as err:
            print(f"⚠️ Connection lost during company batch ({err}). Reconnecting...")
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

    # 2. PROCESS PEOPLE
    print("⏳ Starting People Embeddings...")
    while True:
        try:
            cursor.execute("""
                SELECT uuid, full_name, job_title, location, city, state
                FROM final.people
                WHERE embedding IS NULL
                LIMIT %s
            """, (batch_size,))
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

            print(f"   Indexed {len(rows)} people...")

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
