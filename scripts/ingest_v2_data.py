import os
import sys
import csv
import re
import uuid
import time
from datetime import datetime
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values

# Load environment variables from .env
load_dotenv(dotenv_path="/Volumes/akshat/LeadGenerator/.env")

NEON_DSN = os.getenv("NEON_DATABASE_URL")
if not NEON_DSN:
    raise RuntimeError("NEON_DATABASE_URL env var is not set. Check your .env file.")

JUNK_KEYWORDS = {
    'test', 'n/a', 'na', 'null', 'none', 'demo', 'user', 'admin', 
    'unknown', 'telecaller', 'sample', 'fake', 'abc', 'xyz', '123'
}

def clean_phone(phone_str):
    if not phone_str:
        return ""
    digits = re.sub(r'\D', '', phone_str)
    if len(digits) >= 10:
        p = digits[-10:]
        # Valid Indian mobiles start with 6, 7, 8, 9
        if p[0] in ('6', '7', '8', '9'):
            return p
    return ""

def clean_str(val):
    if not val:
        return ""
    s = val.strip()
    return "" if s.lower() in ('null', 'none', 'n/a', 'na', 'undefined') else s

def extract_domain(website):
    if not website:
        return ""
    w = website.strip().lower()
    w = re.sub(r'^https?://', '', w)
    w = re.sub(r'^www\.', '', w)
    return w.split('/')[0]

def is_valid_name(name):
    if not name or len(name) < 2:
        return False
    n_lower = name.lower().strip()
    if n_lower in JUNK_KEYWORDS:
        return False
    if re.match(r'^\d+$', n_lower):
        return False
    if re.match(r'^[^\w\s]+$', n_lower):
        return False
    return True

def get_db_connection():
    return psycopg2.connect(dsn=NEON_DSN, connect_timeout=30)

