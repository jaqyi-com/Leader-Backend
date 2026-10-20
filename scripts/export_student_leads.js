const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log('Querying student records from final.people (limit 300)...');
    await client.query('SET statement_timeout = 300000');

    // Step 1: Query people
    const peopleRes = await client.query(`
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
        linked_url
      FROM final.people
      WHERE job_title ILIKE '%student%'
      LIMIT 300
    `);

    console.log(`Fetched ${peopleRes.rows.length} student records.`);

    // Step 2: Fetch company metadata for matched company_uuids
    const companyUuids = [...new Set(
      peopleRes.rows
        .map(r => r.company_uuid)
        .filter(id => id && id.trim().length > 0 && id !== '{}')
    )];

    console.log(`Fetching metadata for ${companyUuids.length} linked companies...`);
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

    peopleRes.rows.forEach((row) => {
      const comp = companyMap[row.company_uuid] || {};
      const emailList = cleanArrayField(row.emails);
      const phoneList = cleanArrayField(row.phones);
      const primaryEmail = emailList.length > 0 ? emailList[0] : '';
      const primaryPhone = phoneList.length > 0 ? phoneList[0] : '';

      const line = [
        escapeCsv(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim()),
        escapeCsv(row.job_title || ''),
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

    const outputPath = path.join(__dirname, '../students_leads.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf8');
    console.log(`Successfully saved ${peopleRes.rows.length} student records to ${outputPath}`);

  } catch (err) {
    console.error('Error during student leads export:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
