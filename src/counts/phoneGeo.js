"use strict";
// Place named by a landline's area code ("+44 20 …" → London), for countries other than India / USA.
// Data: src/counts/phoneGeo.json.gz, built from Google's libphonenumber by scripts/build_phone_geo.py.
// Loaded on first use (~9 MB in memory) — only the nightly count job needs it.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const FILE = path.join(__dirname, "phoneGeo.json.gz");
let PREFIXES = null;
let MAX_LEN = 0;

function load() {
  if (!PREFIXES) {
    PREFIXES = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString("utf8")).prefixes;
    for (const p of Object.keys(PREFIXES)) if (p.length > MAX_LEN) MAX_LEN = p.length;
  }
  return PREFIXES;
}

/** Digits of the first international number in a value ("+44 20 7388 5560", "{+4930…}"), or null. */
function digitsOf(value) {
  const m = String(value || "").match(/\+[\d\s().-]{6,24}/);
  if (!m) return null;
  const d = m[0].replace(/\D/g, "");
  return d.length >= 7 && d.length <= 15 ? d : null;
}

/** { en, local } for a number (longest matching prefix), or null when the number names no place. */
function placeFor(number) {
  const digits = digitsOf(number);
  if (!digits) return null;
  const table = load();
  for (let len = Math.min(MAX_LEN, digits.length); len >= 2; len--) {
    const hit = table[digits.slice(0, len)];
    if (hit) return { en: hit[0], local: hit[1] || hit[0] };
  }
  return null;
}

module.exports = { placeFor, digitsOf };
