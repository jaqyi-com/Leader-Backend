require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    const compCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'final' AND table_name = 'companies'
      ORDER BY ordinal_position;
    `);
    console.log("=== final.companies columns ===");
    console.log(compCols.rows.map(r => `${r.column_name} (${r.data_type})`).join(", "));

    const peopleCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'final' AND table_name = 'people'
      ORDER BY ordinal_position;
    `);
    console.log("\n=== final.people columns ===");
    console.log(peopleCols.rows.map(r => `${r.column_name} (${r.data_type})`).join(", "));

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
