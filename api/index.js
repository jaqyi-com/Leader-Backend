let app;
let initError = null;

try {
  app = require("../src/server");
} catch (err) {
  console.error("❌ Failed to initialize Express app in Vercel:", err);
  initError = err;
}

module.exports = (req, res) => {
  if (initError) {
    // Details go to the server log only; never return stack traces or messages to clients.
    return res.status(500).json({ error: "Backend initialization failed" });
  }
  return app(req, res);
};
