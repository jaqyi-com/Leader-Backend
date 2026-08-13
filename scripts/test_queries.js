require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    console.time("companies_industry");
    const compIndustry = await client.query(`
      SELECT COALESCE(NULLIF(TRIM(industry), ''), 'Other / General') AS category, COUNT(*) as count
      FROM final.companies
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 30;
    `);
    console.timeEnd("companies_industry");
    console.log("Top 10 Categories (Companies):", compIndustry.rows.slice(0, 10));

    console.time("companies_state");
    const compState = await client.query(`
      SELECT COALESCE(NULLIF(TRIM(state), ''), 'Unknown') AS state, COUNT(*) as count
      FROM final.companies
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 30;
    `);
    console.timeEnd("companies_state");
    console.log("Top 10 States (Companies):", compState.rows.slice(0, 10));

    console.time("companies_contact_stats");
    const compStats = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE emails IS NOT NULL AND emails <> '' AND emails <> '{}') as with_email,
        COUNT(*) FILTER (WHERE (phone IS NOT NULL AND phone <> '') OR (phones IS NOT NULL AND phones <> '' AND phones <> '{}')) as with_phone,
        COUNT(*) FILTER (WHERE website IS NOT NULL AND website <> '') as with_website
      FROM final.companies;
    `);
    console.timeEnd("companies_contact_stats");
    console.log("Company Contact Stats:", compStats.rows[0]);

    console.time("people_titles");
    const peopleTitles = await client.query(`
      SELECT COALESCE(NULLIF(TRIM(job_title), ''), 'Not Specified') AS job_title, COUNT(*) as count
      FROM final.people
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 25;
    `);
    console.timeEnd("people_titles");
    console.log("Top 10 Job Titles (People):", peopleTitles.rows.slice(0, 10));

    console.time("people_state");
    const peopleState = await client.query(`
      SELECT COALESCE(NULLIF(TRIM(state), ''), 'Unknown') AS state, COUNT(*) as count
      FROM final.people
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 25;
    `);
    console.timeEnd("people_state");
    console.log("Top 10 States (People):", peopleState.rows.slice(0, 10));

    console.time("people_contact_stats");
    const peopleStats = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE emails IS NOT NULL AND emails <> '' AND emails <> '{}') as with_email,
        COUNT(*) FILTER (WHERE phones IS NOT NULL AND phones <> '' AND phones <> '{}') as with_phone,
        COUNT(*) FILTER (WHERE linked_url IS NOT NULL AND linked_url <> '') as with_linkedin
      FROM final.people;
    `);
    console.timeEnd("people_contact_stats");
    console.log("People Contact Stats:", peopleStats.rows[0]);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
