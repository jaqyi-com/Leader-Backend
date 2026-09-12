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
    return res.status(500).json({
      error: "Backend initialization failed",
      message: initError.message,
      stack: initError.stack
    });
  }
  return app(req, res);
};
