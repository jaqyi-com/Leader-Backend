const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '/Volumes/akshat/LeadGenerator/.env' });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log('Fetching Indian SaaS Companies...');
    const companiesRes = await client.query(`
      SELECT uuid, business_name, industry, website, city, state
      FROM final.companies 
      WHERE 
        (
          industry ILIKE '%saas%' 
          OR industry ILIKE '%software%' 
          OR industry ILIKE '%tech%'
        )
        AND 
        (
          city ILIKE '%mumbai%' OR city ILIKE '%bangalore%' OR city ILIKE '%bengaluru%' OR 
          city ILIKE '%delhi%' OR city ILIKE '%pune%' OR city ILIKE '%hyderabad%' OR 
          city ILIKE '%chennai%' OR city ILIKE '%gurgaon%' OR city ILIKE '%noida%'
        )
      LIMIT 1000
    `);

    console.log(`Found ${companiesRes.rows.length} Indian SaaS companies.`);
    if (companiesRes.rows.length === 0) {
      console.log('No companies found.');
      return;
    }

    const companyUuids = companiesRes.rows.map(c => c.uuid);
    const companyMap = {};
    companiesRes.rows.forEach(c => { companyMap[c.uuid] = c; });

    console.log('Fetching Founders/CEOs for these companies...');
    const peopleRes = await client.query(`
      SELECT full_name, job_title, location, city, emails, phones, linked_url, company_uuid
      FROM final.people
      WHERE company_uuid = ANY($1::text[])
        AND (job_title ILIKE '%founder%' OR job_title ILIKE '%ceo%')
      LIMIT 200
    `, [companyUuids]);

    console.log(`Found ${peopleRes.rows.length} Founders/CEOs.`);

    const headers = ['Full Name', 'Job Title', 'Company', 'Industry', 'Location', 'Emails', 'Phones', 'LinkedIn', 'Website'];
    let csv = headers.join(',') + '\n';

    peopleRes.rows.forEach(p => {
      const c = companyMap[p.company_uuid] || {};
      const escape = (str) => str ? '"' + String(str).replace(/"/g, '""') + '"' : '';
      const line = [
        escape(p.full_name),
        escape(p.job_title),
        escape(c.business_name),
        escape(c.industry),
        escape(p.location || p.city || c.city),
        escape(p.emails),
        escape(p.phones),
        escape(p.linked_url),
        escape(c.website)
      ].join(',');
      csv += line + '\n';
    });

    const outPath = path.join('/Volumes/akshat/LeadGenerator', 'saas_founders_india.csv');
    fs.writeFileSync(outPath, csv);
    console.log(`Saved ${peopleRes.rows.length} records to ${outPath}`);
    
    // Log sample
    console.log('\n=== SAMPLE DATA ===');
    console.log(JSON.stringify(peopleRes.rows.slice(0, 2), null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
