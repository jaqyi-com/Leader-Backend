require("dotenv").config();
const axios = require("axios");

async function test() {
  try {
    const res = await axios.get("https://api.unified.to/unified/connection?env=Production", {
      headers: { Authorization: `Bearer ${process.env.UNIFIED_API_KEY}` }
    });
    console.log("PRODUCTION CONNECTIONS:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("ERROR:", err.response ? err.response.data : err.message);
  }
}
test();
