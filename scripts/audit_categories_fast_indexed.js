"use strict";
require("dotenv").config();
const app = require("../src/server");

const categoriesToTest = [
  "FMCG / Food & Beverage",
  "Restaurants & Cafes",
  "Fitness / Wellness",
  "Real Estate & Construction",
  "Automobile / Dealerships",
  "Education / EdTech",
  "Financial Services / Insurance",
  "Retail / D2C / Consumer Brands",
  "Hospitality & Hotels",
  "Fashion / Lifestyle",
  "Technology / Startups",
  "Travel & Recreation",
  "Hospitals",
  "Garments & Apparel"
];

async function testApiCategories() {
  const server = app.listen(0, async () => {
    const port = server.address().port;
    console.log(`Test API running on port ${port}...`);

    const loginRes = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test_verifier_1790922839896@jaqyi.com", password: "TestPassword123!" })
    });
    const { token } = await loginRes.json();

    console.log("\n=================================================");
    console.log("TESTING API RESPONSE FOR ALL COMPOSITE CATEGORIES");
    console.log("=================================================");

    let failures = 0;
    for (const cat of categoriesToTest) {
      const enc = encodeURIComponent(cat);
      const res = await fetch(`http://localhost:${port}/api/final-companies?f_industry=${enc}&f_country=india`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      const count = data.total || 0;
      if (count === 0) {
        failures++;
        console.log(`❌ "${cat}" -> ZERO RECORDS!`);
      } else {
        console.log(`✅ "${cat}" -> ${count.toLocaleString()} total records found`);
      }
    }

    console.log("\n=================================================");
    console.log(`TOTAL API TEST FAILURES: ${failures}`);
    console.log("=================================================");

    server.close();
    process.exit(0);
  });
}

testApiCategories();
