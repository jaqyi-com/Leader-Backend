import os
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
    print("🚀 Querying City & State Breakdown for India & USA across categories...\n")

    # Indian Cities Breakdown by Category
    cur.execute(r"""
        SELECT 
            category,
            COALESCE(NULLIF(TRIM(city), ''), 'Other / Unspecified') AS clean_city,
            COALESCE(NULLIF(TRIM(state), ''), 'India') AS clean_state,
            COUNT(*) AS cnt
        FROM (
            SELECT 
                city, state, phone,
                CASE 
                    WHEN industry ~* '\m(Garment|Clothing|Apparel|Boutique|Textile Retail|Fashion Retail|Wear)\M' OR business_name ~* '\m(Garment|Clothing|Apparel|Boutique|Fashion|Wear)\M' THEN 'Garments & Retailers'
                    WHEN industry ~* '\m(Hotel|Resort|Motel|Inn|Lodging|Hospitality)\M' OR business_name ~* '\m(Hotel|Resort|Motel|Inn|Lodge)\M' THEN 'Hotels & Lodging'
                    WHEN industry ~* '\m(Cafe|Coffee|Bakery|Bistro)\M' OR business_name ~* '\m(Cafe|Coffee|Bakery|Bistro|Espresso)\M' THEN 'Cafes & Coffee Shops'
                    WHEN industry ~* '\m(Restaurant|Dining|Diner|Eatery|Food Service|Fast Food|Pizzeria|Bar & Grill)\M' OR business_name ~* '\m(Restaurant|Diner|Eatery|Grill|Kitchen|Pizza)\M' THEN 'Restaurants & Eateries'
                    ELSE 'Other'
                END AS category
            FROM final.companies
            WHERE (
                state ~* '\m(ANDHRA|KARNATAKA|MAHARASHTRA|TAMIL|TELANGANA|DELHI|HARYANA|GUJARAT|UP|WEST BENGAL|PUNJAB|RAJASTHAN|KERALA|MADHYA PRADESH|ODISHA|BIHAR)\M'
                OR city IN ('Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Gurgaon', 'Gurugram', 'Noida', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat', 'Indore', 'Kochi', 'Coimbatore', 'Chandigarh', 'Ludhiana', 'Agra', 'Kanpur', 'Varanasi', 'Tirupur')
                OR phone LIKE '+91%' OR phone LIKE '91%'
            )
            AND phone NOT LIKE '+1%'
        ) sub
        WHERE category != 'Other'
        GROUP BY category, clean_city, clean_state
        ORDER BY category, cnt DESC;
    """)
    india_rows = cur.fetchall()

    # USA Cities Breakdown by Category
    cur.execute(r"""
        SELECT 
            category,
            COALESCE(NULLIF(TRIM(city), ''), 'Other / Unspecified') AS clean_city,
            COALESCE(NULLIF(TRIM(state), ''), 'USA') AS clean_state,
            COUNT(*) AS cnt
        FROM (
            SELECT 
                city, state, phone,
                CASE 
                    WHEN industry ~* '\m(Garment|Clothing|Apparel|Boutique|Textile Retail|Fashion Retail|Wear)\M' OR business_name ~* '\m(Garment|Clothing|Apparel|Boutique|Fashion|Wear)\M' THEN 'Garments & Retailers'
                    WHEN industry ~* '\m(Hotel|Resort|Motel|Inn|Lodging|Hospitality)\M' OR business_name ~* '\m(Hotel|Resort|Motel|Inn|Lodge)\M' THEN 'Hotels & Lodging'
                    WHEN industry ~* '\m(Cafe|Coffee|Bakery|Bistro)\M' OR business_name ~* '\m(Cafe|Coffee|Bakery|Bistro|Espresso)\M' THEN 'Cafes & Coffee Shops'
                    WHEN industry ~* '\m(Restaurant|Dining|Diner|Eatery|Food Service|Fast Food|Pizzeria|Bar & Grill)\M' OR business_name ~* '\m(Restaurant|Diner|Eatery|Grill|Kitchen|Pizza)\M' THEN 'Restaurants & Eateries'
                    ELSE 'Other'
                END AS category
            FROM final.companies
            WHERE (
                state ~* '\m(CA|TX|NY|FL|IL|PA|OH|GA|NC|MI|NJ|VA|WA|AZ|MA|TN|IN|MO|MD|WI|CO|MN|SC|AL|LA|KY|OR|OK|CT|UT|IA|NV|AR|MS|KS|NM|NE|ID|WV|HI|NH|ME|MT|RI|DE|SD|ND|AK|DC|VT|WY)\M'
                OR phone LIKE '+1%'
            )
            AND phone NOT LIKE '+91%'
        ) sub
        WHERE category != 'Other'
        GROUP BY category, clean_city, clean_state
        ORDER BY category, cnt DESC;
    """)
    usa_rows = cur.fetchall()

    conn.close()

    print("=== INDIA TOP CITIES PER CATEGORY ===")
    from collections import defaultdict
    india_by_cat = defaultdict(list)
    for cat, city, state, cnt in india_rows:
        india_by_cat[cat].append((city, state, cnt))

    for cat, items in india_by_cat.items():
        print(f"\n📍 🇮🇳 {cat} (Total in India: {sum(x[2] for x in items):,}):")
        for city, state, cnt in items[:8]:
            print(f"   • {city}, {state}: {cnt:,}")

    print("\n=== USA TOP CITIES PER CATEGORY ===")
    usa_by_cat = defaultdict(list)
    for cat, city, state, cnt in usa_rows:
        usa_by_cat[cat].append((city, state, cnt))

    for cat, items in usa_by_cat.items():
        print(f"\n📍 🇺🇸 {cat} (Total in USA: {sum(x[2] for x in items):,}):")
        for city, state, cnt in items[:8]:
            print(f"   • {city}, {state}: {cnt:,}")

if __name__ == "__main__":
    main()
