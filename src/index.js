require("dotenv").config();

const PipelineOrchestrator = require("./orchestrator");
const validateCredentials = require("./utils/validateEnv");
const logger = require("./utils/logger").forAgent("CLI");

/**
 * MAIN ENTRY POINT (CLI)
 * Parses command-line arguments and runs the requested pipeline phase
 */
async function main() {
  // Parse arguments (e.g., --phase=scrape --step=1)
  const args = process.argv.slice(2).reduce((acc, arg) => {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      acc[key] = value || true;
    }
    return acc;
  }, {});

  const phase = args.phase || "all";
  const step = parseInt(args.step || 1);

  logger.info(`CLI Triggered: Phase = ${phase}${phase === 'outreach' ? `, Step = ${step}` : ''}`);

  try {
    // 1. Validate environment
    validateCredentials();

    // 2. Initialize orchestrator
    const pipeline = new PipelineOrchestrator();

    // 3. Execute requested phase
    switch (phase) {
      case "all":
        await pipeline.runFull();
        break;
      case "scrape":
        await pipeline.runScraping();
        break;
      case "enrich":
        await pipeline.runEnrichment();
        break;
      case "outreach":
        await pipeline.runOutreach(step);
        break;
      case "score":
        await pipeline.runScoring();
        break;
      case "report":
        await pipeline.runReporting();
        break;
      case "reply":
        // Simulated reply for testing
        logger.info("Simulating an inbound reply...");
        await pipeline.processInboundReply({
          from: "test@example.com",
          body: "I am interested in the T1 sensor, can we talk?",
          subject: "Re: Robotics Sensing"
        });
        break;
      default:
        console.error(`Unknown phase: ${phase}`);
        process.exit(1);
    }

    logger.info("Execution completed successfully.");
    process.exit(0);
  } catch (err) {
    logger.error(`CLI Execution failed: ${err.message}`);
    process.exit(1);
  }
}

main();
