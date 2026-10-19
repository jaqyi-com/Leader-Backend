const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Disable timeout for background batch query
    await client.query('SET statement_timeout = 0;');
    console.log('⚡ Querying Indian B.Tech & Engineering Student leads (High Speed)...');

    const res = await client.query(`
      SELECT 
        p.full_name,
        p.job_title,
        p.city,
        p.state,
        p.location,
        p.emails,
        p.phones,
        p.linked_url,
        p.company_uuid
      FROM final.people p
      WHERE p.job_title ILIKE '%student%' 
         OR p.job_title ILIKE '%b.tech%' 
         OR p.job_title ILIKE '%btech%' 
         OR p.job_title ILIKE '%b.e.%'
      LIMIT 1000;
    `);

    console.log(`Fetched ${res.rows.length} B.Tech / Engineering Student records.`);

    // Fetch linked company names in fast batch
    const companyUuids = [...new Set(res.rows.map(r => r.company_uuid).filter(id => id && id.length > 10))];
    const companyMap = {};
    if (companyUuids.length > 0) {
      const compRes = await client.query(`
        SELECT uuid, business_name, website FROM final.companies WHERE uuid = ANY($1::uuid[])
      `, [companyUuids]);
      compRes.rows.forEach(c => companyMap[c.uuid] = c);
    }

    const headers = ["Full Name", "Job Title", "Company / Institution", "City", "State", "Location", "Emails", "Phones", "LinkedIn", "Website"];
    
    const cleanArray = (raw) => {
      if (!raw) return '';
      if (Array.isArray(raw)) return raw.join('; ');
      if (typeof raw === 'string') return raw.replace(/^\{|\}$/g, '').replace(/"/g, '');
      return String(raw);
    };

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const clean = cleanArray(str);
      return `"${clean.replace(/"/g, '""')}"`;
    };

    let csv = headers.map(h => `"${h}"`).join(",") + "\n";
    res.rows.forEach(r => {
      const comp = companyMap[r.company_uuid] || {};
      csv += [
        escapeCsv(r.full_name),
        escapeCsv(r.job_title),
        escapeCsv(comp.business_name || ''),
        escapeCsv(r.city),
        escapeCsv(r.state),
        escapeCsv(r.location),
        escapeCsv(r.emails),
        escapeCsv(r.phones),
        escapeCsv(r.linked_url),
        escapeCsv(comp.website || '')
      ].join(",") + "\n";
    });

    const outPath = path.join('/Volumes/akshat/LeadGenerator', 'btech_india_students.csv');
    fs.writeFileSync(outPath, csv, 'utf8');
    console.log(`✅ Successfully exported ${res.rows.length} B.Tech student leads to ${outPath}`);

  } catch(e) {
    console.error('Error during B.Tech export:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
