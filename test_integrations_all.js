require("dotenv").config();
const axios = require("axios");

async function test() {
  try {
    const res = await axios.get("https://api.unified.to/unified/integration", {
      headers: { Authorization: `Bearer ${process.env.UNIFIED_API_KEY}` }
    });
    const socialProviders = ["linkedin", "linkedin_v2", "twitter", "x", "instagram", "facebook"];
    const integrations = res.data.filter(i => socialProviders.includes(i.type));
    const result = integrations.map(i => ({
      type: i.type,
      name: i.name,
      categories: i.categories,
      auth_url: i.api?.urls?.[0]?.authorize_url
    }));
    console.log("INTEGRATIONS:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("ERROR:", err.response ? err.response.data : err.message);
  }
}
test();
