"use strict";
require("dotenv").config();
const { query } = require("../src/db/cloudSql");

const testCompanyCategories = [
  "FMCG / Food & Beverage", "Food", "Beverage", "FMCG",
  "Restaurants & Cafes", "Restaurants", "Cafes", "Dining", "Bakery",
  "Fitness / Wellness", "Fitness", "Wellness", "Gym",
  "Real Estate & Construction", "Real Estate", "Construction", "Property",
  "Automobile / Dealerships", "Automobile", "Automotive", "Auto",
  "Education / EdTech", "Education", "EdTech", "School", "University",
  "Financial Services / Insurance", "Financial Services", "Finance", "Financial", "Insurance", "Banking",
  "Retail / D2C / Consumer Brands", "Retail", "Consumer", "D2C", "E-commerce",
  "Hospitality & Hotels", "Hospitality", "Hotels", "Hotel", "Resort",
  "Fashion / Lifestyle", "Fashion", "Lifestyle", "Garments", "Apparel",
  "Technology / Startups", "Technology", "Software", "Startups", "IT",
  "Travel & Recreation", "Travel", "Recreation", "Tour",
  "Hospitals", "Hospital", "Healthcare", "Medical", "Pharmacy",
  "Manufacturing", "Channel Sales", "Business Services", "Computers & Electronics", "Media & Entertainment"
];

const testPeopleRoles = [
  "Founder", "Co-Founder", "CEO", "Chief Executive Officer",
  "Managing Director", "Director", "President",
  "Software Engineer", "Lead Engineer", "Product Manager", "CTO",
  "Sales Manager", "Business Development Manager", "VP Sales",
  "HR Manager", "Human Resources Manager", "Recruiter",
  "Marketing Manager", "Digital Marketing", "Head of Marketing",
  "Chartered Accountant", "Finance Manager", "Financial Analyst",
  "General Manager", "Operations Manager", "Advocate"
];

const INDUSTRY_ALIASES = {
  "hospitals": ["Hospital", "Healthcare", "Health", "Medical", "Clinic", "Doctor", "Pharmacy"],
  "hospital": ["Hospital", "Healthcare", "Health", "Medical", "Clinic", "Doctor", "Pharmacy"],
  "healthcare": ["Healthcare", "Health", "Hospital", "Medical", "Clinic", "Pharmacy"],
  "fmcg": ["FMCG", "Food", "Beverage", "Packaged", "Consumer Goods", "Dairy"],
  "fmcg / food & beverage": ["FMCG", "Food", "Beverage", "Packaged", "Consumer Goods", "Dairy"],
  "food & beverage": ["Food", "Beverage", "FMCG", "Dairy", "Consumer Goods"],
  "restaurants & cafes": ["Restaurant", "Cafe", "Dining", "Caterers", "Food", "Bakery"],
  "restaurants": ["Restaurant", "Cafe", "Dining", "Caterers", "Food", "Bakery"],
  "restaurant": ["Restaurant", "Cafe", "Dining", "Caterers", "Food", "Bakery"],
  "fitness / wellness": ["Fitness", "Gym", "Wellness", "Spa", "Health"],
  "fitness": ["Fitness", "Gym", "Wellness", "Spa", "Health"],
  "wellness": ["Wellness", "Fitness", "Gym", "Spa", "Health Care"],
  "real estate & construction": ["Real Estate", "Property", "Construction", "Architect", "Builder"],
  "real estate": ["Real Estate", "Property", "Construction", "Architect", "Builder"],
  "automobile / dealerships": ["Automobile", "Automotive", "Auto", "Vehicle", "Dealership"],
  "automobile": ["Automobile", "Automotive", "Auto", "Vehicle", "Dealership"],
  "education / edtech": ["Education", "School", "University", "College", "EdTech", "Academic"],
  "education": ["Education", "School", "University", "College", "EdTech", "Academic"],
  "financial services / insurance": ["Financial", "Finance", "Banking", "Insurance", "Investment", "Accounting"],
  "financial services": ["Financial", "Finance", "Banking", "Insurance", "Investment", "Accounting"],
  "finance": ["Financial", "Finance", "Banking", "Insurance", "Investment", "Accounting"],
  "financial": ["Financial", "Finance", "Banking", "Insurance", "Investment", "Accounting"],
  "retail / d2c / consumer brands": ["Retail", "Store", "Apparel", "Garments", "E-commerce", "Consumer"],
  "retail": ["Retail", "Store", "Apparel", "Garments", "E-commerce", "Consumer"],
  "hospitality & hotels": ["Hospitality", "Hotel", "Resort", "Lodging", "Travel"],
  "hospitality": ["Hospitality", "Hotel", "Resort", "Lodging", "Travel"],
  "hotels": ["Hotel", "Hospitality", "Resort", "Lodging"],
  "fashion / lifestyle": ["Fashion", "Apparel", "Garments", "Clothing", "Textile"],
  "fashion": ["Fashion", "Apparel", "Garments", "Clothing", "Textile"],
  "technology / startups": ["Software", "Technology", "Tech", "Internet", "Computers", "IT"],
  "technology": ["Software", "Technology", "Tech", "Internet", "Computers", "IT"],
  "software": ["Software", "Technology", "Tech", "Internet", "Computers", "IT"],
  "travel & recreation": ["Travel", "Recreation", "Leisure", "Tour", "Aviation"],
  "travel": ["Travel", "Recreation", "Leisure", "Tour", "Aviation"],
};

