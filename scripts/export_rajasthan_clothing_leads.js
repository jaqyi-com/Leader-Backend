"use strict";

/**
 * scripts/export_rajasthan_clothing_leads.js
 * 
 * Exports verified Clothes & Apparel Businesses from Rajasthan with Valid Mobile Numbers.
 * Filters strictly for valid 10-digit Indian mobile numbers (starting with 6-9).
 * Generates ready-to-use CSV with WhatsApp direct chat links.
 */

require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const OUT_CSV = path.join("/Volumes/akshat/LeadGenerator", "Rajasthan_Clothes_Businesses_Valid_Mobiles.csv");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

/**
 * Strict Indian Mobile Number Extractor & Validator
 * Returns 10-digit normalized mobile string or null
 */
function extractValidIndianMobile(raw) {
  if (!raw) return null;
  const parts = String(raw).split(/[;,/|\n\\]+/);
  for (const part of parts) {
    const digits = part.replace(/\D/g, "");

    let mobile10 = null;
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      mobile10 = digits;
    } else if (digits.length === 12 && digits.startsWith("91") && /^[6-9]\d{9}$/.test(digits.substring(2))) {
      mobile10 = digits.substring(2);
    } else if (digits.length === 11 && digits.startsWith("0") && /^[6-9]\d{9}$/.test(digits.substring(1))) {
      mobile10 = digits.substring(1);
    }

    if (mobile10) {
      // Discard common dummy / repeating test patterns
      if (/^(\d)\1{9}$/.test(mobile10)) continue; // e.g. 9999999999
      if (mobile10 === "9876543210" || mobile10 === "9123456780") continue;
      return mobile10;
    }
  }
  return null;
}

function cleanCsvField(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val).trim();
  // Clean Postgres array braces if present
  if (str.startsWith("{") && str.endsWith("}")) {
    str = str.slice(1, -1).replace(/""/g, '"');
  }
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

async function main() {
  console.log("===============================================================================");
  console.log("🛍️ EXPORTING RAJASTHAN CLOTHING BUSINESSES WITH VALID MOBILE NUMBERS");
  console.log("===============================================================================");

  const client = await pool.connect();

  try {
    const query = `
      SELECT 
        uuid, 
        business_name, 
        industry, 
        phone, 
        phones, 
        emails, 
        website, 
        address, 
        city, 
        state, 
        pincode, 
        rating, 
        reviews
      FROM final.companies
      WHERE (
        state = 'Rajasthan' 
        OR city IN (
          'Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 
          'Bhilwara', 'Alwar', 'Sikar', 'Pali', 'Sri Ganganagar', 
          'Chittorgarh', 'Beawar', 'Kishangarh', 'Bharatpur', 'Hanumangarh', 
          'Banswara', 'Jhunjhunu', 'Dausa', 'Tonk', 'Sawai Madhopur', 'Nagaur', 
          'Churu', 'Barmer', 'Jaisalmer', 'Jalore', 'Sirohi', 'Pratapgarh', 'Dholpur'
        )
      )
      AND (
        industry ILIKE '%apparel%' 
        OR industry ILIKE '%garment%' 
        OR industry ILIKE '%cloth%' 
        OR industry ILIKE '%textile%'
        OR business_name ILIKE '%cloth%'
        OR business_name ILIKE '%garment%'
        OR business_name ILIKE '%textile%'
        OR business_name ILIKE '%apparel%'
        OR business_name ILIKE '%fabrics%'
        OR business_name ILIKE '%saree%'
        OR business_name ILIKE '%boutique%'
        OR business_name ILIKE '%fashion%'
      )
      ORDER BY city ASC, business_name ASC;
    `;

    console.log("Fetching matching records from final.companies...");
    const res = await client.query(query);
    console.log(`Fetched ${res.rows.length.toLocaleString()} candidate records.`);

    const leads = [];
    const cityCounts = {};
    const seenMobiles = new Set();

    for (const r of res.rows) {
      const mob = extractValidIndianMobile(r.phone) || extractValidIndianMobile(r.phones);
      if (!mob) continue;

      // Deduplicate by mobile number so each business contact is unique
      if (seenMobiles.has(mob)) continue;
      seenMobiles.add(mob);

      let cleanCity = (r.city || "").trim();
      if (!cleanCity || cleanCity.toUpperCase() === "RAJASTHAN") {
        cleanCity = "Rajasthan (Statewide)";
      } else if (cleanCity.includes("(") && cleanCity.includes(")")) {
        cleanCity = cleanCity.replace(/^[^(]*\(([^)]+)\)[^)]*$/, "$1").trim();
        cleanCity = cleanCity.charAt(0).toUpperCase() + cleanCity.slice(1).toLowerCase();
      }

      cityCounts[cleanCity] = (cityCounts[cleanCity] || 0) + 1;

      // Primary email clean up
      let email = "";
      if (r.emails) {
        const cleanEmails = String(r.emails).replace(/[{}"']/g, "").split(",");
        email = cleanEmails[0]?.trim() || "";
      }

      leads.push({
        business_name: r.business_name || "N/A",
        category: r.industry || "Clothes & Apparel",
        mobile_number: `+91 ${mob}`,
        raw_mobile: mob,
        whatsapp_link: `https://wa.me/91${mob}`,
        city: cleanCity,
        state: "Rajasthan",
        address: r.address || "",
        pincode: r.pincode || "",
        email: email,
        website: r.website || "",
        rating: r.rating || "",
        reviews: r.reviews || "",
      });
    }

    console.log(`\nFiltered down to ${leads.length.toLocaleString()} verified unique leads with VALID Indian mobile numbers.`);
    console.log("\nCity Distribution:");
    Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([city, count]) => {
        console.log(`  • ${city.padEnd(25)}: ${count}`);
      });

    // Write CSV
    const headers = [
      "Business Name",
      "Category / Industry",
      "Valid Mobile Number",
      "WhatsApp Direct Link",
      "City",
      "State",
      "Full Address",
      "Pincode",
      "Email Address",
      "Website",
      "Rating",
      "Reviews Count"
    ];

    const csvLines = [headers.map(h => `"${h}"`).join(",")];

    for (const l of leads) {
      csvLines.push([
        cleanCsvField(l.business_name),
        cleanCsvField(l.category),
        cleanCsvField(l.mobile_number),
        cleanCsvField(l.whatsapp_link),
        cleanCsvField(l.city),
        cleanCsvField(l.state),
        cleanCsvField(l.address),
        cleanCsvField(l.pincode),
        cleanCsvField(l.email),
        cleanCsvField(l.website),
        cleanCsvField(l.rating),
        cleanCsvField(l.reviews)
      ].join(","));
    }

    fs.writeFileSync(OUT_CSV, csvLines.join("\n"), "utf8");
    console.log(`\n✅ Successfully exported ${leads.length.toLocaleString()} leads to:\n   ${OUT_CSV}\n`);

  } catch (err) {
    console.error("❌ Error exporting leads:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
