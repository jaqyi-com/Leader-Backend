"use strict";
require("dotenv").config();
const app = require("../src/server");
const categoriesData = require("../frontend/src/categories.json");

function print(msg) {
  process.stdout.write(msg + "\n");
}

async function auditAllJsonCategories() {
  const server = app.listen(0, async () => {
    const port = server.address().port;
    print(`Audit test server running on port ${port}...`);

    const loginRes = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test_verifier_1790922839896@jaqyi.com", password: "TestPassword123!" })
    });
    const { token } = await loginRes.json();

    const sections = [
      { country: "india", mode: "company", endpoint: "/api/final-companies", param: "f_industry" },
      { country: "usa",    mode: "company", endpoint: "/api/final-companies", param: "f_industry" },
      { country: "india", mode: "people",  endpoint: "/api/final-people",    param: "f_job_title" },
      { country: "usa",    mode: "people",  endpoint: "/api/final-people",    param: "f_job_title" }
    ];

    const zeroResults = [];
    const successList = [];

    for (const sec of sections) {
      const list = categoriesData[sec.country] && categoriesData[sec.country][sec.mode]
        ? categoriesData[sec.country][sec.mode]
        : [];

      print(`\n=================================================`);
      print(`AUDITING ${sec.country.toUpperCase()} - ${sec.mode.toUpperCase()} (${list.length} categories)`);
      print(`=================================================`);

      const BATCH_SIZE = 5;
      for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch = list.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (item) => {
          const catName = item.name;
          const enc = encodeURIComponent(catName);
          const url = `http://localhost:${port}${sec.endpoint}?${sec.param}=${enc}&f_country=${sec.country}`;
          try {
            const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
            const data = await res.json();
            return { catName, count: data.total || 0 };
          } catch (err) {
            return { catName, count: 0, error: err.message };
          }
        }));

        for (const r of results) {
          if (r.count === 0) {
            zeroResults.push({ country: sec.country, mode: sec.mode, name: r.catName });
            print(`❌ Zero: [${sec.country} | ${sec.mode}] "${r.catName}"`);
          } else {
            successList.push({ country: sec.country, mode: sec.mode, name: r.catName, count: r.count });
            print(`✅ [${sec.country} | ${sec.mode}] "${r.catName}" -> ${r.count.toLocaleString()} records`);
          }
        }
      }
    }

    print(`\n=================================================`);
    print(`AUDIT SUMMARY:`);
    print(`Total Categories Tested: ${successList.length + zeroResults.length}`);
    print(`Total Passed (>0 records): ${successList.length}`);
    print(`Total Zero Results: ${zeroResults.length}`);
    if (zeroResults.length > 0) {
      print("Zero Result Categories:\n" + JSON.stringify(zeroResults, null, 2));
    }
    print(`=================================================`);

    server.close();
    process.exit(0);
  });
}

auditAllJsonCategories();
