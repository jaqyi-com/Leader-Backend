import os
import sys
import psycopg2
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
    print("🚀 Starting fast single-pass count for Decision Makers & Cyber Security / Compliance Leads...\n", flush=True)

    # 1. Companies breakdown by target industry (Fast query)
    print("📊 1. Querying Industry Sectors in Companies Table...", flush=True)
    cur.execute("""
        SELECT 
            COUNT(*) AS total_companies,
            COUNT(CASE WHEN industry ~* '\\m(IT|Software|SaaS|Technology|Information Technology|Computer|Internet|Cyber|Cloud)\\M' THEN 1 END) AS it_tech,
            COUNT(CASE WHEN industry ~* '\\m(Healthcare|Hospital|Medical|Pharma|Pharmaceutical|Clinic|Health|Biotech)\\M' THEN 1 END) AS healthcare,
            COUNT(CASE WHEN industry ~* '\\m(Manufacturing|Industrial|Engineering|Factory|Automotive|Textile|Machinery|Chemical)\\M' THEN 1 END) AS manufacturing,
            COUNT(CASE WHEN industry ~* '\\m(Education|EdTech|College|University|School|Academy|Institute|Training)\\M' THEN 1 END) AS education,
            COUNT(CASE WHEN industry ~* '\\m(E-Commerce|Ecommerce|Retail|Online Shopping|Consumer|Apparel|Store)\\M' THEN 1 END) AS ecommerce,
            COUNT(CASE WHEN industry ~* '\\m(Finance|Financial|Banking|FinTech|Insurance|Investment|Accounting)\\M' THEN 1 END) AS finance
        FROM final.companies;
    """)
    comp_row = cur.fetchone()
    total_companies, it_tech, healthcare, manufacturing, education, ecommerce, finance = comp_row

    print(f"   🏢 Total Companies: {total_companies:,}")
    print(f"      • IT / Software / SaaS / Tech: {it_tech:,}")
    print(f"      • Healthcare & Hospitals & Pharma (HIPAA target): {healthcare:,}")
    print(f"      • Manufacturing & Industrial (ISO 9001/27001 target): {manufacturing:,}")
    print(f"      • Education / EdTech / Colleges / Schools: {education:,}")
    print(f"      • E-Commerce & Retail (DPDPA / GDPR / VAPT target): {ecommerce:,}")
    print(f"      • Financial Services & FinTech (SOC 2 / ISO target): {finance:,}\n", flush=True)

    # 2. Decision Makers breakdown in final.people (Single pass aggregation)
    print("👥 2. Aggregating Decision Makers in final.people (Single-Pass Execution)...", flush=True)
    cur.execute("""
        SELECT 
            COUNT(CASE WHEN has_email AND is_decision_maker THEN 1 END) AS total_dm_with_email,
            COUNT(CASE WHEN has_email AND is_ceo THEN 1 END) AS total_ceo,
            COUNT(CASE WHEN has_email AND is_tech_lead THEN 1 END) AS total_tech_lead,
            COUNT(CASE WHEN has_email AND is_director THEN 1 END) AS total_director,
            COUNT(CASE WHEN has_email AND is_vp_head THEN 1 END) AS total_vp_head,
            COUNT(CASE WHEN has_email AND is_decision_maker AND is_india THEN 1 END) AS india_dm_email,
            COUNT(CASE WHEN has_email AND is_decision_maker AND is_usa THEN 1 END) AS usa_dm_email,
            COUNT(CASE WHEN has_email AND is_decision_maker AND has_phone THEN 1 END) AS dm_email_and_phone,
            COUNT(CASE WHEN is_decision_maker AND has_linkedin THEN 1 END) AS dm_linkedin
        FROM (
            SELECT 
                (emails IS NOT NULL AND emails != '' AND emails != '{}') AS has_email,
                (phones IS NOT NULL AND phones != '' AND phones != '{}') AS has_phone,
                (linked_url IS NOT NULL AND linked_url != '' AND linked_url != '{}') AS has_linkedin,
                (
                    job_title ~* '\\m(CEO|Chief Executive Officer|Founder|Co-Founder|Owner|Proprietor|Managing Director|President)\\M'
                ) AS is_ceo,
                (
                    job_title ~* '\\m(CTO|Chief Technology Officer|CIO|Chief Information Officer|CISO|Chief Information Security Officer|Chief Security Officer)\\M'
                ) AS is_tech_lead,
                (
                    job_title ~* '\\m(Director|Executive Director|IT Director|Technical Director)\\M'
                    AND job_title !~* '\\m(CEO|CTO|CIO|CISO|Founder)\\M'
                ) AS is_director,
                (
                    job_title ~* '\\m(Vice President|VP|Head of IT|Head of Technology|Head of Engineering|Head of Security|Head of Operations|General Manager)\\M'
                    AND job_title !~* '\\m(CEO|CTO|CIO|CISO|Founder|Director)\\M'
                ) AS is_vp_head,
                (
                    job_title ~* '\\m(CEO|Chief Executive Officer|Founder|Co-Founder|Owner|Proprietor|Managing Director|President|CTO|Chief Technology Officer|CIO|Chief Information Officer|CISO|Director|Vice President|VP|Head of IT|Head of Technology|Head of Engineering|Head of Security|General Manager)\\M'
                ) AS is_decision_maker,
                (
                    (
                        location ILIKE '%India%' 
                        OR city IN ('Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Gurgaon', 'Gurugram', 'Noida', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Indore', 'Kochi', 'Coimbatore', 'Chandigarh', 'Faridabad', 'Ghaziabad', 'Navi Mumbai')
                        OR state IN ('ANDHRA PRADESH', 'KARNATAKA', 'MAHARASHTRA', 'TAMIL NADU', 'TELANGANA', 'DELHI', 'HARYANA', 'UTTAR PRADESH', 'GUJARAT', 'WEST BENGAL')
                        OR phones LIKE '+91%' OR phones LIKE '91%'
                        OR emails ILIKE '%.in' OR emails ILIKE '%.co.in'
                    )
                    AND (phones NOT LIKE '+1%' AND location NOT ILIKE '%United States%' AND location NOT ILIKE '%, US%')
                ) AS is_india,
                (
                    (
                        location ILIKE '%United States%' OR location ILIKE '%, US%'
                        OR state IN ('CA','TX','NY','FL','IL','PA','OH','GA','NC','MI','NJ','VA','WA','AZ','MA','TN','IN','MO','MD','WI','CO','MN','SC','AL','LA','KY','OR','OK','CT','UT','IA','NV','AR','MS','KS','NM','NE','ID','WV','HI','NH','ME','MT','RI','DE','SD','ND','AK','DC','VT','WY')
                        OR phones LIKE '+1%'
                    )
                    AND location NOT ILIKE '%India%' AND phones NOT LIKE '+91%'
                ) AS is_usa
            FROM final.people
        ) sub;
    """)
    p_row = cur.fetchone()
    (total_dm_email, total_ceo, total_tech_lead, total_director, 
     total_vp_head, india_dm_email, usa_dm_email, dm_email_and_phone, dm_linkedin) = p_row

    print("\n🎯 DECISION MAKER LEAD COUNTS IN DATABASE:")
    print("=" * 60)
    print(f"Total Decision Makers with Email:          {total_dm_email:,}")
    print(f" • CEOs, Founders, Owners & MDs:           {total_ceo:,}")
    print(f" • CTOs, CIOs, CISOs & Tech Leadership:    {total_tech_lead:,}")
    print(f" • Directors & Executive Directors:         {total_director:,}")
    print(f" • VPs & Heads of IT / Tech / Security:    {total_vp_head:,}")
    print("-" * 60)
    print(f"🌍 Geographic Breakdown:")
    print(f" • India Decision Makers with Email:       {india_dm_email:,}")
    print(f" • USA Decision Makers with Email:         {usa_dm_email:,}")
    print(f" • Other / Global Decision Makers:         {(total_dm_email - india_dm_email - usa_dm_email):,}")
    print("-" * 60)
    print(f"📞 Contact Enrichment:")
    print(f" • Direct Email + Phone (Both Available):  {dm_email_and_phone:,}")
    print(f" • Decision Makers with LinkedIn Profile:  {dm_linkedin:,}")
    print("=" * 60)

    conn.close()

if __name__ == "__main__":
    main()
