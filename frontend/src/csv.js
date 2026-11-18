// CSV download for the data pages (Companies, People, Emails, Numbers).
//
// - Opens cleanly in Excel: UTF-8 byte-order mark (₹, é, Hindi names), CRLF line ends.
// - List cells stored as PostgreSQL arrays ("{a@x.com,b@y.com}") become "a@x.com; b@y.com".
// - Cells starting with = + - @ get a leading ' so a spreadsheet never runs them as formulas
//   (CSV injection), except plain numbers such as -12.5 and phone numbers such as +919812345678.

const PG_ARRAY = /^\{.*\}$/s;

/** "{a,b}" → "a; b"; "{}" → "". Other values unchanged. */
export function cellText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join("; ");
  const s = String(value);
  if (!PG_ARRAY.test(s)) return s;
  return s.slice(1, -1).split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean).join("; ");
}

/** Neutralise spreadsheet formulas (keeps numbers and +phone numbers as they are). */
export function safeCell(text) {
  if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d\s().-]+$/.test(text)) return `'${text}`;
  return text;
}

const quote = (text) => `"${text.replace(/"/g, '""')}"`;

/** CSV text for rows, with columns [{ key, label }]. */
export function toCsv(cols, rows) {
  const lines = [cols.map((c) => quote(String(c.label ?? c.key)))];
  for (const r of rows) lines.push(cols.map((c) => quote(safeCell(cellText(r[c.key])))).join(","));
  return lines.map((l) => (Array.isArray(l) ? l.join(",") : l)).join("\r\n") + "\r\n";
}

/** Download rows as a CSV file. Returns the number of rows written. */
export function downloadCsv(filename, cols, rows) {
  if (!cols.length || !rows.length) return 0;
  const blob = new Blob(["﻿", toCsv(cols, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length;
}

/** "companies_selected_2026-11-18.csv" */
export const csvName = (base, what) => `${base}_${what}_${new Date().toISOString().slice(0, 10)}.csv`;
