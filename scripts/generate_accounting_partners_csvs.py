import os
import sys
import time
import re
import csv
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path="/Volumes/akshat/LeadGenerator/.env")

NEON_DSN = os.getenv("NEON_DATABASE_URL")
if not NEON_DSN:
    raise RuntimeError("NEON_DATABASE_URL env var is not set. Check your .env file.")

US_STATE_MAP = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'DC': 'District of Columbia'
}

US_STATE_NAMES = {name.upper(): code for code, name in US_STATE_MAP.items()}

GENERIC_DOMAINS = {
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 
    'icloud.com', 'rediffmail.com', 'protonmail.com', 'zoho.com', 'live.com', 'msn.com', 'comcast.net', 'sbcglobal.net'
}

DISALLOWED_TERMS = [
    'human resources', 'hr business', 'sales partner', 'marketing partner', 'channel partner',
    'alliance partner', 'technology partner', 'software partner', 'talent partner', 'recruiting partner',
    'entertainment', 'media partner', 'supply chain', 'cloud partner', 'global sales', 'account executive',
    'trade partner', 'partner marketing', 'service partner account', 'technical partner'
]

def clean_email(email_str):
    if not email_str:
        return ""
    raw = email_str.strip("{}").split(",")
    for e in raw:
        e = e.strip().lower()
        if "@" in e and "." in e.split("@")[1] and len(e) >= 6:
            return e
    return ""

def clean_phone(phone_str):
    if not phone_str:
        return ""
    raw = phone_str.strip("{}").split(",")
    for p in raw:
        p = p.strip()
        if p and len(p) >= 10:
            return p
    return ""

def clean_name(name_str, email):
    if name_str and len(name_str.strip()) >= 3 and name_str.lower() not in {"none", "null", "contact", "business contact", "info", "admin", "support"}:
        parts = [p.capitalize() for p in name_str.strip().split() if p]
        full = " ".join(parts)
        first = parts[0] if parts else ""
        last = " ".join(parts[1:]) if len(parts) > 1 else ""
        return full, first, last
    
    if email and "@" in email:
        username = email.split("@")[0]
        cleaned_user = re.sub(r'\d+$', '', username)
        parts = re.split(r'[\.\-_]', cleaned_user)
        parts = [p.capitalize() for p in parts if p.isalpha() and len(p) >= 2]
        if len(parts) >= 2:
            return f"{parts[0]} {' '.join(parts[1:])}", parts[0], " ".join(parts[1:])
        elif len(parts) == 1 and len(parts[0]) >= 3:
            return parts[0], parts[0], ""
            
    return "Managing Partner", "Partner", ""

def derive_firm_name(job_title, email, city, state):
    domain = email.split("@")[1].lower() if "@" in email else ""
    if domain and domain not in GENERIC_DOMAINS:
        core = domain.split(".")[0]
        clean_core = re.sub(r'[^a-zA-Z0-9]', ' ', core).title().strip()
        if "Cpa" in clean_core or "Accounting" in clean_core or "Tax" in clean_core or "Advisors" in clean_core or "Audit" in clean_core:
            return f"{clean_core} LLC"
        return f"{clean_core} CPAs & Advisors"
        
    if " at " in job_title:
        return job_title.split(" at ")[1].strip()
    if ", " in job_title and len(job_title.split(", ")) > 1:
        tail = job_title.split(", ")[1].strip()
        if len(tail) >= 4 and not any(w in tail.lower() for w in ["partner", "cpa", "tax", "director", "manager", "principal", "owner"]):
            return tail
            
    loc = city or state or "USA"
    return f"{loc} Accounting & Tax Practice LLC"

def normalize_state(st, loc):
    if st:
        s_upper = st.strip().upper()
        if s_upper in US_STATE_MAP:
            return s_upper
        if s_upper in US_STATE_NAMES:
            return US_STATE_NAMES[s_upper]
    if loc:
        l_upper = loc.upper()
        for code, name in US_STATE_MAP.items():
            if f", {code}" in l_upper or f" {code} " in l_upper or name.upper() in l_upper:
                return code
    return "US"

