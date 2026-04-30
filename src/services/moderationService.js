// ============================================================
// MODERATION SERVICE — OpenAI Moderation API
// ============================================================
// Uses: omni-moderation-latest (free, no token cost)
//
// Algorithm: multi-label text classification
//   - Fine-tuned transformer outputs probability per harm category
//   - Categories: hate, harassment, self-harm, sexual, violence
//   - If ANY category score > threshold → flagged
//
// Applied to:
//   1. User input (before LLM call)
//   2. Assistant output (before saving to DB)
// ============================================================

"use strict";

const OpenAI = require("openai");
const logger = require("../utils/logger").forAgent("Moderation");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Categories we care about and their score thresholds
// Lower threshold = stricter moderation
const CATEGORY_THRESHOLDS = {
  hate:                   0.5,
  "hate/threatening":     0.4,
  harassment:             0.6,
  "harassment/threatening": 0.4,
  "self-harm":            0.5,
  "self-harm/intent":     0.4,
  "self-harm/instructions": 0.3,
  sexual:                 0.7,
  "sexual/minors":        0.1,   // zero tolerance
  violence:               0.7,
  "violence/graphic":     0.5,
};

/**
 * Check if text violates content policy.
 *
 * @param {string} text — the text to moderate
 * @param {"input"|"output"} role — where the text came from (for logging)
 * @returns {{ flagged: boolean, categories: string[], reason: string }}
 */
async function moderate(text, role = "input") {
  if (!text || text.trim().length < 5) {
    return { flagged: false, categories: [], reason: null };
  }

  try {
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: text.trim().slice(0, 4000), // API max
    });

    const result = response.results[0];
    if (!result) return { flagged: false, categories: [], reason: null };

    // Check each category against its threshold
    const flaggedCategories = [];
    const scores = result.category_scores || {};

    for (const [category, threshold] of Object.entries(CATEGORY_THRESHOLDS)) {
      const score = scores[category] || 0;
      if (score >= threshold) {
        flaggedCategories.push({ category, score: score.toFixed(3) });
      }
    }

    // Also respect OpenAI's own flagged signal
    const isOpenAIFlagged = result.flagged === true;
    const isFlagged = isOpenAIFlagged || flaggedCategories.length > 0;

    if (isFlagged) {
      const categoryNames = flaggedCategories.map(f => f.category);
      logger.warn(
        `[Moderation] ${role} flagged — categories: [${categoryNames.join(", ")}]`
      );
      return {
        flagged: true,
        categories: categoryNames,
        reason: `Content flagged for: ${categoryNames.join(", ")}`,
      };
    }

    return { flagged: false, categories: [], reason: null };
  } catch (err) {
    // Moderation failure should NOT block the user — log and continue
    logger.warn(`[Moderation] API error (allowing through): ${err.message}`);
    return { flagged: false, categories: [], reason: null };
  }
}

/**
 * Safe decline message to send when user input is flagged.
 * @param {string[]} categories
 */
function getSafeDeclineMessage(categories = []) {
  const categoryStr = categories.length > 0
    ? ` (${categories.join(", ")})`
    : "";
  return `I'm sorry, but I can't respond to that message${categoryStr}. Please keep our conversation professional and respectful. If you have a business question or need help with your organization's knowledge base, I'm here to help!`;
}

module.exports = { moderate, getSafeDeclineMessage };
