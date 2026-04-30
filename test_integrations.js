require("dotenv").config();
const axios = require("axios");

async function test() {
  try {
    const res = await axios.get("https://api.unified.to/unified/integration", {
      headers: { Authorization: `Bearer ${process.env.UNIFIED_API_KEY}` }
    });
    const instagramIntegrations = res.data.filter(i => i.name.toLowerCase().includes("instagram"));
    console.log("INSTAGRAM INTEGRATIONS:", JSON.stringify(instagramIntegrations, null, 2));
  } catch (err) {
    console.error("ERROR:", err.response ? err.response.data : err.message);
  }
}
test();
