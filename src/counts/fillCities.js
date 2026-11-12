"use strict";
// ============================================================
// FILL EMPTY CITIES FROM LANDLINE NUMBERS (countries other than India / USA)
// ============================================================
// A landline's area code names a place (UK 020 → London, Germany 089 → München; phoneGeo.js).
// Only safe fills are made:
//   * only rows whose city is empty and that count for a country other than India / USA under the
//     country rules (an Indian address with a Dubai number is left alone);
//   * Canada: only "City, ON"-style places (a bare "Ontario" is the whole province); the province
//     fills an empty state;
//   * other countries: only places that already exist as a city of that country in the data, under
//     the English or local spelling (Munich = München); the stored spelling is written, so new rows
//     join the existing city cards. Regions ("Minas Gerais") never match a city.
// Every fill is logged in final.city_phone_fills (table, uuid, city, previous state); revert()
// undoes them exactly. Run nightly by the count job (src/counts/job.js).
// ============================================================

const { placeFor } = require("./phoneGeo");
const { peopleCountryWhere, companiesCountryWhere, countryName } = require("../utils/countries");

const TABLES = ["companies", "people"];
const CA_PROVINCES = new Set(["ON", "BC", "QC", "AB", "MB", "NS", "SK", "NB", "NL", "PE", "NT", "YT", "NU"]);

const LOG_DDL = `CREATE TABLE IF NOT EXISTS final.city_phone_fills (
  tbl text NOT NULL, uuid uuid NOT NULL, city text NOT NULL, state text, prev_state text,
  filled_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tbl, uuid))`;

/** SQL: the row counts for a country other than India / USA (same rules as the search). */
function otherCountryWhere(table) {
  const sql = (table === "companies" ? companiesCountryWhere : peopleCountryWhere)("DE");
  const placeholder = `"phone_country" = 'DE' AND `;
  if (!sql.includes(placeholder)) throw new Error("unexpected country rule: " + sql.slice(0, 120));
  return `"phone_country" NOT IN ('IN', 'US') AND ${sql.replace(placeholder, "")}`;
}

/** Comparison key: accents and case removed ("München" == "munchen"); non-Latin names kept. */
function key(name) {
  const folded = name.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().trim();
  return folded || name.toLowerCase().trim();
}

/** "Osaka, Osaka" → "Osaka", "São Paulo - SP" → "São Paulo"; multi-area "A/B/C" → null. */
function firstPart(place) {
  const part = String(place || "").split(/,| - | \(/)[0].trim();
  return !part || part.includes("/") ? null : part;
}

const numberOf = (row) => row.phone_e164 || row.phone || row.phones || null;

/** [city, province or null] to write for a row, or null. spellings: Map "CC|key" → Map spelling → n. */
function decide(row, spellings) {
  const country = row.phone_country;
  const place = placeFor(numberOf(row));
  if (!place || place.en === countryName(country)) return null;
  const stored = (name) => {
    const m = name && spellings.get(`${country}|${key(name)}`);
    return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
  };
  if (country === "CA") {
    const m = place.en.match(/^(.+), ([A-Z]{2})$/);
    if (!m || !CA_PROVINCES.has(m[2])) return null;
    return [stored(m[1]) || m[1], m[2]];
  }
  for (const candidate of [firstPart(place.local), firstPart(place.en)]) {
    const s = stored(candidate);
    if (s) return [s, null];
  }
  return null;
}

async function columns(db, table) {
  const { rows } = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'final' AND table_name = $1", [table]);
  return new Set(rows.map((r) => r.column_name));
}

/** What would be filled: { companies: [[uuid, city, province, country]], people: [...] } plus row stats. */
async function plan(db) {
  const rows = {};
  for (const table of TABLES) {
    const cols = await columns(db, table);
    const wanted = ["uuid", "phone_country", "phone_e164", "phone", "phones", "city"].filter((c) => cols.has(c));
    rows[table] = (await db.query(`SELECT ${wanted.join(", ")} FROM final.${table} WHERE ${otherCountryWhere(table)}`)).rows;
  }
  const spellings = new Map();
  for (const table of TABLES) {
    for (const r of rows[table]) {
      const city = String(r.city || "").trim();
      if (!city) continue;
      const k = `${r.phone_country}|${key(city)}`;
      if (!spellings.has(k)) spellings.set(k, new Map());
      const m = spellings.get(k);
      m.set(city, (m.get(city) || 0) + 1);
    }
  }
  const fills = {}; const stats = {};
  for (const table of TABLES) {
    fills[table] = [];
    let empty = 0;
    for (const r of rows[table]) {
      if (String(r.city || "").trim()) continue;
      empty++;
      const d = decide(r, spellings);
      if (d) fills[table].push([String(r.uuid), d[0], d[1], r.phone_country]);
    }
    stats[table] = { rows: rows[table].length, withoutCity: empty, fill: fills[table].length };
  }
  return { fills, stats };
}

/** Write the fills (only still-empty cities), logging each one. Returns { companies: n, people: n }. */
async function apply(db, fills) {
  await db.query(LOG_DDL);
  const done = {};
  for (const table of TABLES) {
    done[table] = 0;
    const list = fills[table] || [];
    for (let i = 0; i < list.length; i += 1000) {
      const batch = list.slice(i, i + 1000);
      const r = await db.query(`
        WITH v(uuid, city, state) AS (SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[])),
        upd AS (
          UPDATE final.${table} t
             SET city = v.city,
                 state = CASE WHEN v.state IS NOT NULL AND (t.state IS NULL OR btrim(t.state) = '') THEN v.state ELSE t.state END
            FROM v, final.${table} old
           WHERE t.uuid = v.uuid AND old.uuid = t.uuid AND (t.city IS NULL OR btrim(t.city) = '')
       RETURNING t.uuid, v.city, t.state, old.state AS prev_state)
        INSERT INTO final.city_phone_fills (tbl, uuid, city, state, prev_state)
        SELECT $4, uuid, city, state, prev_state FROM upd
        ON CONFLICT (tbl, uuid) DO NOTHING`,
        [batch.map((b) => b[0]), batch.map((b) => b[1]), batch.map((b) => b[2]), table]);
      done[table] += r.rowCount;
    }
  }
  return done;
}

/** Undo every logged fill whose city is still the filled one. Returns { companies: n, people: n }. */
async function revert(db) {
  const exists = (await db.query("SELECT to_regclass('final.city_phone_fills') AS t")).rows[0].t;
  const done = { companies: 0, people: 0 };
  if (!exists) return done;
  for (const table of TABLES) {
    const r = await db.query(`
      WITH gone AS (
        UPDATE final.${table} t
           SET city = NULL,
               state = CASE WHEN t.state IS NOT DISTINCT FROM f.state THEN f.prev_state ELSE t.state END
          FROM final.city_phone_fills f
         WHERE f.tbl = $1 AND f.uuid = t.uuid AND t.city = f.city
     RETURNING t.uuid)
      DELETE FROM final.city_phone_fills f USING gone WHERE f.tbl = $1 AND f.uuid = gone.uuid`, [table]);
    done[table] = r.rowCount;
  }
  return done;
}

module.exports = { plan, apply, revert, decide, key, firstPart, otherCountryWhere, LOG_DDL };
