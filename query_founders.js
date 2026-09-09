const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '/Volumes/akshat/LeadGenerator/.env' });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log('Setting timeout to 5 mins...');
    await client.query(`SET statement_timeout = 300000`);
    console.log('Running query...');
    const result = await client.query(`
      SELECT 
        p.full_name,
        p.job_title,
        p.location,
        p.city,
        p.emails,
        p.phones,
        p.linked_url,
        c.business_name,
        c.website,
        c.industry
      FROM final.people p
      JOIN final.companies c ON NULLIF(p.company_uuid, '')::uuid = c.uuid
      WHERE 

        (
          p.location ILIKE '%india%' 
          OR p.city ILIKE '%mumbai%'
          OR p.city ILIKE '%bangalore%'
          OR p.city ILIKE '%bengaluru%'
          OR p.city ILIKE '%delhi%'
          OR p.city ILIKE '%hyderabad%'
          OR p.city ILIKE '%pune%'
          OR p.city ILIKE '%chennai%'
          OR p.city ILIKE '%gurgaon%'
          OR p.city ILIKE '%noida%'
        )
        AND 
        (
          p.job_title ILIKE '%founder%' 
          OR p.job_title ILIKE '%ceo%'
        )
        AND 
        (
          c.industry ILIKE '%saas%' 
          OR c.industry ILIKE '%software%'
          OR c.industry ILIKE '%tech%'
        )
      LIMIT 100
    `);

    const headers = ['Full Name', 'Job Title', 'Company', 'Industry', 'Location', 'Emails', 'Phones', 'LinkedIn', 'Website'];
    let csv = headers.join(',') + '\n';

    result.rows.forEach(row => {
      const escape = (str) => str ? '"' + str.replace(/"/g, '""') + '"' : '';
      const line = [
        escape(row.full_name),
        escape(row.job_title),
        escape(row.business_name),
        escape(row.industry),
        escape(row.location || row.city),
        escape(row.emails),
        escape(row.phones),
        escape(row.linked_url),
        escape(row.website)
      ].join(',');
      csv += line + '\n';
    });

    const outPath = path.join('/Volumes/akshat/LeadGenerator', 'saas_founders_india.csv');
    fs.writeFileSync(outPath, csv);
    console.log(`Saved ${result.rows.length} records to ${outPath}`);
    
    // Also log a few for quick view
    console.log(JSON.stringify(result.rows.slice(0, 3), null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
