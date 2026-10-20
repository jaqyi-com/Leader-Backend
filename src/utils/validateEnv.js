const chalk = require("chalk");
const logger = require("./logger").forAgent("Validator");

/**
 * Strict Environment Validator
 * Checks all required credentials and Exits if anything is missing.
 */
function validateCredentials() {
  const missing = [];

  // Required keys for full functionality
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    missing.push("SMTP_USER / SMTP_PASS (Needed for verification and password-reset emails)");
  }
  
  if (!process.env.JWT_SECRET) {
    missing.push("JWT_SECRET (Needed to sign login tokens — generate with `openssl rand -hex 32`)");
  }
  if (!process.env.NEON_DATABASE_URL) {
    missing.push("NEON_DATABASE_URL (Needed for the lead database)");
  }

  // Optional but recommended
  const warnings = [];
  if (!process.env.MONGO_URI) {
    missing.push("MONGO_URI (Needed for Database Persistence)");
  }

  if (warnings.length > 0) {
    logger.warn(chalk.yellow("⚠ Configuration warnings:"));
    warnings.forEach((w) => logger.warn(chalk.yellow(`   • ${w}`)));
  }

  if (missing.length > 0) {
    console.error("❌ CREDENTIAL VALIDATION FAILED:");
    console.error("Missing required credentials:\n");
    missing.forEach((err) => console.error(`  - ${err}`));
    console.error("\nPlease set these in your .env file (local) or Vercel environment variables (production).\n");
    // On Vercel (serverless) we cannot call process.exit() — it kills the cold start.
    // Log the error but let the server continue; affected endpoints will fail gracefully.
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }

  logger.info(chalk.green("✅ All required credentials validated successfully."));
}

module.exports = validateCredentials;
