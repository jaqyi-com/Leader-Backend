const { Pool } = require("pg");
require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const CATEGORIES = [
  { name: "1. FMCG / Food & Beverage", filter: "(industry ILIKE '%fmcg%' OR industry ILIKE '%food%' OR industry ILIKE '%beverage%' OR business_name ILIKE '%fmcg%' OR business_name ILIKE '%food%' OR business_name ILIKE '%beverage%')" },
  { name: "2. Restaurants & Cafes", filter: "(industry ILIKE '%restaurant%' OR industry ILIKE '%cafe%' OR business_name ILIKE '%restaurant%' OR business_name ILIKE '%cafe%' OR business_name ILIKE '%bakery%')" },
  { name: "3. Fitness / Wellness", filter: "(industry ILIKE '%fitness%' OR industry ILIKE '%wellness%' OR industry ILIKE '%gym%' OR business_name ILIKE '%fitness%' OR business_name ILIKE '%wellness%' OR business_name ILIKE '%spa%')" },
  { name: "4. Real Estate", filter: "(industry ILIKE '%real estate%' OR industry ILIKE '%property%' OR business_name ILIKE '%real estate%' OR business_name ILIKE '%realty%' OR business_name ILIKE '%properties%')" },
  { name: "5. Automobile / Dealerships", filter: "(industry ILIKE '%auto%' OR industry ILIKE '%automotive%' OR industry ILIKE '%dealership%' OR business_name ILIKE '%motors%' OR business_name ILIKE '%auto%')" },
  { name: "6. Education / EdTech", filter: "(industry ILIKE '%education%' OR industry ILIKE '%school%' OR industry ILIKE '%college%' OR industry ILIKE '%university%' OR business_name ILIKE '%academy%' OR business_name ILIKE '%institute%')" },
  { name: "7. Financial Services / Insurance", filter: "(industry ILIKE '%finance%' OR industry ILIKE '%financial%' OR industry ILIKE '%insurance%' OR industry ILIKE '%banking%' OR business_name ILIKE '%capital%' OR business_name ILIKE '%financial%')" },
  { name: "8. Retail / D2C / Consumer Brands", filter: "(industry ILIKE '%retail%' OR industry ILIKE '%consumer goods%' OR industry ILIKE '%e-commerce%' OR industry ILIKE '%ecommerce%' OR business_name ILIKE '%retail%' OR business_name ILIKE '%store%')" },
  { name: "9. Hospitality", filter: "(industry ILIKE '%hospitality%' OR industry ILIKE '%hotel%' OR industry ILIKE '%resort%' OR business_name ILIKE '%hotel%' OR business_name ILIKE '%resort%' OR business_name ILIKE '%inn%')" },
  { name: "10. Fashion / Lifestyle", filter: "(industry ILIKE '%fashion%' OR industry ILIKE '%apparel%' OR industry ILIKE '%clothing%' OR industry ILIKE '%lifestyle%' OR business_name ILIKE '%fashion%' OR business_name ILIKE '%apparel%')" },
  { name: "11. Technology / Startups", filter: "(industry ILIKE '%tech%' OR industry ILIKE '%software%' OR industry ILIKE '%information technology%' OR industry ILIKE '%internet%' OR business_name ILIKE '%technologies%' OR business_name ILIKE '%software%')" },
  { name: "12. Travel & Recreation", filter: "(industry ILIKE '%travel%' OR industry ILIKE '%tourism%' OR industry ILIKE '%recreation%' OR business_name ILIKE '%travel%' OR business_name ILIKE '%tours%')" }
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 300000;");
    console.log("⚡ Calculating exact company counts for 12 target categories...\n");

    const results = [];

    for (const cat of CATEGORIES) {
      try {
        const res = await client.query(`
          SELECT COUNT(*) as company_count 
          FROM final.companies 
          WHERE ${cat.filter};
        `);
        const count = Number(res.rows[0].company_count);
        results.push({ category: cat.name, count });
        console.log(`✅ ${cat.name.padEnd(35)} : ${count.toLocaleString()} companies`);
      } catch (err) {
        console.warn(`⚠️ Failed ${cat.name}: ${err.message}`);
        results.push({ category: cat.name, count: "N/A" });
      }
    }

    console.log("\n=== FINAL 12 CATEGORY COUNTS SUMMARY ===");
    console.table(results);

  } catch(e) {
    console.error("Fatal error:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
