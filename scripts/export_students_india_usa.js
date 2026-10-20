const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

const US_STATES = [
  'CA','NY','TX','FL','IL','PA','OH','GA','NC','MI',
  'NJ','VA','WA','AZ','MA','TN','IN','MO','MD','WI',
  'CO','MN','SC','AL','LA','KY','OR','OK','CT','UT',
  'IA','NV','AR','MS','KS','NM','NE','ID','WV','HI',
  'NH','ME','MT','RI','DE','SD','ND','AK','VT','WY','DC'
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('Querying USA and India student leads...');
    await client.query('SET statement_timeout = 120000');

    // Query 1: USA Students via indexed state
    console.log('Fetching USA student records...');
    const usaRes = await client.query(`
      SELECT 
        uuid,
        company_uuid,
        full_name,
        first_name,
        last_name,
        job_title,
        city,
        state,
        location,
        emails,
        phones,
        linked_url,
        'USA' as country
      FROM final.people
      WHERE state = ANY($1::text[])
        AND job_title ILIKE '%student%'
      LIMIT 1000
    `, [US_STATES]);

    console.log(`Found ${usaRes.rows.length} USA student records.`);

    // Combine records
    const allRecords = [...usaRes.rows];

    // Get company metadata
    const companyUuids = [...new Set(
      allRecords
        .map(r => r.company_uuid)
        .filter(id => id && id.trim().length > 0 && id !== '{}')
    )];

    console.log(`Fetching company details for ${companyUuids.length} companies...`);
    const companyMap = {};

    if (companyUuids.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < companyUuids.length; i += chunkSize) {
        const chunk = companyUuids.slice(i, i + chunkSize);
        const compRes = await client.query(`
          SELECT uuid, business_name, website, industry
          FROM final.companies
          WHERE uuid = ANY($1::uuid[])
        `, [chunk]);

        compRes.rows.forEach(c => {
          companyMap[c.uuid] = c;
        });
      }
    }

    const headers = [
      'Full Name',
      'Job Title',
      'Country',
      'Company / University / Organization',
      'Industry',
      'City',
      'State',
      'Location',
      'Primary Email',
      'All Emails',
      'Primary Phone',
      'All Phones',
      'LinkedIn Profile',
      'Website'
    ];

    const cleanArrayField = (raw) => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        const clean = raw.replace(/^\{|\}$/g, '').trim();
        if (!clean) return [];
        return clean.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      }
      return [];
    };

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    let csvContent = headers.map(h => escapeCsv(h)).join(',') + '\n';

    allRecords.forEach((row) => {
      const comp = companyMap[row.company_uuid] || {};
      const emailList = cleanArrayField(row.emails);
      const phoneList = cleanArrayField(row.phones);
      const primaryEmail = emailList.length > 0 ? emailList[0] : '';
      const primaryPhone = phoneList.length > 0 ? phoneList[0] : '';

      const line = [
        escapeCsv(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim()),
        escapeCsv(row.job_title || ''),
        escapeCsv(row.country || 'USA'),
        escapeCsv(comp.business_name || ''),
        escapeCsv(comp.industry || ''),
        escapeCsv(row.city || ''),
        escapeCsv(row.state || ''),
        escapeCsv(row.location || (row.city && row.state ? `${row.city}, ${row.state}` : '')),
        escapeCsv(primaryEmail),
        escapeCsv(emailList.join('; ')),
        escapeCsv(primaryPhone),
        escapeCsv(phoneList.join('; ')),
        escapeCsv(row.linked_url || ''),
        escapeCsv(comp.website || '')
      ].join(',');

      csvContent += line + '\n';
    });

    const outputPath = path.join(__dirname, '../students_leads_usa_india.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf8');
    console.log(`Successfully exported ${allRecords.length} student records to ${outputPath}`);

  } catch (err) {
    console.error('Error during export:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
