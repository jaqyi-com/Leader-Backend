import os
import sys
import time
import re
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv(dotenv_path="/Volumes/akshat/LeadGenerator/.env")

NEON_DSN = os.getenv("NEON_DATABASE_URL")
if not NEON_DSN:
    raise RuntimeError("NEON_DATABASE_URL env var is not set. Check your .env file.")

GENERIC_USERNAMES = {
    'info', 'support', 'contact', 'admin', 'sales', 'help', 'office', 'mail', 
    'team', 'service', 'billing', 'inquiry', 'consultant', 'feedback', 'marketing', 
    'hr', 'jobs', 'careers', 'general', 'hello', 'enquiry', 'orders', 'customercare', 
    'care', 'root', 'user', 'guest', 'postmaster', 'hostmaster', 'webmaster', 'security'
}

COMMON_DOMAINS = {'gmail', 'yahoo', 'hotmail', 'outlook', 'rediffmail', 'icloud', 'protonmail', 'zoho', 'aol'}

def extract_name_from_email(email_str):
    if not email_str:
        return None, None, None
    
    cleaned = email_str.strip('{}').split(',')[0].strip()
    if '@' not in cleaned:
        return None, None, None
    
    parts = cleaned.split('@')
    username = parts[0].strip().lower()
    domain = parts[1].strip().lower().split('.')[0] if len(parts) > 1 else ''
    
    # Generic emails (e.g. info@domain.com)
    if username in GENERIC_USERNAMES:
        if domain and domain not in COMMON_DOMAINS:
            dom_clean = re.sub(r'[^a-zA-Z]', ' ', domain).title().strip()
            if len(dom_clean) >= 3:
                return f"{dom_clean} Representative", dom_clean, "Representative"
        return "Business Contact", "Business", "Contact"
    
    # Clean username from trailing digits
    cleaned_user = re.sub(r'\d+$', '', username)
    if len(cleaned_user) < 3:
        if domain and domain not in COMMON_DOMAINS:
            dom_clean = re.sub(r'[^a-zA-Z]', ' ', domain).title().strip()
            if len(dom_clean) >= 3:
                return f"{dom_clean} Representative", dom_clean, "Representative"
        return "Business Contact", "Business", "Contact"
        
    parts = re.split(r'[\.\-_]', cleaned_user)
    parts = [p.capitalize() for p in parts if p.isalpha() and len(p) >= 2]
    
    if len(parts) >= 2:
        first = parts[0]
        last = ' '.join(parts[1:])
        return f"{first} {last}", first, last
    elif len(parts) == 1 and len(parts[0]) >= 3:
        first = parts[0]
        return first, first, ""
    
    return "Business Contact", "Business", "Contact"

def connect_db():
    return psycopg2.connect(
        dsn=NEON_DSN,
        connect_timeout=10,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5
    )

def main():
    print("🚀 Starting Option B: Email-to-Name Batch Enrichment on final.people...", flush=True)
    conn = connect_db()
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute("SET statement_timeout = 0;")
    
    batch_size = 5000
    total_updated = 0
    batch_num = 0
    
    while True:
        try:
            t0 = time.time()
            cursor.execute("""
                SELECT uuid, emails
                FROM final.people
                WHERE (full_name IS NULL OR full_name = '')
                  AND (emails IS NOT NULL AND emails != '' AND emails != '{}')
                ORDER BY uuid ASC
                LIMIT %s;
            """, (batch_size,))
            rows = cursor.fetchall()
            t_fetch = time.time() - t0
            
            if not rows:
                print(f"🎉 Option B Complete! Total records enriched: {total_updated:,}", flush=True)
                break
                
            updates = []
            for uid, em in rows:
                full_name, first_name, last_name = extract_name_from_email(em)
                if full_name:
                    updates.append((full_name, first_name or None, last_name or None, str(uid)))

            if updates:
                t1 = time.time()
                execute_values(cursor, """
                    UPDATE final.people AS p
                    SET full_name = v.full_name,
                        first_name = COALESCE(p.first_name, v.first_name),
                        last_name = COALESCE(p.last_name, v.last_name)
                    FROM (VALUES %s) AS v(full_name, first_name, last_name, uuid)
                    WHERE p.uuid = v.uuid::uuid;
                """, updates)
                t_update = time.time() - t1
                total_updated += len(updates)
            else:
                t_update = 0

            batch_num += 1
            print(f"   Batch #{batch_num}: {len(rows)} scanned | {len(updates)} enriched | Fetch: {t_fetch:.2f}s | Update: {t_update:.2f}s | (Total: {total_updated:,})", flush=True)
            
            time.sleep(0.05)

        except Exception as e:
            print(f"⚠️ Error during batch #{batch_num}: {e}. Retrying in 5s...", flush=True)
            time.sleep(5)
            try:
                cursor.close()
                conn.close()
            except Exception:
                pass
            conn = connect_db()
            conn.autocommit = True
            cursor = conn.cursor()
            cursor.execute("SET statement_timeout = 0;")

    conn.close()

if __name__ == "__main__":
    main()
