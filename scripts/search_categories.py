import os
import psycopg2
from dotenv import load_dotenv

load_dotenv("/Volumes/akshat/LeadGenerator/.env")

conn = psycopg2.connect(dsn=os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()
cur.execute("SET statement_timeout = 0;")

categories = {
    "Spices": ["%spice%", "%masala%", "%condiment%", "%seasoning%"],
    "Dehydrated Powders": ["%dehydrat%", "%powder%", "%dry vegetable%", "%onion powder%", "%garlic powder%"],
    "Mushrooms": ["%mushroom%", "%fungi%", "%button mushroom%", "%oyster mushroom%"],
    "Mattresses": ["%mattress%", "%bedding%", "%foam mattress%", "%spring mattress%", "%sleep product%"]
}

results = {}

for cat, patterns in categories.items():
    results[cat] = {"companies": 0, "people": 0, "sample_companies": [], "sample_people": []}
    
    # Companies query
    comp_clauses = " OR ".join(["business_name ILIKE %s OR industry ILIKE %s" for _ in patterns])
    params_comp = []
    for p in patterns:
        params_comp.extend([p, p])
    
    cur.execute(f"SELECT COUNT(*) FROM final.companies WHERE {comp_clauses};", params_comp)
    results[cat]["companies"] = cur.fetchone()[0]
    
    cur.execute(f"SELECT business_name, industry, city, state, phones, emails FROM final.companies WHERE {comp_clauses} LIMIT 5;", params_comp)
    results[cat]["sample_companies"] = cur.fetchall()

    # People query
    people_clauses = " OR ".join(["job_title ILIKE %s OR emails ILIKE %s" for _ in patterns])
    params_people = []
    for p in patterns:
        params_people.extend([p, p])
        
    cur.execute(f"SELECT COUNT(*) FROM final.people WHERE {people_clauses};", params_people)
    results[cat]["people"] = cur.fetchone()[0]
    
    cur.execute(f"SELECT full_name, job_title, city, state, emails, phones FROM final.people WHERE {people_clauses} LIMIT 5;", params_people)
    results[cat]["sample_people"] = cur.fetchall()

print("=================================================================")
print("             DATABASE CATEGORY SEARCH RESULTS                    ")
print("=================================================================")
total_companies = 0
total_people = 0

for cat, data in results.items():
    total_companies += data["companies"]
    total_people += data["people"]
    print(f"\n📂 CATEGORY: {cat}")
    print(f"  • Companies in DB: {data['companies']:,}")
    print(f"  • People / Contacts in DB: {data['people']:,}")
    print("  • Sample Companies:")
    for c in data["sample_companies"][:3]:
        print(f"     - {c[0]} | Industry: {c[1]} | {c[2]}, {c[3]} | Phone: {c[4]} | Email: {c[5]}")
    print("  • Sample Contacts / Decision Makers:")
    for p in data["sample_people"][:3]:
        print(f"     - {p[0]} ({p[1]}) | {p[2]}, {p[3]} | Email: {p[4]} | Phone: {p[5]}")

print("\n=================================================================")
print(f" TOTAL MATCHES: {total_companies:,} Companies | {total_people:,} Contacts")
print("=================================================================")

conn.close()
