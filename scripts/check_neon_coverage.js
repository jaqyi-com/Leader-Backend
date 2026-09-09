require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

// ── Config ────────────────────────────────────────────────────
const NEON_URL = process.env.NEON_DATABASE_URL;
const BATCH_SIZE = 500; // query DB in chunks of 500

const CSV_FILES = [
  { file: 'Doott_SaaS_USA_Outreach_Prospects.csv',         companyCol: 'Company Name',                    firstNameCol: 'First Name' },
  { file: 'Doott_SaaS_Outbound_Founders_USA.csv',          companyCol: 'Estimated Company / Domain',       firstNameCol: null },
  { file: 'Doott_SaaS_USA_WhatsApp_Active_Leads.csv',      companyCol: 'Company',                         firstNameCol: null },
  { file: 'Doott_SaaS_Outbound_Founders_India.csv',        companyCol: 'Estimated Company / Domain',       firstNameCol: null },
  { file: 'Doott_SaaS_WhatsApp_Active_Founders_India.csv', companyCol: 'Company',                         firstNameCol: null },
];

function normalize(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function extractFirstName(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

// Query DB in batches using LOWER() matching
async function checkBatchInDB(pool, table, column, values) {
  if (values.length === 0) return new Set();
  const found = new Set();
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const chunk = values.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
    const res = await pool.query(
      `SELECT LOWER(REGEXP_REPLACE(${column}, '[^a-zA-Z0-9]', '', 'g')) AS val
       FROM final.${table}
       WHERE LOWER(REGEXP_REPLACE(${column}, '[^a-zA-Z0-9]', '', 'g')) = ANY(ARRAY[${placeholders}])`,
      chunk.map(v => normalize(v))
    );
    res.rows.forEach(r => found.add(r.val));
  }
  return found;
}

async function run() {
  const pool = new Pool({ connectionString: NEON_URL });
  console.log('\n🔌 Connected to Neon DB');

  // ── Step 1: Parse all CSVs and collect unique names ──────────
  const allCompanyNames  = new Set();
  const allFirstNames    = new Set();
  const fileData = [];

  for (const cfg of CSV_FILES) {
    if (!fs.existsSync(cfg.file)) {
      console.log(`⚠️  Skipping missing file: ${cfg.file}`);
      fileData.push({ ...cfg, rows: [] });
      continue;
    }
    const raw = fs.readFileSync(cfg.file, 'utf8');
    let rows;
    try {
      rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
    } catch (e) {
      console.log(`⚠️  Could not parse ${cfg.file}: ${e.message}`);
      rows = [];
    }

    rows.forEach(row => {
      const comp = (row[cfg.companyCol] || '').trim();
      if (comp) allCompanyNames.add(comp);

      let fn = '';
      if (cfg.firstNameCol && row[cfg.firstNameCol]) {
        fn = row[cfg.firstNameCol].trim();
      } else if (row['Full Name']) {
        fn = extractFirstName(row['Full Name']);
      }
      if (fn) allFirstNames.add(fn);
    });

    fileData.push({ ...cfg, rows });
    console.log(`📄 Loaded ${rows.length} rows from ${cfg.file}`);
  }

  const uniqueCompanies = [...allCompanyNames];
  const uniqueFirstNames = [...allFirstNames];

  console.log(`\n📊 Unique companies to check: ${uniqueCompanies.length}`);
  console.log(`📊 Unique first names to check: ${uniqueFirstNames.length}`);

  // ── Step 2: Query Neon DB in batches ────────────────────────
  console.log('\n🔍 Checking companies in DB (batches of 500)...');
  const foundCompanies = await checkBatchInDB(pool, 'companies', 'business_name', uniqueCompanies);

  console.log('🔍 Checking first names in DB (batches of 500)...');
  const foundFirstNames = await checkBatchInDB(pool, 'people', 'first_name', uniqueFirstNames);

  await pool.end();

  // ── Step 3: Generate Per-File Report ────────────────────────
  const globalReport = [];
  let totalCompaniesChecked = 0, totalCompaniesMissing = 0;
  let totalPeopleChecked = 0, totalPeopleMissing = 0;
  const allMissingCompanies = [];
  const allMissingPeople = [];

  for (const cfg of fileData) {
    let fileCompsChecked = 0, fileCompsMissing = 0;
    let filePeopleChecked = 0, filePeopleMissing = 0;
    const fileMissingCompanies = [];
    const fileMissingPeople = [];

    for (const row of cfg.rows) {
      const comp = (row[cfg.companyCol] || '').trim();
      if (comp) {
        fileCompsChecked++;
        if (!foundCompanies.has(normalize(comp))) {
          fileCompsMissing++;
          fileMissingCompanies.push(comp);
        }
      }

      let fn = '';
      if (cfg.firstNameCol && row[cfg.firstNameCol]) {
        fn = row[cfg.firstNameCol].trim();
      } else if (row['Full Name']) {
        fn = extractFirstName(row['Full Name']);
      }
      if (fn) {
        filePeopleChecked++;
        if (!foundFirstNames.has(normalize(fn))) {
          filePeopleMissing++;
          fileMissingPeople.push(row['Full Name'] || fn);
        }
      }
    }

    totalCompaniesChecked += fileCompsChecked;
    totalCompaniesMissing += fileCompsMissing;
    totalPeopleChecked    += filePeopleChecked;
    totalPeopleMissing    += filePeopleMissing;
    allMissingCompanies.push(...fileMissingCompanies.slice(0, 15));
    allMissingPeople.push(...fileMissingPeople.slice(0, 15));

    globalReport.push({
      file: cfg.file,
      companiesChecked: fileCompsChecked,
      companiesMissing: fileCompsMissing,
      companiesMissingPct: fileCompsChecked > 0 ? ((fileCompsMissing / fileCompsChecked) * 100).toFixed(1) : '0.0',
      peopleChecked: filePeopleChecked,
      peopleMissing: filePeopleMissing,
      peopleMissingPct: filePeopleChecked > 0 ? ((filePeopleMissing / filePeopleChecked) * 100).toFixed(1) : '0.0',
    });
  }

  // ── Step 4: Print Report ─────────────────────────────────────
  const LINE = '═'.repeat(78);
  const DASH = '─'.repeat(78);
  console.log(`\n${LINE}`);
  console.log('  DOOTT — NEON DB COVERAGE REPORT');
  console.log(`${LINE}`);

  for (const r of globalReport) {
    console.log(`\n📄  ${r.file}`);
    console.log(`    Companies : ${String(r.companiesChecked).padStart(5)} checked  →  ❌ ${String(r.companiesMissing).padStart(5)} missing  (${r.companiesMissingPct}% not in DB)`);
    console.log(`    People    : ${String(r.peopleChecked).padStart(5)} checked  →  ❌ ${String(r.peopleMissing).padStart(5)} missing  (${r.peopleMissingPct}% not in DB)`);
  }

  const compCovPct = totalCompaniesChecked > 0
    ? (((totalCompaniesChecked - totalCompaniesMissing) / totalCompaniesChecked) * 100).toFixed(1) : '0.0';
  const peopleCovPct = totalPeopleChecked > 0
    ? (((totalPeopleChecked - totalPeopleMissing) / totalPeopleChecked) * 100).toFixed(1) : '0.0';

  console.log(`\n${DASH}`);
  console.log('  TOTALS ACROSS ALL FILES');
  console.log(DASH);
  console.log(`  Companies : ${totalCompaniesChecked} checked   →  ❌ ${totalCompaniesMissing} missing   ✅ ${compCovPct}% covered by DB`);
  console.log(`  People    : ${totalPeopleChecked} checked   →  ❌ ${totalPeopleMissing} missing   ✅ ${peopleCovPct}% covered by DB`);
  console.log(DASH);

  console.log('\n🔍 Sample Companies NOT in DB (up to 25):');
  [...new Set(allMissingCompanies)].slice(0, 25).forEach((c, i) => console.log(`   ${String(i+1).padStart(2)}. ${c}`));

  console.log('\n🔍 Sample People NOT in DB (up to 25):');
  [...new Set(allMissingPeople)].slice(0, 25).forEach((p, i) => console.log(`   ${String(i+1).padStart(2)}. ${p}`));

  // ── Step 5: Save JSON ────────────────────────────────────────
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCompaniesChecked, totalCompaniesMissing, companyDbCoveragePct: compCovPct,
      totalPeopleChecked, totalPeopleMissing, peopleDbCoveragePct: peopleCovPct,
    },
    byFile: globalReport,
  };
  fs.writeFileSync('neon_coverage_report.json', JSON.stringify(report, null, 2));
  console.log(`\n💾 Full report saved → neon_coverage_report.json`);
  console.log(`${LINE}\n`);
}

run().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
