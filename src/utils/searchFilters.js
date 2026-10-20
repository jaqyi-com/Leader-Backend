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
 *
 * Short terms (≤3 chars: CTO, CEO, CA, IT, HR, EHS…) must match WHOLE WORDS: "%CTO%" also hits
 * Fa-cto-ry, Dire-cto-r, Do-cto-r and "%IT%" hits Recru-it-er, Qual-it-y. Trigram indexes cannot do that
 * (they need 3+ characters and ignore word boundaries), so these use full-text search over the
 * 'simple' dictionary (no stop words / stemming), served by idx_people_job_title_fts. plainto_tsquery
 * treats the text as plain words, so user input can never inject query operators.
 * Longer terms keep the substring match (idx_people_job_title_trgm).
 * Pushes the bound parameter onto `values` and returns { sql, nextIdx }.
 */
function jobTitleCondition(term, values, idx, col = '"job_title"') {
  if (term.length <= 3) {
    values.push(term);
    return { sql: `to_tsvector('simple', ${col}) @@ plainto_tsquery('simple', $${idx})`, nextIdx: idx + 1 };
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
 * The 1.5s limit bounds the extra latency on 45M-row tables when a filter cannot use an index.
 */
async function exactCappedTotal(pgQuery, fromTable, whereStr, values, cap = EXACT_COUNT_CAP, timeoutMs = 1500) {
  // A planner estimate is nearly free. When it says the filter matches far more than `cap` rows, an
  // exact capped count would only burn its whole time budget (and the answer is "more than cap").
  // Exception: full-text predicates (@@) get a constant default selectivity, so their estimates are
  // meaningless (it said 224,870 for "CTO"; the real count is 311) — always try the real count there.
  if (!/@@/.test(whereStr)) {
    try {
      const ex = await pgQuery(`EXPLAIN SELECT 1 FROM ${fromTable} ${whereStr}`, values, 2000);
      const m = String(ex.rows?.[0]?.["QUERY PLAN"] || "").match(/rows=(\d+)/);
      if (m && parseInt(m[1], 10) > cap * 5) return null;
    } catch { /* no estimate available — just try the count */ }
  }
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
  const exact = await exactCappedTotal(pgQuery, fromTable, whereStr, values, cap, 4000);
  if (!exact) {
    return {
      error: `Sorting is available when a search matches at most ${cap.toLocaleString("en-US")} records. Add more filters to sort.`,
      code: "SORT_NEEDS_NARROWER_FILTERS",
    };
  }
  return null;
}

/**
 * Run a filtered search with up to three attempts, because no single plan wins:
 *
 *  1. sequential-scan first (indexes disabled), 1.5 s budget. For common values (Mumbai, Maharashtra,
 *     "has email") 25 matches turn up within the first few thousand rows: ~10 ms, versus 1-20 s when
 *     an index plan has to build a bitmap of millions of rows.
 *  2. if that times out the value is probably rare, so use the index plan (sequential scans disabled:
 *     trigram / full-text / btree indexes), 75% of the remaining budget: rare cities, titles and combinations answer in
 *     ~50-500 ms, where a sequential scan would run for tens of seconds.
 *  3. if that times out too run the plain sequential scan again with what is left. Patterns under 3
 *     characters (two-letter state codes such as "TX") skip step 2: no text index can serve them. Attempt 1: attempt 1 already
 *     pulled part of the table into cache, so the same scan is much faster the second time.
 *
 * Vector (semantic) queries keep the index-only plan. Non-timeout errors are never retried.
 */
const SEQ_FIRST_MS = () => parseInt(process.env.SEARCH_SEQ_FIRST_MS, 10) || 1500;
const INDEX_PLAN = ["SET LOCAL enable_seqscan = off;"];
const SEQ_PLAN = ["SET LOCAL enable_bitmapscan = off;", "SET LOCAL enable_indexscan = off;", "SET LOCAL enable_indexonlyscan = off;"];
const isTimeout = (err) => err && err.code === "57014";

/** True when a bound LIKE pattern is too short for a trigram index ("%TX%", "WY%": under 3 characters). */
const hasTinyPattern = (params) =>
  (params || []).some((p) => typeof p === "string" && p.includes("%") && p.replace(/%/g, "").length > 0 && p.replace(/[%\\]/g, "").length < 3);

async function runFilteredSearch(directQuery, sql, params, totalMs, { vector = false } = {}) {
  if (vector) return directQuery(sql, params, INDEX_PLAN, totalMs);
  const quick = Math.max(1, Math.min(SEQ_FIRST_MS(), Math.floor(totalMs / 3)));
  try {
    return await directQuery(sql, params, SEQ_PLAN, quick);
  } catch (err) {
    if (!isTimeout(err)) throw err;
  }
  // No text index can serve a 1-2 character pattern: go straight to a second sequential scan, which
  // runs against the cache attempt 1 just warmed, with the whole remaining budget.
  if (hasTinyPattern(params)) return directQuery(sql, params, SEQ_PLAN, Math.max(1, totalMs - quick));
  const rest = totalMs - quick;
  const indexMs = Math.max(1, Math.floor(rest * 0.75));
  try {
    return await directQuery(sql, params, INDEX_PLAN, indexMs);
  } catch (err) {
    if (!isTimeout(err)) throw err;
  }
  return directQuery(sql, params, SEQ_PLAN, Math.max(1, rest - indexMs));
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

// A value with no letter or digit ("%", "_", "--") cannot match a real city / state / title. Used to answer
// "no rows" instantly instead of scanning 45M rows for a literal "%".
const hasNoSearchableChars = (v) => typeof v === "string" && v !== "" && !/[\p{L}\p{N}]/u.test(v);

module.exports = {
  hasNoSearchableChars,
  escapeLike, escapeRegex, hasWord, jobTitleCondition, INDIA_STATES, INDIA_STATES_SQL,
  exactCappedTotal, EXACT_COUNT_CAP, searchTimeoutMs, maxResultWindow, sortRowLimit,
  resultWindowError, checkSortAllowed, sendSearchError, runFilteredSearch,
  INDEX_PLAN,
};