def ingest_companies(conn):
    path = '/Volumes/akshat/LeadGenerator/final_data/companies_v2.csv'
    if not os.path.exists(path):
        print(f"⚠️ {path} not found. Skipping companies ingestion.")
        return 0

    cur = conn.cursor()
    cur.execute("SET enable_seqscan = off;")
    cur.execute("SELECT COUNT(*) FROM final.companies WHERE geo_source = 'csv_v2_import';")
    existing_v2_count = cur.fetchone()[0]
    if existing_v2_count >= 280000:
        print(f"\n🏢 {existing_v2_count:,} V2 Companies already imported in DB. Skipping companies step.")
        return existing_v2_count

    print("\n🏢 Loading existing company phone numbers and domains from Database for deduplication...")
    cur.execute("SELECT phones, domain, business_name, city FROM final.companies WHERE phones IS NOT NULL OR domain IS NOT NULL OR business_name IS NOT NULL;")
    db_phones = set()
    db_domains = set()
    db_name_city = set()

    for r in cur.fetchall():
        ph, dom, bname, city = r
        if ph:
            p = clean_phone(ph)
            if p: db_phones.add(p)
        if dom:
            db_domains.add(dom.strip().lower())
        if bname:
            db_name_city.add((bname.strip().lower(), (city or '').strip().lower()))

    print(f"   Loaded {len(db_phones):,} existing phones and {len(db_domains):,} domains from DB.")

    file_seen_phones = set()
    file_seen_name_city = set()

    total_read = 0
    skipped_junk = 0
    skipped_dup_db = 0
    skipped_dup_file = 0

    insert_rows = []
    created_at = datetime.utcnow().isoformat()

    print("📄 Reading and filtering companies_v2.csv...")
    t0 = time.time()

    with open(path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for r in reader:
            total_read += 1

            cname = clean_str(r.get('company_name'))
            if not is_valid_name(cname):
                skipped_junk += 1
                continue

            city = clean_str(r.get('city'))
            state = clean_str(r.get('state'))
            name_city_key = (cname.lower(), city.lower())

            # In-file name+city duplicate check
            if name_city_key in file_seen_name_city:
                skipped_dup_file += 1
                continue
            # DB name+city duplicate check
            if name_city_key in db_name_city:
                skipped_dup_db += 1
                continue

            website = clean_str(r.get('website'))
            domain = extract_domain(website)

            mobile1 = clean_str(r.get('mobile'))
            mobile2 = clean_str(r.get('mobile2'))
            p1 = clean_phone(mobile1)
            p2 = clean_phone(mobile2)
            main_phone = p1 or p2

            # Deduplication by phone
            if main_phone:
                if main_phone in db_phones:
                    skipped_dup_db += 1
                    continue
                if main_phone in file_seen_phones:
                    skipped_dup_file += 1
                    continue

            # Build full address
            addr_parts = [clean_str(r.get(a)) for a in ('address', 'address2', 'address3')]
            address = ", ".join([a for a in addr_parts if a])

            pincode = clean_str(r.get('pincode'))
            category = clean_str(r.get('category'))
            email = clean_str(r.get('email'))

            # Mark seen
            file_seen_name_city.add(name_city_key)
            if main_phone:
                file_seen_phones.add(main_phone)

            row_uuid = str(uuid.uuid4())
            insert_rows.append((
                row_uuid, cname, website, domain, address, city, state, pincode,
                None, None, 'csv_v2_import', main_phone, category, None, None,
                email, main_phone, created_at
            ))

    print(f"📊 Companies Read: {total_read:,} | Junk/Invalid: {skipped_junk:,} | Dup File: {skipped_dup_file:,} | Dup DB: {skipped_dup_db:,} | To Insert: {len(insert_rows):,}")

    if insert_rows:
        print(f"🚀 Inserting {len(insert_rows):,} new unique companies into final.companies...")
        batch_size = 5000
        cur.execute("SET enable_seqscan = off;")
        for i in range(0, len(insert_rows), batch_size):
            chunk = insert_rows[i:i+batch_size]
            execute_values(cur, """
                INSERT INTO final.companies (
                    uuid, business_name, website, domain, address, city, state, pincode,
                    lat, long, geo_source, phone, industry, rating, reviews,
                    emails, phones, created_at
                ) VALUES %s
            """, chunk)
            conn.commit()
            print(f"   Inserted {min(i+batch_size, len(insert_rows)):,}/{len(insert_rows):,} companies...", flush=True)

    print(f"✅ Companies Ingestion Completed in {round(time.time()-t0, 2)}s!")
    return len(insert_rows)


def ingest_people(conn):
    path = '/Volumes/akshat/LeadGenerator/final_data/people_v2.csv'
    if not os.path.exists(path):
        print(f"⚠️ {path} not found. Skipping people ingestion.")
        return 0

    print("\n👥 Reading and filtering people_v2.csv (In-File Deduplication)...", flush=True)
    t0 = time.time()

    file_seen_phones = set()
    file_seen_emails = set()

    candidate_people = []
    candidate_phones = set()
    candidate_emails = set()

    total_read = 0
    skipped_junk = 0
    skipped_dup_file = 0

    created_at = datetime.utcnow().isoformat()

    with open(path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for r in reader:
            total_read += 1

            name = clean_str(r.get('name'))
            if not is_valid_name(name):
                skipped_junk += 1
                continue

            mobile1 = clean_str(r.get('mobile'))
            mobile2 = clean_str(r.get('mobile2'))
            p1 = clean_phone(mobile1)
            p2 = clean_phone(mobile2)
            main_phone = p1 or p2

            email = clean_str(r.get('email')).lower()
            if email and ('@' not in email or '.' not in email):
                email = ""

            # In-file deduplication by phone
            if main_phone:
                if main_phone in file_seen_phones:
                    skipped_dup_file += 1
                    continue

            # In-file deduplication by email
            if email:
                if email in file_seen_emails:
                    skipped_dup_file += 1
                    continue

            # Mark in-file seen
            if main_phone:
                file_seen_phones.add(main_phone)
                candidate_phones.add(main_phone)
            if email:
                file_seen_emails.add(email)
                candidate_emails.add(email)

            name_parts = name.split()
            first_name = name_parts[0] if name_parts else ""
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

            job_title = clean_str(r.get('job_title')) or clean_str(r.get('category'))
            linked_url = clean_str(r.get('linkedin_url'))

            addr_parts = [clean_str(r.get(a)) for a in ('address', 'address2', 'address3')]
            location = ", ".join([a for a in addr_parts if a])

            city = clean_str(r.get('city'))
            state = clean_str(r.get('state'))
            pincode = clean_str(r.get('pincode'))

            candidate_people.append({
                'uuid': str(uuid.uuid4()),
                'full_name': name,
                'first_name': first_name,
                'last_name': last_name,
                'job_title': job_title,
                'linked_url': linked_url,
                'location': location,
                'city': city,
                'state': state,
                'pincode': pincode,
                'email': email,
                'phone': main_phone,
                'created_at': created_at
            })

    print(f"📊 People CSV Read: {total_read:,} | Junk/Invalid: {skipped_junk:,} | Dup File: {skipped_dup_file:,} | Candidate Unique: {len(candidate_people):,}", flush=True)

    print("\n🔍 Index-Accelerated Cross-DB Deduplication Scan...", flush=True)
    t_db = time.time()
    cur = conn.cursor()
    cur.execute("SET enable_seqscan = off;")

    db_dup_phones = set()
    db_dup_emails = set()

    # Query DB phones using index idx_people_phones_sub
    cand_phone_list = list(candidate_phones)
    chunk_size = 20000
    for i in range(0, len(cand_phone_list), chunk_size):
        chunk = cand_phone_list[i:i+chunk_size]
        cur.execute("""
            SELECT DISTINCT substring(phones from 1 for 50) 
            FROM final.people 
            WHERE substring(phones from 1 for 50) = ANY(%s);
        """, (chunk,))
        for r in cur.fetchall():
            if r[0]:
                p = clean_phone(r[0])
                if p: db_dup_phones.add(p)
        print(f"   Scanned {min(i+chunk_size, len(cand_phone_list)):,}/{len(cand_phone_list):,} Candidate Phones | DB Dup Matched: {len(db_dup_phones):,}...", flush=True)

    # Query DB emails using index idx_people_emails_sub
    cand_email_list = list(candidate_emails)
    for i in range(0, len(cand_email_list), chunk_size):
        chunk = cand_email_list[i:i+chunk_size]
        cur.execute("""
            SELECT DISTINCT substring(emails from 1 for 100) 
            FROM final.people 
            WHERE substring(emails from 1 for 100) = ANY(%s);
        """, (chunk,))
        for r in cur.fetchall():
            if r[0]:
                e = r[0].strip().lower()
                if e: db_dup_emails.add(e)
        print(f"   Scanned {min(i+chunk_size, len(cand_email_list)):,}/{len(cand_email_list):,} Candidate Emails | DB Dup Matched: {len(db_dup_emails):,}...", flush=True)

    print(f"✅ Indexed DB Deduplication Completed in {round(time.time()-t_db, 2)}s! Found {len(db_dup_phones):,} DB duplicate phones & {len(db_dup_emails):,} DB duplicate emails.", flush=True)

    # Filter candidate list against DB duplicates
    insert_rows = []
    skipped_dup_db = 0

    for item in candidate_people:
        p = item['phone']
        e = item['email']
        if (p and p in db_dup_phones) or (e and e in db_dup_emails):
            skipped_dup_db += 1
            continue
        insert_rows.append((
            item['uuid'], None, item['full_name'], item['first_name'], item['last_name'],
            item['job_title'], item['linked_url'], item['location'], item['city'],
            item['state'], item['pincode'], None, None, 'csv_v2_import',
            item['email'], item['phone'], item['created_at']
        ))

    print(f"📊 Final People To Insert into final.people: {len(insert_rows):,} (Skipped DB Duplicates: {skipped_dup_db:,})", flush=True)

    if insert_rows:
        print(f"🚀 Inserting {len(insert_rows):,} new unique people into final.people...", flush=True)
        batch_size = 20000
        cur.execute("SET enable_seqscan = off;")
        for i in range(0, len(insert_rows), batch_size):
            chunk = insert_rows[i:i+batch_size]
            execute_values(cur, """
                INSERT INTO final.people (
                    uuid, company_uuid, full_name, first_name, last_name, job_title, linked_url,
                    location, city, state, pincode, lat, long, geo_source,
                    emails, phones, created_at
                ) VALUES %s
            """, chunk, page_size=5000)
            if (i + batch_size) % 100000 == 0 or (i + batch_size) >= len(insert_rows):
                conn.commit()
            print(f"   Inserted {min(i+batch_size, len(insert_rows)):,}/{len(insert_rows):,} people...", flush=True)
        conn.commit()

    print(f"🎉 People Ingestion Completed in {round(time.time()-t0, 2)}s!", flush=True)
    return len(insert_rows)




def main():
    print("=" * 70)
    print("🚀 STARTING V2 DATASET ETL & DEDUPLICATION INGESTION PIPELINE")
    print("=" * 70, flush=True)

    conn = get_db_connection()
    conn.autocommit = False

    try:
        inserted_companies = ingest_companies(conn)
        inserted_people = ingest_people(conn)
        print("\n" + "=" * 70)
        print("🎉 INGESTION PIPELINE SUCCESSFULLY COMPLETED!")
        print(f"   - Total Companies Inserted: {inserted_companies:,}")
        print(f"   - Total People Inserted:    {inserted_people:,}")
        print("=" * 70, flush=True)
    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR during ingestion pipeline: {e}", flush=True)
        raise e
    finally:
        conn.close()

if __name__ == '__main__':
    main()