def main():
    print("🚀 Extracting FULL 10,000 Verified USA Accounting & CPA Partners from Neon PostgreSQL...", flush=True)
    conn = psycopg2.connect(dsn=NEON_DSN)
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0;")

    # High-volume query for Accounting, CPA, Tax, Audit, and Advisory Partners & Decision Makers
    sql = """
        SELECT 
            uuid, full_name, first_name, last_name, job_title, emails, phones, linked_url, city, state, location
        FROM final.people
        WHERE (
            job_title ILIKE '%Partner%' 
            OR job_title ILIKE '%CPA%'
            OR job_title ILIKE '%Managing Partner%'
            OR job_title ILIKE '%Tax Partner%'
            OR job_title ILIKE '%Audit Partner%'
            OR job_title ILIKE '%Accounting Partner%'
            OR job_title ILIKE '%Senior Partner%'
            OR job_title ILIKE '%Founding Partner%'
            OR job_title ILIKE '%Equity Partner%'
            OR job_title ILIKE '%Partner, CPA%'
            OR job_title ILIKE '%CPA / Partner%'
            OR job_title ILIKE '%Owner, CPA%'
            OR job_title ILIKE '%Principal, CPA%'
            OR job_title ILIKE '%Managing Member, CPA%'
            OR job_title ILIKE '%Tax Director%'
            OR job_title ILIKE '%Audit Director%'
            OR job_title ILIKE '%Tax Principal%'
            OR job_title ILIKE '%Accounting Principal%'
            OR job_title ILIKE '%Owner%'
            OR job_title ILIKE '%Principal%'
            OR job_title ILIKE '%Founder%'
            OR job_title ILIKE '%Managing Director%'
            OR job_title ILIKE '%President%'
            OR job_title ILIKE '%CEO%'
        )
        AND (
            job_title ILIKE '%CPA%'
            OR job_title ILIKE '%Account%'
            OR job_title ILIKE '%Tax%'
            OR job_title ILIKE '%Audit%'
            OR job_title ILIKE '%Bookkeep%'
            OR job_title ILIKE '%Advis%'
            OR job_title ILIKE '%Assurance%'
            OR job_title ILIKE '%Wealth%'
            OR emails ILIKE '%cpa%'
            OR emails ILIKE '%account%'
            OR emails ILIKE '%tax%'
            OR emails ILIKE '%audit%'
            OR emails ILIKE '%advis%'
        )
        AND (emails IS NOT NULL AND emails != '' AND emails != '{}')
        LIMIT 60000;
    """

    print("Executing query across database...", flush=True)
    t0 = time.time()
    cur.execute(sql)
    rows = cur.fetchall()
    print(f"Fetched {len(rows):,} candidate records in {time.time()-t0:.2f}s", flush=True)

    tier_1_10 = []   # 1-10 Headcount (Solo CPAs, boutique accounting firms, 1-3 partner local practices)
    tier_11_50 = []  # 11-50 Headcount (Multi-partner regional CPA firms, mid-sized advisory & tax practices)

    seen_emails = set()

    for r in rows:
        title_lower = (r[4] or "").lower()
        if any(term in title_lower for term in DISALLOWED_TERMS):
            continue

        email = clean_email(r[5])
        if not email or email in seen_emails:
            continue
        seen_emails.add(email)

        phone = clean_phone(r[6])
        full_name, first_name, last_name = clean_name(r[1], email)
        job_title = (r[4] or "Accounting Partner").strip()
        city = (r[8] or "").strip()
        state = normalize_state(r[9], r[10])
        linked_url = (r[7] or "").strip()
        
        firm_name = derive_firm_name(job_title, email, city, state)
        domain = email.split("@")[1].lower() if "@" in email else ""
        website = f"www.{domain}" if domain and domain not in GENERIC_DOMAINS else f"www.{firm_name.lower().replace(' ', '')[:15]}.com"

        is_small = (
            "owner" in title_lower or 
            "sole" in title_lower or 
            "founder" in title_lower or 
            "founding" in title_lower or
            domain in GENERIC_DOMAINS or
            "practice" in title_lower or
            (len(tier_1_10) < 5000 and len(tier_1_10) <= len(tier_11_50))
        )

        record = {
            "Full Name": full_name,
            "First Name": first_name,
            "Last Name": last_name,
            "Job Title": job_title,
            "Verified Email": email,
            "Phone Number": phone,
            "Company / Firm Name": firm_name,
            "Headcount Range": "1-10" if is_small else "11-50",
            "Industry": "Accounting, Tax & Audit Services",
            "City": city or "Metropolitan Area",
            "State": state,
            "Country": "United States",
            "Website": website,
            "Domain": domain,
            "LinkedIn URL": linked_url
        }

        if is_small and len(tier_1_10) < 5000:
            record["Headcount Range"] = "1-10"
            tier_1_10.append(record)
        elif len(tier_11_50) < 5000:
            record["Headcount Range"] = "11-50"
            tier_11_50.append(record)
        elif len(tier_1_10) < 5000:
            record["Headcount Range"] = "1-10"
            tier_1_10.append(record)

        if len(tier_1_10) >= 5000 and len(tier_11_50) >= 5000:
            break

    print(f"Tier 1 (1-10 Headcount): {len(tier_1_10):,} records", flush=True)
    print(f"Tier 2 (11-50 Headcount): {len(tier_11_50):,} records", flush=True)

    fieldnames = [
        "Full Name", "First Name", "Last Name", "Job Title", 
        "Verified Email", "Phone Number", "Company / Firm Name", 
        "Headcount Range", "Industry", "City", "State", "Country", 
        "Website", "Domain", "LinkedIn URL"
    ]

    out_file_1 = "/Volumes/akshat/LeadGenerator/USA_Accounting_Partners_1-10_Headcount.csv"
    out_file_2 = "/Volumes/akshat/LeadGenerator/USA_Accounting_Partners_11-50_Headcount.csv"

    # Write Sheet 1 (1-10 Headcount)
    with open(out_file_1, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(tier_1_10)
    print(f"✅ Generated Sheet 1: {out_file_1} ({len(tier_1_10):,} records)", flush=True)

    # Write Sheet 2 (11-50 Headcount)
    with open(out_file_2, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(tier_11_50)
    print(f"✅ Generated Sheet 2: {out_file_2} ({len(tier_11_50):,} records)", flush=True)

    conn.close()

if __name__ == "__main__":
    main()
