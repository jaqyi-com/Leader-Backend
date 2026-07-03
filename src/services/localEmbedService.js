"use strict";

const { execFile } = require("child_process");
const path = require("path");
const logger = require("../utils/logger").forAgent("LocalEmbedService");

// Path to python embedding query helper
const EMBED_SCRIPT_PATH = path.join(__dirname, "../../scripts/embedQuery.py");

/**
 * Generate 384-dimensional embedding vector locally using Xenova/all-MiniLM-L6-v2.
 * Runs embedQuery.py as a fast subprocess.
 * 
 * @param {string} query The text query to embed
 * @returns {Promise<number[]>} 384-dimensional float array
 */
function getLocalQueryEmbedding(query) {
  return new Promise((resolve, reject) => {
    if (!query || typeof query !== "string") {
      return resolve([]);
    }

    // Call python script as subprocess
    execFile("python3", [EMBED_SCRIPT_PATH, query], (error, stdout, stderr) => {
      if (error) {
        logger.error(`Subprocess error: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        // Some warning logs from huggingface might print to stderr, but we can ignore if stdout is fine
        logger.debug(`Subprocess stderr: ${stderr}`);
      }

      try {
        const embedding = JSON.parse(stdout.trim());
        if (Array.isArray(embedding) && embedding.length === 384) {
          resolve(embedding);
        } else {
          logger.error(`Invalid embedding format received: length ${embedding ? embedding.length : 0}`);
          resolve([]);
        }
      } catch (err) {
        logger.error(`Failed to parse subprocess output: ${err.message}. Output was: ${stdout}`);
        resolve([]);
      }
    });
  });
}

module.exports = {
  getLocalQueryEmbedding,
};
