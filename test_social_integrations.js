require("dotenv").config();
const axios = require("axios");

async function test() {
  try {
    const res = await axios.get("https://api.unified.to/unified/integration?categories=social", {
      headers: { Authorization: `Bearer ${process.env.UNIFIED_API_KEY}` }
    });
    const socialIntegrations = res.data.map(i => ({
      type: i.type,
      name: i.name,
      categories: i.categories,
      methods: Object.keys(i.support?.social_post?.methods || {})
    }));
    console.log("SOCIAL INTEGRATIONS:", JSON.stringify(socialIntegrations, null, 2));
  } catch (err) {
    console.error("ERROR:", err.response ? err.response.data : err.message);
  }
}
test();
