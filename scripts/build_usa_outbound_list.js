const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

function cleanPostgresArray(arrStr) {
  if (!arrStr || arrStr === '{}') return '';
  return arrStr.replace(/^\{|\}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean).join('; ');
}

function extractPrimaryEmail(arrStr) {
  if (!arrStr || arrStr === '{}') return '';
  const list = arrStr.replace(/^\{|\}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
  return list[0] || '';
}

function extractCompanyFromEmail(email) {
  if (!email || !email.includes('@')) return '';
  const domain = email.split('@')[1] || '';
  if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'].includes(domain.toLowerCase())) {
    return '';
  }
  const namePart = domain.split('.')[0];
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Querying USA Tech & SaaS Founders from 43M database...');
    
    // Select top states known for SaaS & Tech startups
    const res = await client.query(`
      SELECT 
        full_name, 
        job_title, 
        city, 
        state, 
        location, 
        emails, 
        phones, 
        linked_url
      FROM final.people
      WHERE state IN ('CA', 'NY', 'TX', 'WA', 'MA', 'CO', 'IL', 'FL', 'UT', 'NC', 'GA', 'VA', 'OR', 'AZ')
        AND job_title IN ('Founder', 'Co-Founder', 'CEO', 'Chief Executive Officer', 'Founder & CEO', 'Founder and CEO', 'President & CEO', 'President and CEO')
        AND emails IS NOT NULL 
        AND emails != '{}' 
        AND emails != ''
      LIMIT 1000;
    `);

    console.log(`Retrieved ${res.rows.length} USA executive records.`);

    const leads = [];
    const seen = new Set();

    res.rows.forEach(r => {
      const email = extractPrimaryEmail(r.emails);
      const allEmails = cleanPostgresArray(r.emails);
      const allPhones = cleanPostgresArray(r.phones);
      const name = (r.full_name || '').trim();

      if (email && !seen.has(email) && name) {
        seen.add(email);
        const company = extractCompanyFromEmail(email);
        leads.push({
          name,
          title: r.job_title || 'Founder & CEO',
          company: company || 'USA Enterprise / Startup',
          city: r.city || '',
          state: r.state || 'USA',
          location: r.location || (r.city ? `${r.city}, ${r.state}, USA` : `${r.state}, USA`),
          primaryEmail: email,
          allEmails,
          phones: allPhones,
          linkedin: r.linked_url || ''
        });
      }
    });

    console.log(`Filtered ${leads.length} unique USA Leads.`);

    const csvHeaders = ['Full Name', 'Job Title', 'Estimated Company / Domain', 'City', 'State', 'Location', 'Primary Email', 'All Emails', 'Phone Numbers', 'LinkedIn Profile'];
    let csvContent = csvHeaders.join(',') + '\n';

    leads.forEach(l => {
      const esc = (s) => '"' + (s || '').toString().replace(/"/g, '""') + '"';
      csvContent += [
        esc(l.name),
        esc(l.title),
        esc(l.company),
        esc(l.city),
        esc(l.state),
        esc(l.location),
        esc(l.primaryEmail),
        esc(l.allEmails),
        esc(l.phones),
        esc(l.linkedin)
      ].join(',') + '\n';
    });

    const outPath = path.join(__dirname, '../Doott_SaaS_Outbound_Founders_USA.csv');
    fs.writeFileSync(outPath, csvContent);
    console.log(`Saved USA Leads to ${outPath}`);

  } catch (err) {
    console.error('Query error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
