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

// ── Resource guards ─────────────────────────────────────────────────────────

/** Per-query statement timeout for filtered searches (fail fast instead of hanging 30s). */
const searchTimeoutMs = () => parseInt(process.env.SEARCH_TIMEOUT_MS, 10) || 15000;

/** Deepest row a client may page to (OFFSET + LIMIT). Deep OFFSETs scan millions of rows. */
const maxResultWindow = () => {
  const n = parseInt(process.env.MAX_RESULT_WINDOW, 10);
  return Number.isFinite(n) && n >= 0 ? n : 100000;
};

/** Largest result set that may be sorted (sorting millions of rows always times out). */
const sortRowLimit = () => parseInt(process.env.SORT_MAX_ROWS, 10) || EXACT_COUNT_CAP;

/** Returns an error body when offset+limit goes deeper than the allowed window, else null. */
function resultWindowError(offset, limit) {
  const max = maxResultWindow();
  if (max > 0 && offset + limit > max) {
    return {
      error: `Results are limited to the first ${max.toLocaleString("en-US")} records. Add more filters to narrow your search.`,
      code: "RESULT_WINDOW_EXCEEDED",
      max_results: max,
    };
  }
  return null;
}

/**
 * Sorting needs the whole matching set in memory. Allow it only when the filter matches few
 * enough rows; otherwise tell the user to narrow the search (instead of a 30s timeout / 500).
 * Returns an error body, or null when sorting is allowed.
 */
async function checkSortAllowed(pgQuery, fromTable, whereStr, values, hasFilters) {
  if (!hasFilters) {
    return { error: "Sorting needs at least one filter (for example a city or state).", code: "SORT_NEEDS_FILTER" };
  }
  const cap = sortRowLimit();
  const exact = await exactCappedTotal(pgQuery, fromTable, whereStr, values, cap);
  if (!exact) {
    return {
      error: `Sorting is available when a search matches at most ${cap.toLocaleString("en-US")} records. Add more filters to sort.`,
      code: "SORT_NEEDS_NARROWER_FILTERS",
    };
  }
  return null;
}

/**
 * One- and two-letter job-title terms ("IT", "HR", "CA") cannot use the trigram index (it needs
 * 3+ characters), so on its own such a search scans tens of millions of rows and times out.
 * Require a location filter alongside them. Returns an error body, or null when the search is fine.
 */
function shortTitleNeedsFilter(query) {
  const entries = Object.entries(query || {});
  const hasShortTitle = entries.some(([k, v]) =>
    /^f_job_title(_sw|_ew)?$/.test(k) && String(v ?? "").trim().length > 0 && String(v).trim().length <= 2);
  if (!hasShortTitle) return null;
  const narrowed = entries.some(([k, v]) => /^f_(city|state|pincode|location)/.test(k) && String(v ?? "").trim() !== "");
  if (narrowed) return null;
  return {
    error: "Very short job titles such as “IT” or “HR” match too many people to search quickly. Add a city or state filter, or use a longer title.",
    code: "SHORT_TERM_NEEDS_FILTER",
  };
}

/**
 * Keep the "has e-mail / has phone" partial indexes for the one case they are good at.
 *
 * Partial indexes on rows with a real e-mail/phone make a lone "has email" listing instant, but
 * when the same predicate is combined with other filters (city + job title + has email) the
 * planner underestimates how rare the combination is and walks that huge index row by row,
 * timing out. Rewriting the predicate into an equivalent form the partial index cannot match
 * (btrim(col,'{}') <> '' is true exactly when col is not '' or '{}') steers combined searches
 * back to the text-index plans, while a lone has-contact filter keeps the exact indexed form.
 */
const CONTACT_PREDICATE = /\("([a-z_]+)" IS NOT NULL AND "\1" <> '' AND "\1" <> '\{\}'\)/g;
function steerContactPredicates(whereStr) {
  if (!whereStr) return whereStr;
  const found = whereStr.match(CONTACT_PREDICATE) || [];
  if (found.length === 1 && whereStr.trim() === `WHERE ${found[0]}`) return whereStr; // sole filter
  return whereStr.replace(CONTACT_PREDICATE, (m, col) => `("${col}" IS NOT NULL AND btrim("${col}", '{}') <> '')`);
}

/** Uniform error response for search routes: timeouts become a clear 503, nothing internal leaks. */
function sendSearchError(res, err, logger) {
  if (err && err.code === "57014") {
    if (logger) logger.warn(`Search timed out: ${err.message}`);
    return res.status(503).json({
      error: "This search is too broad to finish in time. Add more filters (city, state, job title) and try again.",
      code: "SEARCH_TOO_SLOW",
    });
  }
  if (logger) logger.error(`Search failed: ${err && err.message}`);
  return res.status(500).json({ error: "Search failed. Please try again." });
}

module.exports = {
  escapeLike, escapeRegex, hasWord, jobTitleCondition, INDIA_STATES, INDIA_STATES_SQL,
  exactCappedTotal, EXACT_COUNT_CAP, searchTimeoutMs, maxResultWindow, sortRowLimit,
  resultWindowError, checkSortAllowed, sendSearchError, shortTitleNeedsFilter, steerContactPredicates,
};