function print(msg) {
  process.stdout.write(msg + "\n");
}

async function runAudit() {
  print("=================================================");
  print("AUDITING ALL COMPANY CATEGORIES");
  print("=================================================");

  let compFailures = 0;
  for (const cat of testCompanyCategories) {
    const valLower = cat.toLowerCase().trim();
    let aliases = INDUSTRY_ALIASES[valLower];
    if (!aliases && /[\/&,\+]+/.test(valLower)) {
      const parts = valLower.split(/[\/&,\+]+/).map(p => p.trim()).filter(Boolean);
      const collected = new Set();
      for (const p of parts) {
        if (INDUSTRY_ALIASES[p]) INDUSTRY_ALIASES[p].forEach(a => collected.add(a));
        else if (p.length > 2) collected.add(p);
      }
      if (collected.size > 0) aliases = Array.from(collected);
    }
    if (!aliases || aliases.length === 0) aliases = [cat];

    const whereTerms = aliases.map((_, i) => `"industry" ILIKE $${i + 1}`).join(" OR ");
    const params = aliases.map(a => `%${a}%`);

    const sqlInd = `SELECT count(*) FROM "final"."companies" WHERE (${whereTerms}) AND ("geo_source" != 'us_zip' OR "pincode" ~ '^[1-9][0-9]{5}$' OR "city" IN ('Mumbai', 'Bengaluru', 'Delhi', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Ahmedabad', 'Surat', 'Jaipur', 'Lucknow', 'Indore', 'Vadodara', 'Noida', 'Gurgaon', 'Gurugram', 'Chandigarh'))`;
    const resInd = await query(sqlInd, params);
    const cntInd = parseInt(resInd.rows[0].count, 10);

    const sqlUsa = `SELECT count(*) FROM "final"."companies" WHERE (${whereTerms}) AND ("geo_source" = 'us_zip')`;
    const resUsa = await query(sqlUsa, params);
    const cntUsa = parseInt(resUsa.rows[0].count, 10);

    if (cntInd === 0 && cntUsa === 0) {
      compFailures++;
      print(`❌ "${cat}" -> ZERO in both India & USA`);
    } else {
      print(`✅ "${cat}" -> India: ${cntInd.toLocaleString()} | USA: ${cntUsa.toLocaleString()}`);
    }
  }

  print("\n=================================================");
  print("AUDITING ALL PEOPLE ROLES");
  print("=================================================");

  let peopleFailures = 0;
  for (const role of testPeopleRoles) {
    const sql = `SELECT count(*) FROM "final"."people" WHERE "job_title" ILIKE $1`;
    const res = await query(sql, [`%${role}%`]);
    const cnt = parseInt(res.rows[0].count, 10);

    if (cnt === 0) {
      peopleFailures++;
      print(`❌ "${role}" -> Count: 0`);
    } else {
      print(`✅ "${role}" -> Count: ${cnt.toLocaleString()}`);
    }
  }

  print("\n=================================================");
  print(`FINAL AUDIT RESULT: Company Failures: ${compFailures} | People Failures: ${peopleFailures}`);
  print("=================================================");

  process.exit(0);
}

runAudit();
