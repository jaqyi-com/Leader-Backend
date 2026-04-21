const chalk = require("chalk");
const logger = require("./logger").forAgent("Validator");

/**
 * Strict Environment Validator
 * Checks all required credentials and Exits if anything is missing.
 */
function validateCredentials() {
  const missing = [];

  // Required keys for full functionality
  if (!process.env.OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY (Needed for LLM Personalization)");
  }
  if (!process.env.APOLLO_API_KEY) {
    missing.push("APOLLO_API_KEY (Needed for Lead Enrichment)");
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    missing.push("SMTP_USER / SMTP_PASS (Needed for Email Delivery)");
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
    console.error(chalk.red("\n❌ STRICT CREDENTIAL VALIDATION FAILED:"));
    console.error(chalk.red("The following required credentials are missing in your .env file:\n"));
    missing.forEach((err) => console.error(chalk.red(`  - ${err}`)));
    console.error(chalk.red("\nPlease update your .env file and restart the pipeline.\n"));
    process.exit(1); 
  }

  logger.info(chalk.green("✅ All required credentials validated successfully."));
}

module.exports = validateCredentials;
