import os
import sys
import time
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path="/Volumes/akshat/LeadGenerator/.env")

NEON_DSN = os.getenv("NEON_DATABASE_URL")
if not NEON_DSN:
    print("❌ NEON_DATABASE_URL env var is not set.")
    sys.exit(1)

def run_monitor():
    conn = psycopg2.connect(dsn=NEON_DSN)
    cur = conn.cursor()
    
    print("\033[2J\033[H", end="") # Clear screen
    print("=================================================================")
    print("       ⚡ NEON POSTGRESQL LIVE ENRICHMENT MONITOR ⚡            ")
    print("=================================================================\n")

    while True:
        try:
            # 1. Sample 100k stats
            cur.execute("""
                SELECT 
                    COUNT(*) AS total_sample,
                    COUNT(*) FILTER (WHERE full_name IS NOT NULL AND full_name != '') AS with_name,
                    COUNT(*) FILTER (WHERE full_name IS NULL OR full_name = '') AS nameless
                FROM (SELECT * FROM final.people LIMIT 100000) sub;
            """)
            s = cur.fetchone()
            pct_named = (s[1] / s[0]) * 100
            pct_nameless = (s[2] / s[0]) * 100

            # 2. Latest 5 enriched records
            cur.execute("""
                SELECT full_name, first_name, last_name, emails, city, state
                FROM final.people
                WHERE full_name IS NOT NULL AND full_name != ''
                  AND emails IS NOT NULL AND emails != '' AND emails != '{}'
                ORDER BY created_at DESC
                LIMIT 5;
            """)
            latest = cur.fetchall()

            # Render
            print("\033[H", end="")
            print("=================================================================")
            print("       ⚡ NEON POSTGRESQL LIVE ENRICHMENT MONITOR ⚡            ")
            print(f"       Last Updated: {time.strftime('%Y-%m-%d %H:%M:%S')}       ")
            print("=================================================================")
            print(f"  📊 Sample Size Analyzed : {s[0]:,} records")
            print(f"  ✅ Contacts with Names  : {s[1]:,} ({pct_named:.2f}%)")
            print(f"  ⏳ Remaining Nameless   : {s[2]:,} ({pct_nameless:.2f}%)")
            print("-----------------------------------------------------------------")
            print("  🟢 LATEST ENRICHED CONTACTS:")
            for r in latest:
                name = (r[0] or "")[:24]
                email = (r[3] or "").strip("{}")[:30]
                loc = f"{r[4] or ''}, {r[5] or ''}".strip(", ")[:15]
                print(f"   • {name:25} | {email:32} | {loc}")
            print("=================================================================")
            print("  (Press Ctrl+C to exit monitor)\n")

            time.sleep(5)

        except KeyboardInterrupt:
            print("\nExiting monitor...")
            break
        except Exception as e:
            print(f"⚠️ Reconnecting... ({e})")
            time.sleep(5)
            try:
                cur.close()
                conn.close()
            except Exception:
                pass
            conn = psycopg2.connect(dsn=NEON_DSN)
            cur = conn.cursor()

    conn.close()

if __name__ == "__main__":
    run_monitor()
