const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log('Querying Ahmedabad Student & Test Prep Leads (Optimized)...');
    await client.query('SET statement_timeout = 300000');

    // Step 1: Get Ahmedabad companies first (fast on companies table)
    const compRes = await client.query(`
      SELECT uuid, business_name, industry
      FROM final.companies
      WHERE LOWER(city) = 'ahmedabad'
    `);
    
    console.log(`Found ${compRes.rows.length} companies registered in Ahmedabad.`);
    const compMap = {};
    const compUuids = compRes.rows.map(c => {
      compMap[c.uuid] = c;
      return c.uuid;
    });

    // Step 2: Get people linked to Ahmedabad companies OR with city = 'Ahmedabad'
    let peopleRows = [];

    if (compUuids.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < compUuids.length; i += chunkSize) {
        const chunk = compUuids.slice(i, i + chunkSize);
        const pRes = await client.query(`
          SELECT uuid, company_uuid, full_name, first_name, last_name, job_title, city, state, emails, phones, linked_url
          FROM final.people
          WHERE company_uuid::text = ANY($1::text[])
        `, [chunk]);
        peopleRows.push(...pRes.rows);
      }
    }

    // Step 3: Also get people where city = 'Ahmedabad' directly
    const directPeopleRes = await client.query(`
      SELECT uuid, company_uuid, full_name, first_name, last_name, job_title, city, state, emails, phones, linked_url
      FROM final.people
      WHERE city = 'Ahmedabad'
      LIMIT 1000
    `);

    peopleRows.push(...directPeopleRes.rows);

    // Deduplicate by uuid
    const uniquePeopleMap = new Map();
    peopleRows.forEach(r => uniquePeopleMap.set(r.uuid, r));
    const allRecords = Array.from(uniquePeopleMap.values());

    console.log(`Total unique contacts retrieved for Ahmedabad: ${allRecords.length}`);
    const res = { rows: allRecords };

    const headers = [
      'Full Name',
      'Job Title',
      'City',
      'State',
      'Primary Email',
      'All Emails',
      'Primary Phone',
      'All Phones',
      'LinkedIn Profile'
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

    res.rows.forEach(row => {
      const emailList = cleanArrayField(row.emails);
      const phoneList = cleanArrayField(row.phones);

      const record = [
        row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        row.job_title || 'Student / Applicant',
        row.city || 'Ahmedabad',
        row.state || 'Gujarat',
        emailList[0] || '',
        emailList.join('; '),
        phoneList[0] || '',
        phoneList.join('; '),
        row.linked_url || ''
      ];

      csvContent += record.map(escapeCsv).join(',') + '\n';
    });

    const outputPath = path.join(__dirname, '../ahmedabad_toefl_ielts_students.csv');
    fs.writeFileSync(outputPath, csvContent);
    console.log(`✅ Exported ${res.rows.length} records to: ${outputPath}`);

  } catch (err) {
    console.error('Export Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
