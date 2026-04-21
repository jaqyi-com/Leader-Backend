require("dotenv").config();
const apollo = require("./src/integrations/ApolloIntegration");

async function test() {
  try {
    const res = await apollo.searchPeople("bostondynamics.com", ["CEO", "CTO"]);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  }
}
test();
