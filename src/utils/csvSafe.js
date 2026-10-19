"use strict";
// CSV formula-injection (CWE-1236) protection.
// Spreadsheet apps execute cells beginning with = + - @ (or tab/CR). Prefixing a single quote
// makes them inert text. Negative numbers and phone numbers with a leading "+" are left alone.

const DANGEROUS_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

function neutralizeCell(value) {
  if (typeof value !== "string") return value;
  if (!DANGEROUS_START.test(value)) return value;
  if (PLAIN_NUMBER.test(value)) return value;
  return `'${value}`;
}

function neutralizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = neutralizeCell(v);
  return out;
}

/** Make a user-influenced filename safe for a Content-Disposition header. */
function safeFilename(name, fallback = "download.csv") {
  const cleaned = String(name || "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 100);
  return cleaned || fallback;
}

module.exports = { neutralizeCell, neutralizeRow, safeFilename };
