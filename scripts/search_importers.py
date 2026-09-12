import os
import psycopg2
from dotenv import load_dotenv

load_dotenv("/Volumes/akshat/LeadGenerator/.env")

conn = psycopg2.connect(dsn=os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()
cur.execute("SET statement_timeout = 0;")

importer_queries = {
    "Spices & Seasonings Importers / Traders": """
        (business_name ~* '\\m(spice|spices|masala|masalas|seasoning|seasonings|turmeric|cumin|cardamom|chilli|pepper|herbs)\\M' OR industry ~* '\\m(spice|spices|masala|condiments)\\M')
        AND (business_name ~* '\\m(import|importer|importers|import-export|import export|trading|traders|international trade|overseas|wholesale|distributor|export)\\M' OR industry ~* '\\m(import|importer|importers|trading|wholesale|distributor)\\M')
        AND business_name !~* '(hospice|apparel|logistics)'
    """,
    "Dehydrated Powders & Foods Importers": """
        (business_name ~* '\\m(dehydrated|dehydration|onion powder|garlic powder|vegetable powder|spray dried|dried food|food ingredients)\\M')
        AND (business_name ~* '\\m(import|importer|importers|import-export|trading|traders|wholesale|distributor|export)\\M' OR industry ~* '\\m(import|importer|importers|trading|wholesale)\\M')
    """,
    "Mushrooms Importers / Distributors": """
        (business_name ~* '\\m(mushroom|mushrooms|fungi|shiitake|cordyceps)\\M')
        AND (business_name ~* '\\m(import|importer|importers|import-export|trading|traders|distributor|wholesale|export)\\M' OR industry ~* '\\m(import|importer|importers|trading|wholesale)\\M')
    """,
    "Mattresses & Bedding Importers / Wholesalers": """
        (business_name ~* '\\m(mattress|mattresses|bedding|sleep product|foam)\\M')
        AND (business_name ~* '\\m(import|importer|importers|import-export|trading|traders|wholesale|distributor|export)\\M' OR industry ~* '\\m(import|importer|importers|trading|wholesale)\\M')
    """,
    "Total Pure Importers / International Trade in these 4 sectors": """
        (business_name ~* '\\m(spice|spices|masala|dehydrated|onion powder|garlic powder|mushroom|mushrooms|mattress|mattresses|bedding)\\M')
        AND (business_name ~* '\\m(import|importer|importers|import-export|import export|international trade|overseas)\\M' OR industry ~* '\\m(import & export|international trade|importers)\\M')
    """
}

print("=========================================================================")
print("                   IMPORTERS SEARCH IN DATABASE                          ")
print("=========================================================================")

for cat, where in importer_queries.items():
    cur.execute(f"SELECT count(*) FROM final.companies WHERE {where};")
    count = cur.fetchone()[0]
    
    cur.execute(f"SELECT business_name, industry, city, state, phone, emails, website FROM final.companies WHERE ({where}) AND (phone IS NOT NULL AND phone != '') LIMIT 4;")
    samples = cur.fetchall()
    
    print(f"\n📂 {cat}: {count:,} Companies")
    for s in samples:
        name, ind, city, st, ph, em, web = s
        loc = f"{city or ''}, {st or ''}".strip(", ") or "N/A"
        print(f"   • 🏢 {name} | Loc: {loc} | Phone: {ph or 'N/A'} | Email: {em or 'N/A'} | Web: {web or 'N/A'}")

# Also check people table for job titles containing "Importer", "Import Manager", "Head of Import", "Export Import"
cur.execute("""
    SELECT count(*) FROM final.people 
    WHERE (job_title ~* '\\m(import|importer|import manager|import coordinator|export import|import director|procurement manager|international trade)\\M')
      AND (job_title ~* '\\m(food|spice|agro|agriculture|produce|commodity|furniture|mattress)\\M' OR emails ~* '\\m(spice|masala|agro|food|trade|import)\\M');
""")
people_importers_count = cur.fetchone()[0]
print(f"\n👤 Direct Import Decision Makers & Buyers in Database: {people_importers_count:,} Contacts")

cur.execute("""
    SELECT full_name, job_title, city, state, emails, phones FROM final.people 
    WHERE (job_title ~* '\\m(import|importer|import manager|import coordinator|export import|import director|procurement manager|international trade)\\M')
      AND (job_title ~* '\\m(food|spice|agro|agriculture|produce|commodity|furniture|mattress)\\M' OR emails ~* '\\m(spice|masala|agro|food|trade|import)\\M')
    LIMIT 4;
""")
for p in cur.fetchall():
    print(f"   • 👤 {p[0]} ({p[1]}) | Loc: {p[2]}, {p[3]} | Email: {p[4]} | Phone: {p[5]}")

conn.close()
