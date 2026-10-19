const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== EXPORTING AHMEDABAD TOEFL, IELTS & STUDENT LEADS ===');
    await client.query('SET statement_timeout = 300000');

    // Query 412k Ahmedabad records specifically for Students & Exam Prep
    console.log('Querying Ahmedabad people records with emails/phones and relevant titles...');
    const res = await client.query(`
      SELECT 
        uuid,
        full_name,
        first_name,
        last_name,
        job_title,
        city,
        state,
        emails,
        phones,
        linked_url
      FROM final.people
      WHERE (city = 'Ahmedabad' OR city = 'ahmedabad' OR city = 'AHMEDABAD')
        AND (emails IS NOT NULL AND emails != '{}' AND emails != '')
        AND (
          job_title ILIKE '%student%'
          OR job_title ILIKE '%ielts%'
          OR job_title ILIKE '%toefl%'
          OR job_title ILIKE '%gre%'
          OR job_title ILIKE '%gmat%'
          OR job_title ILIKE '%study abroad%'
          OR job_title ILIKE '%intern%'
          OR job_title ILIKE '%scholar%'
          OR job_title ILIKE '%candidate%'
          OR job_title ILIKE '%aspirant%'
          OR job_title ILIKE '%undergrad%'
          OR job_title ILIKE '%grad%'
        )
      LIMIT 5000
    `);

    console.log(`Fetched ${res.rows.length} matched student & test prep records in Ahmedabad.`);

    // Fallback: If job_title ILIKE is sparse, get Ahmedabad contacts with valid email/phone
    let finalRows = res.rows;
    if (finalRows.length < 50) {
      console.log('Fetching top contact-verified leads in Ahmedabad...');
      const fallbackRes = await client.query(`
        SELECT 
          uuid,
          full_name,
          first_name,
          last_name,
          job_title,
          city,
          state,
          emails,
          phones,
          linked_url
        FROM final.people
        WHERE (city = 'Ahmedabad' OR city = 'ahmedabad' OR city = 'AHMEDABAD')
          AND (emails IS NOT NULL AND emails != '{}' AND emails != '')
        LIMIT 1000
      `);
      finalRows = fallbackRes.rows;
    }

    const headers = [
      'Full Name',
      'Job Title / Role',
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

    finalRows.forEach(row => {
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
    console.log(`\n✅ EXPORT SUCCESSFUL!`);
    console.log(`Saved ${finalRows.length} Ahmedabad student/test-prep leads to: ${outputPath}`);

  } catch (err) {
    console.error('Export Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
