const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const CLIENT1_DIR = path.join(__dirname, "../client1");

if (!fs.existsSync(CLIENT1_DIR)) {
  fs.mkdirSync(CLIENT1_DIR, { recursive: true });
}

const CATEGORIES = [
  {
    fileName: "1_FMCG_Food_and_Beverage.csv",
    name: "1. FMCG / Food & Beverage",
    filter: "(industry ILIKE '%fmcg%' OR industry ILIKE '%food%' OR industry ILIKE '%beverage%' OR business_name ILIKE '%fmcg%' OR business_name ILIKE '%food%' OR business_name ILIKE '%beverage%')"
  },
  {
    fileName: "2_Restaurants_and_Cafes.csv",
    name: "2. Restaurants & Cafes",
    filter: "(industry ILIKE '%restaurant%' OR industry ILIKE '%cafe%' OR business_name ILIKE '%restaurant%' OR business_name ILIKE '%cafe%' OR business_name ILIKE '%bakery%')"
  },
  {
    fileName: "3_Fitness_and_Wellness.csv",
    name: "3. Fitness / Wellness",
    filter: "(industry ILIKE '%fitness%' OR industry ILIKE '%wellness%' OR industry ILIKE '%gym%' OR business_name ILIKE '%fitness%' OR business_name ILIKE '%wellness%' OR business_name ILIKE '%spa%')"
  },
  {
    fileName: "4_Real_Estate.csv",
    name: "4. Real Estate",
    filter: "(industry ILIKE '%real estate%' OR industry ILIKE '%property%' OR business_name ILIKE '%real estate%' OR business_name ILIKE '%realty%' OR business_name ILIKE '%properties%')"
  },
  {
    fileName: "5_Automobile_and_Dealerships.csv",
    name: "5. Automobile / Dealerships",
    filter: "(industry ILIKE '%auto%' OR industry ILIKE '%automotive%' OR industry ILIKE '%dealership%' OR business_name ILIKE '%motors%' OR business_name ILIKE '%auto%')"
  },
  {
    fileName: "6_Education_and_EdTech.csv",
    name: "6. Education / EdTech",
    filter: "(industry ILIKE '%education%' OR industry ILIKE '%school%' OR industry ILIKE '%college%' OR industry ILIKE '%university%' OR business_name ILIKE '%academy%' OR business_name ILIKE '%institute%')"
  },
  {
    fileName: "7_Financial_Services_and_Insurance.csv",
    name: "7. Financial Services / Insurance",
    filter: "(industry ILIKE '%finance%' OR industry ILIKE '%financial%' OR industry ILIKE '%insurance%' OR industry ILIKE '%banking%' OR business_name ILIKE '%capital%' OR business_name ILIKE '%financial%')"
  },
  {
    fileName: "8_Retail_D2C_and_Consumer_Brands.csv",
    name: "8. Retail / D2C / Consumer Brands",
    filter: "(industry ILIKE '%retail%' OR industry ILIKE '%consumer goods%' OR industry ILIKE '%e-commerce%' OR industry ILIKE '%ecommerce%' OR business_name ILIKE '%retail%' OR business_name ILIKE '%store%')"
  },
  {
    fileName: "9_Hospitality.csv",
    name: "9. Hospitality",
    filter: "(industry ILIKE '%hospitality%' OR industry ILIKE '%hotel%' OR industry ILIKE '%resort%' OR business_name ILIKE '%hotel%' OR business_name ILIKE '%resort%' OR business_name ILIKE '%inn%')"
  },
  {
    fileName: "10_Fashion_and_Lifestyle.csv",
    name: "10. Fashion / Lifestyle",
    filter: "(industry ILIKE '%fashion%' OR industry ILIKE '%apparel%' OR industry ILIKE '%clothing%' OR industry ILIKE '%lifestyle%' OR business_name ILIKE '%fashion%' OR business_name ILIKE '%apparel%')"
  },
  {
    fileName: "11_Technology_and_Startups.csv",
    name: "11. Technology / Startups",
    filter: "(industry ILIKE '%tech%' OR industry ILIKE '%software%' OR industry ILIKE '%information technology%' OR industry ILIKE '%internet%' OR business_name ILIKE '%technologies%' OR business_name ILIKE '%software%')"
  },
  {
    fileName: "12_Travel_and_Recreation.csv",
    name: "12. Travel & Recreation",
    filter: "(industry ILIKE '%travel%' OR industry ILIKE '%tourism%' OR industry ILIKE '%recreation%' OR business_name ILIKE '%travel%' OR business_name ILIKE '%tours%')"
  }
];

const cleanArray = (raw) => {
  if (!raw) return '';
  if (Array.isArray(raw)) return raw.join('; ');
  if (typeof raw === 'string') return raw.replace(/^\{|\}$/g, '').replace(/"/g, '').trim();
  return String(raw);
};

const escapeCsv = (str) => {
  if (str === null || str === undefined) return '""';
  const clean = cleanArray(str);
  return `"${clean.replace(/"/g, '""')}"`;
};

async function exportCategory(client, cat) {
  console.log(`\n🚀 Exporting [${cat.name}]...`);
  
  const res = await client.query(`
    SELECT 
      business_name,
      industry,
      website,
      domain,
      address,
      city,
      state,
      pincode,
      phone,
      emails,
      phones,
      is_email_valid,
      email_status
    FROM final.companies 
    WHERE ${cat.filter}
    LIMIT 2500;
  `);

  const headers = [
    "Company Name",
    "Industry",
    "Website",
    "Domain",
    "Address",
    "City",
    "State",
    "Pincode",
    "Phone",
    "Emails",
    "Phones",
    "Email Status"
  ];

  // Excel UTF-8 BOM prefix
  let csvContent = "\uFEFF" + headers.map(h => `"${h}"`).join(",") + "\n";

  res.rows.forEach(r => {
    const status = r.email_status ? r.email_status : (r.is_email_valid === true ? 'deliverable' : (r.is_email_valid === false ? 'undeliverable' : 'unverified'));
    csvContent += [
      escapeCsv(r.business_name),
      escapeCsv(r.industry),
      escapeCsv(r.website),
      escapeCsv(r.domain),
      escapeCsv(r.address),
      escapeCsv(r.city),
      escapeCsv(r.state),
      escapeCsv(r.pincode),
      escapeCsv(r.phone),
      escapeCsv(r.emails),
      escapeCsv(r.phones),
      escapeCsv(status)
    ].join(",") + "\n";
  });

  const outPath = path.join(CLIENT1_DIR, cat.fileName);
  fs.writeFileSync(outPath, csvContent, 'utf8');
  console.log(`✅ Exported ${res.rows.length} records to client1/${cat.fileName}`);
  return res.rows.length;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 300000;");
    console.log("=================================================================");
    console.log("📁 EXPORTING ALL 12 CATEGORIES INTO FOLDER: client1/");
    console.log("=================================================================");

    let totalExported = 0;
    for (const cat of CATEGORIES) {
      const count = await exportCategory(client, cat);
      totalExported += count;
    }

    console.log("\n=================================================================");
    console.log(`🎉 ALL 12 CATEGORY CSV FILES SUCCESSFULLY EXPORTED TO:`);
    console.log(`👉 ${CLIENT1_DIR}`);
    console.log(`📊 Total Records Exported: ${totalExported.toLocaleString()}`);
    console.log("=================================================================\n");

  } catch(err) {
    console.error("❌ Export Error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
