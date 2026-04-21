// ============================================================
// LOGGER - Winston-based structured logging
// Logs to console + rotating daily files
// ============================================================

const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");
const chalk = require("chalk");

const LOG_DIR = path.join(process.cwd(), "logs");

// Custom format for console (colored, readable)
const consoleFormat = winston.format.printf(({ level, message, timestamp, agent, ...meta }) => {
  const ts = chalk.gray(timestamp);
  const agentTag = agent ? chalk.cyan(`[${agent}]`) : "";
  
  let levelColor;
  switch (level) {
    case "error": levelColor = chalk.red(`[ERROR]`); break;
    case "warn":  levelColor = chalk.yellow(`[WARN]`); break;
    case "info":  levelColor = chalk.green(`[INFO]`); break;
    case "debug": levelColor = chalk.blue(`[DEBUG]`); break;
    default: levelColor = `[${level.toUpperCase()}]`;
  }

  const metaStr = Object.keys(meta).length > 0 ? chalk.gray(` | ${JSON.stringify(meta)}`) : "";
  return `${ts} ${levelColor} ${agentTag} ${message}${metaStr}`;
});

// File transport (JSON structured)
const fileTransport = new winston.transports.DailyRotateFile({
  dirname: LOG_DIR,
  filename: "agent-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const errorFileTransport = new winston.transports.DailyRotateFile({
  dirname: LOG_DIR,
  filename: "error-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  level: "error",
  maxFiles: "30d",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: "HH:mm:ss" }),
        consoleFormat
      ),
    }),
    fileTransport,
    errorFileTransport,
  ],
});

// Create child loggers per agent
logger.forAgent = (agentName) => logger.child({ agent: agentName });

module.exports = logger;
