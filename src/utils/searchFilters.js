"use strict";
// Shared helpers for the /api/final-* filter search routes.

/** Escape LIKE/ILIKE wildcards so user text such as "%" or "_" is matched literally. */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

/** Escape regex metacharacters (for building PostgreSQL ~* word-boundary patterns). */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `word` appears in `text` as a whole word (so "cto" does not match "factory"). */
function hasWord(text, word) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}s?($|[^a-z0-9])`, "i").test(String(text));
}

/**
 * Job-title condition for one search term.
 * Short terms (≤3 chars: CTO, CEO, CA, IT, HR, EHS…) match whole words only; "%CTO%" would also
 * hit Fa-cto-ry, Dire-cto-r, Do-cto-r and "%IT%" would hit Recru-it-er, Qual-it-y.
 * Longer terms keep the substring match.
 * Pushes the bound parameter onto `values` and returns { sql, nextIdx }.
 */
function jobTitleCondition(term, values, idx, col = '"job_title"') {
  if (term.length <= 3) {
    values.push(`\\y${escapeRegex(term)}\\y`);
    return { sql: `${col} ~* $${idx}`, nextIdx: idx + 1 };
  }
  values.push(`%${escapeLike(term)}%`);
  return { sql: `${col} ILIKE $${idx}`, nextIdx: idx + 1 };
}

// All Indian states and union territories, including common alternative spellings.
const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Orissa", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "Uttaranchal", "West Bengal",
  "Delhi", "NCT of Delhi", "New Delhi", "Chandigarh", "Puducherry", "Pondicherry", "Ladakh",
  "Jammu and Kashmir", "Jammu & Kashmir", "Andaman and Nicobar Islands", "Lakshadweep",
  "Dadra and Nagar Haveli", "Daman and Diu", "Dadra and Nagar Haveli and Daman and Diu",
];

/** SQL list literal for INDIA_STATES (constant values only — never user input). */
const INDIA_STATES_SQL = INDIA_STATES.map((s) => `'${s.replace(/'/g, "''")}'`).join(", ");

const EXACT_COUNT_CAP = 10000;

/**
 * Exact result count, capped. Returns { total, exact: true } when the filter matches at most
 * `cap` rows, or null when there are more (or the count timed out) so the caller can fall back
 * to an estimate. Replaces EXPLAIN-based guesses, which were off even on tiny tables.
 * The 4s limit bounds the extra latency on 45M-row tables when a filter cannot use an index.
 */
async function exactCappedTotal(pgQuery, fromTable, whereStr, values, cap = EXACT_COUNT_CAP, timeoutMs = 4000) {
  try {
    const r = await pgQuery(
      `SELECT COUNT(*) AS cnt FROM (SELECT 1 FROM ${fromTable} ${whereStr} LIMIT ${cap + 1}) s`,
      values,
      timeoutMs
    );
    const n = parseInt(r.rows[0]?.cnt || "0", 10);
    return n <= cap ? { total: n, exact: true } : null;
  } catch {
    return null;
  }
}

module.exports = { escapeLike, escapeRegex, hasWord, jobTitleCondition, INDIA_STATES, INDIA_STATES_SQL, exactCappedTotal, EXACT_COUNT_CAP };
