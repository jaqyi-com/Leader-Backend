const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const cleanArrayField = (raw) => {
  if (!raw) return '';
  if (Array.isArray(raw)) return raw.join('; ');
  if (typeof raw === 'string') {
    const clean = raw.replace(/^\{|\}$/g, '').trim();
    if (!clean) return '';
    return clean.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean).join('; ');
  }
  return '';
};

const escapeCsv = (str) => {
  if (str === null || str === undefined) return '""';
  const s = String(str).replace(/"/g, '""');
  return `"${s}"`;
};

async function exportAllData() {
  const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000
  });

  const client = await pool.connect();
  console.log('Connected to Neon PostgreSQL.');
  await client.query('SET statement_timeout = 900000'); // 15 mins

  const outputPath = path.join(__dirname, '../USA_Manufacturing_Auto_Electronics_Plastics_Companies.csv');
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });

  const headers = [
    'Company / Business Name',
    'Industry Sector',
    'Sub-Industry / Category',
    'Website',
    'Domain',
    'Address',
    'City',
    'State',
    'Postal Code',
    'Direct Phone',
    'All Phones',
    'Emails',
    'Google Rating',
    'Review Count'
  ];

  writeStream.write(headers.map(escapeCsv).join(',') + '\n');
  console.log('Querying and streaming all 119,423 manufacturing companies...');

  const query = `
    SELECT 
      business_name,
      CASE 
        WHEN industry ILIKE '%auto%' OR industry ILIKE '%automotive%' THEN 'Automotive & Auto Parts'
        WHEN industry ILIKE '%electric%' OR industry ILIKE '%electronic%' THEN 'Electrical & Electronics'
        WHEN industry ILIKE '%plastic%' OR industry ILIKE '%rubber%' THEN 'Plastics & Rubber'
        ELSE 'General Manufacturing / Industrial'
      END AS industry_sector,
      industry,
      website,
      domain,
      address,
      city,
      state,
      pincode,
      phone,
      phones,
      emails,
      rating,
      reviews
    FROM final.companies
    WHERE (
      industry ILIKE '%auto%' 
      OR industry ILIKE '%automotive%' 
      OR industry ILIKE '%electric%' 
      OR industry ILIKE '%electronic%' 
      OR industry ILIKE '%plastic%' 
      OR industry ILIKE '%rubber%'
      OR industry ILIKE '%manufacturing%'
    )
  `;

  const res = await client.query(query);
  console.log(`Fetched ${res.rows.length} rows from database. Writing to CSV...`);

  for (let i = 0; i < res.rows.length; i++) {
    const row = res.rows[i];
    const line = [
      escapeCsv(row.business_name || ''),
      escapeCsv(row.industry_sector || ''),
      escapeCsv(row.industry || ''),
      escapeCsv(row.website || ''),
      escapeCsv(row.domain || ''),
      escapeCsv(row.address || ''),
      escapeCsv(row.city || ''),
      escapeCsv(row.state || ''),
      escapeCsv(row.pincode || ''),
      escapeCsv(row.phone || ''),
      escapeCsv(cleanArrayField(row.phones)),
      escapeCsv(cleanArrayField(row.emails)),
      escapeCsv(row.rating || ''),
      escapeCsv(row.reviews || '')
    ].join(',');

    writeStream.write(line + '\n');

    if ((i + 1) % 25000 === 0) {
      console.log(`Progress: written ${i + 1} / ${res.rows.length} companies...`);
    }
  }

  writeStream.end();
  console.log(`COMPLETE: Successfully exported ${res.rows.length} companies to ${outputPath}`);

  client.release();
  await pool.end();
}

exportAllData().catch(err => {
  console.error('Export error:', err);
  process.exit(1);
});
