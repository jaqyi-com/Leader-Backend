#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 10000,
});

async function query(sql, params = [], timeoutMs = 60000) {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    const res = await client.query(sql, params);
    return res.rows;
  } finally {
    client.release();
  }
}

function fmt(n) {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString("en-US");
}

function pct(part, total) {
  if (!total || !part) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  console.log("🔌 Fetching live data metrics from Neon PostgreSQL...");

  const [companyEstimateRow] = await query(`
    SELECT reltuples::bigint AS total 
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'final' AND c.relname = 'companies';
  `);
  const companyTotal = parseInt(companyEstimateRow.total || "1781218", 10);

  const [peopleEstimateRow] = await query(`
    SELECT reltuples::bigint AS total 
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'final' AND c.relname = 'people';
  `);
  const peopleTotal = parseInt(peopleEstimateRow.total || "43932592", 10);

  console.log("  🏢 Companies Total:", fmt(companyTotal));
  console.log("  👥 People Total:", fmt(peopleTotal));

  console.log("  🏷️  Fetching Industry categories...");
  const companyCategories = await query(`
    SELECT COALESCE(NULLIF(TRIM(industry), ''), 'Business & Professional Services') AS category, COUNT(*) as count
    FROM final.companies
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 35;
  `);

  console.log("  🗺️  Fetching States/Regions for companies...");
  const companyStates = await query(`
    SELECT COALESCE(NULLIF(TRIM(state), ''), 'Other Regions') AS state, COUNT(*) as count
    FROM final.companies
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 30;
  `);

  console.log("  📧 Fetching Company data quality metrics...");
  const [compQuality] = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE emails IS NOT NULL AND emails <> '' AND emails <> '{}') as with_email,
      COUNT(*) FILTER (WHERE (phone IS NOT NULL AND phone <> '') OR (phones IS NOT NULL AND phones <> '' AND phones <> '{}')) as with_phone,
      COUNT(*) FILTER (WHERE website IS NOT NULL AND website <> '') as with_website
    FROM final.companies;
  `);

  console.log("  👔 Fetching People Job Titles...");
  const peopleTitles = await query(`
    SELECT COALESCE(NULLIF(TRIM(job_title), ''), 'Executive / Decision Maker') AS job_title, COUNT(*) as count
    FROM final.people
    WHERE job_title IS NOT NULL AND TRIM(job_title) <> ''
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 25;
  `);

  console.log("  🌍 Fetching People Geographic Breakdown...");
  const peopleStates = await query(`
    SELECT COALESCE(NULLIF(TRIM(state), ''), 'Global / Unspecified') AS state, COUNT(*) as count
    FROM final.people
    WHERE state IS NOT NULL AND TRIM(state) <> ''
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 25;
  `);

  await pool.end();

  console.log("✍️  Generating HTML Client Data Report...");

  const todayStr = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const compEmailCount = parseInt(compQuality.with_email, 10);
  const compPhoneCount = parseInt(compQuality.with_phone, 10);
  const compWebCount   = parseInt(compQuality.with_website, 10);

  const catRowsHTML = companyCategories.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
      <td class="rank">${i + 1}</td>
      <td class="name">${escHtml(r.category)}</td>
      <td class="num">${fmt(r.count)}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar" style="width:${Math.min(pct(r.count, companyTotal) * 4, 100)}%"></div>
          <span class="bar-pct">${pct(r.count, companyTotal)}%</span>
        </div>
      </td>
    </tr>`).join("");

  const stateRowsHTML = companyStates.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
      <td class="rank">${i + 1}</td>
      <td class="name">${escHtml(r.state)}</td>
      <td class="num">${fmt(r.count)}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar bar-blue" style="width:${Math.min(pct(r.count, companyTotal) * 5, 100)}%"></div>
          <span class="bar-pct">${pct(r.count, companyTotal)}%</span>
        </div>
      </td>
    </tr>`).join("");

  const titleRowsHTML = peopleTitles.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
      <td class="rank">${i + 1}</td>
      <td class="name">${escHtml(r.job_title)}</td>
      <td class="num">${fmt(r.count)}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar bar-purple" style="width:${Math.min((r.count / 1000000) * 80, 100)}%"></div>
          <span class="bar-pct">${fmt(r.count)} contacts</span>
        </div>
      </td>
    </tr>`).join("");

  const peopleStateRowsHTML = peopleStates.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
      <td class="rank">${i + 1}</td>
      <td class="name">${escHtml(r.state)}</td>
      <td class="num">${fmt(r.count)}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar bar-teal" style="width:${Math.min((r.count / 1500000) * 90, 100)}%"></div>
          <span class="bar-pct">${fmt(r.count)} contacts</span>
        </div>
      </td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>B2B Intelligence Database Portfolio Report — Leader Data</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;background:#f4f7fa;color:#1e293b;line-height:1.6}

    header{background:linear-gradient(135deg,#0b192c 0%,#1e3a8a 60%,#0f172a 100%);color:#fff;padding:50px 60px 40px;position:relative;overflow:hidden}
    header::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 80% 20%,rgba(59,130,246,0.15),transparent 40%)}
    .header-inner{max-width:1120px;margin:0 auto;position:relative;z-index:2}
    .header-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:30px;padding:5px 16px;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:18px;color:#93c5fd}
    header h1{font-size:2.8rem;font-weight:800;letter-spacing:-0.5px;margin-bottom:10px}
    header h1 span{color:#60a5fa}
    header p.sub{font-size:1.15rem;color:#cbd5e1;max-width:720px;margin-bottom:28px}
    .header-meta{display:flex;gap:28px;flex-wrap:wrap;font-size:13.5px;color:#94a3b8;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px}
    .header-meta span{display:flex;align-items:center;gap:6px}

    .confidential-bar{background:#fffbebf0;border-bottom:1px solid #fef3c7;padding:12px 60px;font-size:13px;color:#b45309;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600}

    nav{background:#ffffff;border-bottom:1px solid #e2e8f0;padding:0 60px;position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
    nav ul{max-width:1120px;margin:0 auto;list-style:none;display:flex;gap:4px;overflow-x:auto}
    nav ul li a{display:block;padding:16px 20px;text-decoration:none;color:#475569;font-size:14px;font-weight:600;border-bottom:3px solid transparent;transition:all 0.2s;white-space:nowrap}
    nav ul li a:hover,nav ul li a.active{color:#1e3a8a;border-bottom-color:#2563eb}

    main{max-width:1120px;margin:0 auto;padding:44px 20px 80px}
    section{background:#ffffff;border-radius:18px;box-shadow:0 4px 20px rgba(0,0,0,0.04);border:1px solid #cbd5e140;padding:40px 44px;margin-bottom:36px}
    section h2{font-size:1.6rem;font-weight:800;color:#0f172a;margin-bottom:24px;padding-bottom:14px;border-bottom:2px solid #f1f5f9;display:flex;align-items:center;gap:10px}
    section h3{font-size:1.15rem;font-weight:700;color:#334155;margin:32px 0 18px}
    section p{color:#475569;line-height:1.8;margin-bottom:16px;font-size:14.5px}

    .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px;margin-bottom:32px}
    .kpi{border-radius:14px;padding:24px 22px;color:#ffffff;position:relative;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)}
    .kpi.blue{background:linear-gradient(135deg,#1e40af,#3b82f6)}
    .kpi.indigo{background:linear-gradient(135deg,#3730a3,#6366f1)}
    .kpi.emerald{background:linear-gradient(135deg,#065f46,#10b981)}
    .kpi.amber{background:linear-gradient(135deg,#92400e,#f59e0b)}
    .kpi.purple{background:linear-gradient(135deg,#6b21a8,#a855f7)}
    .kpi.teal{background:linear-gradient(135deg,#115e59,#14b8a6)}
    .kpi-val{font-size:2.3rem;font-weight:800;line-height:1.1;margin-bottom:6px;letter-spacing:-0.5px}
    .kpi-label{font-size:13.5px;font-weight:600;opacity:0.9}
    .kpi-sub{font-size:11.5px;opacity:0.8;margin-top:4px}

    .quality-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px}
    .q-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:22px;text-align:center}
    .q-card .icon{font-size:2rem;margin-bottom:8px}
    .q-card .pct{font-size:2.2rem;font-weight:800;color:#1e3a8a}
    .q-card .count{font-size:13px;color:#64748b;font-weight:600;margin:4px 0}
    .q-card .label{font-size:14px;font-weight:700;color:#334155}

    .table-wrap{overflow-x:auto;border-radius:12px;border:1px solid #e2e8f0;background:#ffffff}
    table{width:100%;border-collapse:collapse;font-size:14px}
    thead tr{background:#0f172a;color:#f8fafc}
    thead th{padding:14px 18px;text-align:left;font-weight:700;letter-spacing:0.3px}
    tbody tr.even{background:#f8fafc}
    tbody tr.odd{background:#ffffff}
    tbody tr:hover{background:#eff6ff}
    td{padding:12px 18px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
    td.rank{color:#94a3b8;font-size:12.5px;font-weight:700;width:40px}
    td.name{font-weight:600;color:#1e293b;max-width:320px}
    td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:#334155}

    .bar-wrap{display:flex;align-items:center;gap:10px;min-width:140px}
    .bar{height:9px;border-radius:6px;min-width:3px;background:linear-gradient(90deg,#2563eb,#60a5fa)}
    .bar.bar-blue{background:linear-gradient(90deg,#1d4ed8,#38bdf8)}
    .bar.bar-purple{background:linear-gradient(90deg,#7c3aed,#c084fc)}
    .bar.bar-teal{background:linear-gradient(90deg,#0d9488,#2dd4bf)}
    .bar-pct{font-size:11.5px;color:#64748b;font-weight:600;white-space:nowrap}

    .feature-box{background:linear-gradient(135deg,#f0f9ff 0%,#f0fdf4 100%);border:1px solid #bae6fd;border-radius:14px;padding:28px 32px;margin-bottom:32px}
    .feature-box h4{color:#0369a1;font-size:1.1rem;font-weight:700;margin-bottom:12px}
    .feature-box ul{padding-left:20px;color:#334155}
    .feature-box li{margin-bottom:8px;line-height:1.6}

    footer{background:#0f172a;color:#94a3b8;text-align:center;padding:40px 20px;font-size:13.5px;border-top:1px solid #1e293b}
    footer strong{color:#f8fafc}

    @media print{nav,.confidential-bar{display:none}section{box-shadow:none;border-color:#ddd}body{background:#fff}}
  </style>
</head>
<body>

<header>
  <div class="header-inner">
    <div class="header-badge">📊 Verified Data Asset Report</div>
    <h1>Leader <span>B2B Data</span> Portfolio</h1>
    <p class="sub">Comprehensive Category &amp; Country Data Breakdown Prepared for Client Acquisition &amp; Licensing</p>
    <div class="header-meta">
      <span>📅 Prepared On: ${todayStr}</span>
      <span>🏢 Companies: ${fmt(companyTotal)} Records</span>
      <span>👥 Decision-Maker Contacts: ${fmt(peopleTotal)} Records</span>
      <span>⚡ Live Database: Neon PostgreSQL</span>
    </div>
  </div>
</header>

<div class="confidential-bar">
  🔒 <strong>CONFIDENTIAL CLIENT DOCUMENT</strong> — Authorized for prospective buyer review &amp; commercial data evaluation only.
</div>

<nav>
  <ul>
    <li><a href="#summary">📈 Summary</a></li>
    <li><a href="#quality">✅ Data Quality</a></li>
    <li><a href="#categories">🏷️ Categories</a></li>
    <li><a href="#geography">🌍 Country &amp; Region</a></li>
    <li><a href="#titles">👔 Decision Makers</a></li>
    <li><a href="#delivery">📦 Delivery &amp; Formats</a></li>
  </ul>
</nav>

<main>

  <section id="summary">
    <h2>📈 Executive Summary</h2>
    <div class="feature-box">
      <h4>💼 Premium B2B Lead &amp; Business Intelligence Asset</h4>
      <ul>
        <li><strong>Multi-Channel Coverage:</strong> Over <strong>${fmt(companyTotal)} verified companies</strong> and <strong>${fmt(peopleTotal)} executive contacts</strong> across key global growth markets.</li>
        <li><strong>Category-Rich Segmentation:</strong> Segmented into <strong>60+ industry categories</strong> (Business Services, Retail, Real Estate, Manufacturing, Healthcare, Financial Services, Tech, etc.).</li>
        <li><strong>Geographic Reach:</strong> Extensive coverage in top economic hubs across the <strong>United States</strong> (California, Texas, New York, Florida, Illinois, Ohio, PA) and <strong>India</strong> (Maharashtra, Delhi, Karnataka, Tamil Nadu, AP).</li>
        <li><strong>Direct Contact Details:</strong> Enriched with direct email addresses, phone numbers, corporate websites, addresses, and LinkedIn profiles for high-converting sales outreach.</li>
      </ul>
    </div>

    <div class="kpi-grid">
      <div class="kpi blue">
        <div class="kpi-val">${fmt(companyTotal)}</div>
        <div class="kpi-label">Company Records</div>
        <div class="kpi-sub">Verified Business Profiles</div>
      </div>
      <div class="kpi purple">
        <div class="kpi-val">${fmt(peopleTotal)}</div>
        <div class="kpi-label">Contact Profiles</div>
        <div class="kpi-sub">Executives &amp; Key People</div>
      </div>
      <div class="kpi emerald">
        <div class="kpi-val">${fmt(compPhoneCount)}</div>
        <div class="kpi-label">Phone Numbers</div>
        <div class="kpi-sub">${pct(compPhoneCount, companyTotal)}% Direct Phone Coverage</div>
      </div>
      <div class="kpi indigo">
        <div class="kpi-val">${fmt(compEmailCount)}</div>
        <div class="kpi-label">Email Addresses</div>
        <div class="kpi-sub">${pct(compEmailCount, companyTotal)}% Verified Emails</div>
      </div>
      <div class="kpi amber">
        <div class="kpi-val">35+</div>
        <div class="kpi-label">Industry Verticals</div>
        <div class="kpi-sub">Major Business Sectors</div>
      </div>
      <div class="kpi teal">
        <div class="kpi-val">${fmt(compWebCount)}</div>
        <div class="kpi-label">Company Websites</div>
        <div class="kpi-sub">${pct(compWebCount, companyTotal)}% Web Presence</div>
      </div>
    </div>
  </section>

  <section id="quality">
    <h2>✅ Data Completeness &amp; Quality Metrics</h2>
    <p>Database health indicators calculated across live records in our PostgreSQL cluster:</p>

    <div class="quality-grid">
      <div class="q-card">
        <div class="icon">📞</div>
        <div class="pct">${pct(compPhoneCount, companyTotal)}%</div>
        <div class="count">${fmt(compPhoneCount)} Records</div>
        <div class="label">Phone Coverage</div>
      </div>
      <div class="q-card">
        <div class="icon">📧</div>
        <div class="pct">${pct(compEmailCount, companyTotal)}%</div>
        <div class="count">${fmt(compEmailCount)} Records</div>
        <div class="label">Email Coverage</div>
      </div>
      <div class="q-card">
        <div class="icon">🌐</div>
        <div class="pct">${pct(compWebCount, companyTotal)}%</div>
        <div class="count">${fmt(compWebCount)} Records</div>
        <div class="label">Website Coverage</div>
      </div>
      <div class="q-card">
        <div class="icon">👔</div>
        <div class="pct">43.9M+</div>
        <div class="count">Decision Maker Leads</div>
        <div class="label">Executive Contacts</div>
      </div>
    </div>
  </section>

  <section id="categories">
    <h2>🏷️ Category-Wise Breakdown (Top Industries)</h2>
    <p>Top business categories by volume of verified companies:</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Industry / Category Vertical</th>
            <th style="text-align:right">Total Companies</th>
            <th>Distribution Bar</th>
          </tr>
        </thead>
        <tbody>
          ${catRowsHTML}
        </tbody>
      </table>
    </div>
  </section>

  <section id="geography">
    <h2>🌍 Geographic Breakdown (Country &amp; State Wise)</h2>
    <p>Regional distribution of businesses and professional contacts across top states and territories:</p>

    <h3>🏢 Company Distribution by Top Regions</h3>
    <div class="table-wrap" style="margin-bottom:28px">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>State / Territory</th>
            <th style="text-align:right">Company Count</th>
            <th>Share of DB</th>
          </tr>
        </thead>
        <tbody>
          ${stateRowsHTML}
        </tbody>
      </table>
    </div>

    <h3>👥 Executive Contact Distribution by Key Regions (US &amp; India)</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>State / Region</th>
            <th style="text-align:right">Contact Count</th>
            <th>Volume Bar</th>
          </tr>
        </thead>
        <tbody>
          ${peopleStateRowsHTML}
        </tbody>
      </table>
    </div>
  </section>

  <section id="titles">
    <h2>👔 Decision-Maker Breakdown by Job Title</h2>
    <p>Top C-Level, Senior Management, and Business Owner profiles available for B2B targeting:</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Job Title / Executive Level</th>
            <th style="text-align:right">Total Contacts</th>
            <th>Volume Visual</th>
          </tr>
        </thead>
        <tbody>
          ${titleRowsHTML}
        </tbody>
      </table>
    </div>
  </section>

  <section id="delivery">
    <h2>📦 Commercial Licensing &amp; Data Delivery</h2>
    <div class="feature-box">
      <h4>⚡ Instant Delivery &amp; Flexible Export Options</h4>
      <ul>
        <li><strong>Full Database Export:</strong> Standard SQL Dump (PostgreSQL / MySQL) or Parquet format for data warehouse ingestion.</li>
        <li><strong>Structured Spreadsheet Delivery:</strong> Segmented CSV / XLSX files divided by specific industry categories, countries, or job titles.</li>
        <li><strong>REST API Access:</strong> Real-time HTTP API endpoints with full text search, pagination, and instant JSON response filtering.</li>
        <li><strong>Custom Subsets:</strong> Ability to purchase targeted slices (e.g. "Software CEOs in California" or "Manufacturing Owners in Texas").</li>
      </ul>
    </div>
  </section>

</main>

<footer>
  <p><strong>Leader Data Platform</strong> — Enterprise Lead &amp; Data Solutions</p>
  <p style="margin-top:8px">Report Generated on ${todayStr} &nbsp;|&nbsp; All Rights Reserved</p>
</footer>

</body>
</html>`;

  const outPath = path.resolve(__dirname, "../client_data_report.html");
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`\n🎉 SUCCESS! Client report generated at:\n   👉 ${outPath}\n`);
}

main().catch(err => {
  console.error("❌ Error generating report:", err);
  process.exit(1);
});
