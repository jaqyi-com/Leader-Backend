require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    console.time("people_sample_titles");
    const sampleTitles = await client.query(`
      SELECT COALESCE(NULLIF(TRIM(job_title), ''), 'Not Specified') AS job_title, COUNT(*) * 20 AS count
      FROM final.people TABLESAMPLE SYSTEM(5)
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 25;
    `);
    console.timeEnd("people_sample_titles");
    console.log("Top 10 Sampled Job Titles:", sampleTitles.rows.slice(0, 10));

    console.time("people_sample_state");
    const sampleState = await client.query(`
      SELECT COALESCE(NULLIF(TRIM(state), ''), 'Unknown') AS state, COUNT(*) * 20 AS count
      FROM final.people TABLESAMPLE SYSTEM(5)
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 25;
    `);
    console.timeEnd("people_sample_state");
    console.log("Top 10 Sampled States:", sampleState.rows.slice(0, 10));

    console.time("people_sample_stats");
    const sampleStats = await client.query(`
      SELECT 
        COUNT(*) * 20 as total_est,
        COUNT(*) FILTER (WHERE emails IS NOT NULL AND emails <> '' AND emails <> '{}') * 20 as with_email_est,
        COUNT(*) FILTER (WHERE phones IS NOT NULL AND phones <> '' AND phones <> '{}') * 20 as with_phone_est,
        COUNT(*) FILTER (WHERE linked_url IS NOT NULL AND linked_url <> '') * 20 as with_linkedin_est
      FROM final.people TABLESAMPLE SYSTEM(5);
    `);
    console.timeEnd("people_sample_stats");
    console.log("Sampled People Stats:", sampleStats.rows[0]);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
