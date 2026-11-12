"use strict";
// Shared by the card counters (worldCities.js, explorerCards.js).

/**
 * Exact count for each card: the card's search WHERE clause (the same buildWhere the People /
 * Companies routes use, with the URL filters the card sends) summed over a grouped table.
 * `aggSql` groups the base rows down to the columns the clauses use (column n = rows per group), so
 * the costly scan happens once and every card's filter runs on the small aggregate.
 * `kindCond` (optional per card) restricts which aggregate rows a card may sum.
 */
async function countCards(db, aggSql, cards, whereFor) {
  if (!cards.length) return [];
  const values = [];
  const sums = cards.map((card, i) => {
    const { whereStr, values: v } = whereFor(card);
    const offset = values.length;
    values.push(...v);
    const cond = whereStr.replace(/^WHERE /, "").replace(/\$(\d+)/g, (_, d) => `$${Number(d) + offset}`);
    const kind = card.kindCond ? `${card.kindCond} AND ` : "";
    return `COALESCE(sum(n) FILTER (WHERE ${kind}${cond}), 0)::bigint AS c${i}`;
  });
  const { rows } = await db.query(`WITH agg AS MATERIALIZED (${aggSql}) SELECT ${sums.join(",\n")} FROM agg`, values);
  return cards.map((card, i) => ({ ...card, count: Number(rows[0][`c${i}`]) }));
}

/** Pages of a table, for splitting a full scan into block ranges (ctid >= (a,0) AND ctid < (b,0)). */
async function tablePages(db, table) {
  const { rows } = await db.query(
    `SELECT (pg_relation_size($1::regclass) / current_setting('block_size')::int)::bigint AS pages`, [table]);
  return Number(rows[0].pages);
}

/** SQL condition for block range [from, to) of a table (to = null: to the end, so new rows are included). */
const blockRange = (from, to) =>
  to === null || to === undefined
    ? `ctid >= '(${Number(from)},0)'::tid`
    : `ctid >= '(${Number(from)},0)'::tid AND ctid < '(${Number(to)},0)'::tid`;

/** Split [0, pages) into n ranges; the last one is open-ended. */
function ranges(pages, n) {
  const size = Math.max(1, Math.ceil(pages / n));
  const out = [];
  for (let from = 0; from < pages || out.length === 0; from += size) {
    const to = from + size >= pages ? null : from + size;
    out.push([from, to]);
    if (to === null) break;
  }
  return out;
}

module.exports = { countCards, tablePages, blockRange, ranges };
