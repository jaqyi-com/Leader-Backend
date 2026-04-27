require('dotenv').config();
const axios = require('axios');

async function test() {
  const address = "Bhopal, Madhya Pradesh, India";
  const params = {
    address,
    key: process.env.GOOGLE_API_KEY
  };
  try {
    const response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", { params });
    console.log(JSON.stringify(response.data, null, 2));
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}

test();
