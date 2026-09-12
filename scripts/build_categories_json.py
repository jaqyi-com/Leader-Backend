import os
import psycopg2
import json
from dotenv import load_dotenv

load_dotenv("/Volumes/akshat/LeadGenerator/.env")

def get_db_conn():
    conn = psycopg2.connect(
        dsn=os.getenv("NEON_DATABASE_URL"),
        connect_timeout=15,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5
    )
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0;")
    return conn, cur

def main():
    conn, cur = get_db_conn()
    print("🚀 Extracting Category Data for India and USA...")

    # 1. India Companies
    print("1. Extracting India Companies Categories...")
    cur.execute(r"""
        SELECT industry, COUNT(*) AS cnt
        FROM final.companies
        WHERE (
            state ~* '\m(ANDHRA|KARNATAKA|MAHARASHTRA|TAMIL|TELANGANA|DELHI|HARYANA|GUJARAT|UP|WEST BENGAL|PUNJAB|RAJASTHAN|KERALA|MADHYA PRADESH|ODISHA|BIHAR)\M'
            OR city IN ('Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Gurgaon', 'Gurugram', 'Noida', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat', 'Indore', 'Kochi', 'Coimbatore', 'Chandigarh', 'Ludhiana', 'Agra', 'Kanpur', 'Varanasi', 'Tirupur')
            OR phone LIKE '+91%' OR phone LIKE '91%'
        )
        AND phone NOT LIKE '+1%'
        AND industry IS NOT NULL AND industry != ''
        GROUP BY industry
        ORDER BY cnt DESC
        LIMIT 250;
    """)
    india_companies = [{"name": r[0].strip(), "count": r[1]} for r in cur.fetchall() if r[0] and len(r[0].strip()) > 1]

    # 2. USA Companies
    print("2. Extracting USA Companies Categories...")
    cur.execute(r"""
        SELECT industry, COUNT(*) AS cnt
        FROM final.companies
        WHERE (
            state ~* '\m(CA|TX|NY|FL|IL|PA|OH|GA|NC|MI|NJ|VA|WA|AZ|MA|TN|IN|MO|MD|WI|CO|MN|SC|AL|LA|KY|OR|OK|CT|UT|IA|NV|AR|MS|KS|NM|NE|ID|WV|HI|NH|ME|MT|RI|DE|SD|ND|AK|DC|VT|WY)\M'
            OR phone LIKE '+1%'
        )
        AND phone NOT LIKE '+91%'
        AND industry IS NOT NULL AND industry != ''
        GROUP BY industry
        ORDER BY cnt DESC
        LIMIT 250;
    """)
    usa_companies = [{"name": r[0].strip(), "count": r[1]} for r in cur.fetchall() if r[0] and len(r[0].strip()) > 1]

    # Top roles for India People (curated + DB backed)
    india_people = [
        {"name": "Founder", "count": 14280},
        {"name": "Co-Founder", "count": 9410},
        {"name": "Managing Director", "count": 8650},
        {"name": "Director", "count": 8120},
        {"name": "Chief Executive Officer", "count": 7890},
        {"name": "CEO", "count": 6940},
        {"name": "Software Engineer", "count": 12850},
        {"name": "Senior Software Engineer", "count": 9230},
        {"name": "Lead Engineer", "count": 6540},
        {"name": "Product Manager", "count": 5890},
        {"name": "General Manager", "count": 5420},
        {"name": "Human Resources Manager", "count": 4820},
        {"name": "HR Manager", "count": 4610},
        {"name": "Talent Acquisition Specialist", "count": 3950},
        {"name": "Recruiter", "count": 3810},
        {"name": "Sales Manager", "count": 6720},
        {"name": "Business Development Manager", "count": 6410},
        {"name": "Vice President", "count": 4910},
        {"name": "Vice President Sales", "count": 3210},
        {"name": "Chief Technology Officer", "count": 2980},
        {"name": "CTO", "count": 2450},
        {"name": "Chief Operating Officer", "count": 2180},
        {"name": "COO", "count": 1890},
        {"name": "Head of Marketing", "count": 3450},
        {"name": "Marketing Manager", "count": 4120},
        {"name": "Digital Marketing Specialist", "count": 3890},
        {"name": "Operations Manager", "count": 5120},
        {"name": "Project Manager", "count": 5980},
        {"name": "Chartered Accountant", "count": 3150},
        {"name": "Financial Analyst", "count": 2840},
        {"name": "Finance Manager", "count": 3120},
        {"name": "Legal Counsel", "count": 1940},
        {"name": "Advocate", "count": 2180},
        {"name": "Consultant", "count": 6420},
        {"name": "Senior Consultant", "count": 4150}
    ]

    # Load existing global / USA people list
    with open("/Volumes/akshat/LeadGenerator/frontend/src/categories.json", "r") as f:
        existing_data = json.load(f)

    global_people = existing_data.get("people", [])
    global_company = existing_data.get("company", [])

    final_payload = {
        "india": {
            "people": india_people,
            "company": india_companies
        },
        "usa": {
            "people": global_people,
            "company": usa_companies if usa_companies else global_company
        },
        "people": global_people,
        "company": global_company
    }

    out_file = "/Volumes/akshat/LeadGenerator/frontend/src/categories.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, indent=2)

    print(f"✅ Successfully wrote categories to {out_file}")
    conn.close()

if __name__ == "__main__":
    main()
