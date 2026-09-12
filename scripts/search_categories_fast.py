import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv("/Volumes/akshat/LeadGenerator/.env")

conn = psycopg2.connect(dsn=os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()
cur.execute("SET statement_timeout = 0;")

categories = {
    "Spices & Masalas": {
        "keywords": ["spice", "masala", "seasoning", "condiment", "pepper", "turmeric", "chilli powder", "cumin", "coriander"],
        "industry_patterns": ["%spice%", "%masala%", "%seasoning%", "%food%"]
    },
    "Dehydrated Powders & Vegetables": {
        "keywords": ["dehydrat", "vegetable powder", "onion powder", "garlic powder", "fruit powder", "spray dried", "dried powder"],
        "industry_patterns": ["%dehydrat%", "%powder%", "%food processing%"]
    },
    "Mushrooms": {
        "keywords": ["mushroom", "button mushroom", "oyster mushroom", "fungi", "cordyceps", "shiitake"],
        "industry_patterns": ["%mushroom%", "%fungi%", "%agriculture%"]
    },
    "Mattresses & Bedding": {
        "keywords": ["mattress", "bedding", "foam mattress", "spring mattress", "coir mattress", "orthopedic mattress", "sleep product"],
        "industry_patterns": ["%mattress%", "%bedding%", "%furniture%"]
    }
}

print("=========================================================================================", flush=True)
print("             DATABASE CATEGORY SEARCH: COMPANIES & DECISION MAKERS                       ", flush=True)
print("=========================================================================================", flush=True)

for cat_name, cfg in categories.items():
    print(f"\n🔍 Searching Category: {cat_name}...", flush=True)
    
    # Construct business_name / industry search
    kw_conditions = []
    params = []
    for kw in cfg["keywords"]:
        kw_conditions.append("business_name ILIKE %s OR industry ILIKE %s")
        params.extend([f"%{kw}%", f"%{kw}%"])
        
    where_clause = " OR ".join(kw_conditions)
    
    # 1. Count matching companies
    cur.execute(f"SELECT COUNT(*) FROM final.companies WHERE {where_clause};", params)
    comp_count = cur.fetchone()[0]
    
    # 2. Get sample companies
    cur.execute(f"""
        SELECT business_name, industry, city, state, phone, emails, website 
        FROM final.companies 
        WHERE {where_clause} 
        LIMIT 5;
    """, params)
    sample_comps = cur.fetchall()
    
    # 3. Search people matching keywords in job_title or emails
    people_conditions = []
    people_params = []
    for kw in cfg["keywords"][:4]: # top keywords
        people_conditions.append("job_title ILIKE %s OR emails ILIKE %s")
        people_params.extend([f"%{kw}%", f"%{kw}%"])
    people_where = " OR ".join(people_conditions)
    
    cur.execute(f"""
        SELECT full_name, job_title, city, state, emails, phones 
        FROM final.people 
        WHERE {people_where}
        LIMIT 5;
    """, people_params)
    sample_people = cur.fetchall()
    
    print(f"📊 [Result for {cat_name}]:", flush=True)
    print(f"   • Total Companies Found: {comp_count:,}", flush=True)
    print("   • Top Sample Companies:", flush=True)
    for c in sample_comps[:4]:
        name, ind, city, st, ph, em, web = c
        loc = f"{city or ''}, {st or ''}".strip(", ") or "N/A"
        print(f"     🏢 {name} | Industry: {ind or 'N/A'} | Loc: {loc} | Phone: {ph or 'N/A'} | Email: {em or 'N/A'}", flush=True)
        
    print("   • Sample Decision Makers / Contacts:", flush=True)
    for p in sample_people[:4]:
        pname, ptitle, pcity, pst, pem, pph = p
        ploc = f"{pcity or ''}, {pst or ''}".strip(", ") or "N/A"
        print(f"     👤 {pname or 'N/A'} ({ptitle or 'N/A'}) | Loc: {ploc} | Email: {pem or 'N/A'} | Phone: {pph or 'N/A'}", flush=True)

conn.close()
print("\n=========================================================================================", flush=True)
print("✅ SEARCH COMPLETE!", flush=True)
print("=========================================================================================", flush=True)
