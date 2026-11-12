#!/usr/bin/env python3
"""
Fill the empty city of companies / people outside India and the USA from their landline number.

A landline's area code names a place (UK 020 -> London, Germany 089 -> München). Google's free
libphonenumber data (Python package `phonenumbers`) gives that place offline. Mobile numbers carry
no place and are skipped.

Only safe fills are made:
  * only rows whose city is empty, and that count for a country other than India / USA under the
    country rules in src/utils/countries.js (an Indian address with a Dubai number is left alone);
  * Canada: only "City, ON"-style places (a bare "Ontario" means the whole province), and the
    province fills an empty state;
  * other countries: only places that already exist as a city of that country in the data, under
    the English or local spelling (Munich = München). Regions ("Minas Gerais") never match a city.
    The stored spelling is written, so the new rows join the existing city cards.

Every fill is logged in final.city_phone_fills (table, uuid, city, previous state), so it can be
undone exactly with --revert.

Usage:
  python3 scripts/fill_city_from_phone.py            # dry run: what would be filled (read-only)
  python3 scripts/fill_city_from_phone.py --apply    # write the fills
  python3 scripts/fill_city_from_phone.py --revert   # undo every logged fill
Needs: pip install phonenumbers psycopg2-binary; NEON_DATABASE_URL (or .env in the project root).
After --apply or --revert, run scripts/refresh_world_cities.js to recount the city cards.
"""
import collections
import json
import os
import re
import subprocess
import sys
import unicodedata

import phonenumbers
import psycopg2
import psycopg2.extras
from phonenumbers import geocoder

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABLES = ("companies", "people")
CA_PROVINCES = {"ON", "BC", "QC", "AB", "MB", "NS", "SK", "NB", "NL", "PE", "NT", "YT", "NU"}
# Language of the local place names, so "Munich" can also be matched as "München".
LOCAL_LANG = {
    "DE": "de", "AT": "de", "CH": "de", "FR": "fr", "BE": "fr", "LU": "fr", "IT": "it", "ES": "es", "MX": "es",
    "AR": "es", "CL": "es", "CO": "es", "PE": "es", "NL": "nl", "PL": "pl", "SE": "sv", "BR": "pt", "PT": "pt",
    "RU": "ru", "JP": "ja", "CZ": "cs", "FI": "fi", "NO": "no", "DK": "da", "GR": "el", "TR": "tr", "RO": "ro",
    "HU": "hu", "KR": "ko", "CN": "zh", "TW": "zh",
}


def database_url():
    url = os.environ.get("NEON_DATABASE_URL")
    if url:
        return url
    env = os.path.join(ROOT, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf8"):
            m = re.match(r"\s*NEON_DATABASE_URL\s*=\s*['\"]?([^'\"\n]+)", line)
            if m:
                return m.group(1).strip()
    sys.exit("NEON_DATABASE_URL is not set")


def other_country_where(table):
    """SQL: the row counts for a country other than India / USA (rules from src/utils/countries.js)."""
    fn = "companiesCountryWhere" if table == "companies" else "peopleCountryWhere"
    js = (f"const c = require({json.dumps(os.path.join(ROOT, 'src/utils/countries.js'))});"
          f"process.stdout.write(c.{fn}('DE'));")
    env = {**os.environ, "NEON_DATABASE_URL": os.environ.get("NEON_DATABASE_URL", "postgresql://unused@127.0.0.1:1/x")}
    sql = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True, env=env).stdout
    placeholder = "\"phone_country\" = 'DE' AND "
    if placeholder not in sql:
        sys.exit("unexpected country rule from src/utils/countries.js: " + sql[:200])
    return sql.replace(placeholder, "", 1)


def key(name):
    """Comparison key: accents and case removed ("München" == "munchen"); non-Latin names kept."""
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower().strip()
    return folded or name.lower().strip()


def first_part(place):
    """"Osaka, Osaka" -> "Osaka", "São Paulo - SP" -> "São Paulo"; multi-area "A/B/C" -> None."""
    part = re.split(r",| - | \(", place)[0].strip()
    return None if (not part or "/" in part) else part


def phone_place(number, country):
    """(English place, local-language place) for a number, or (None, None) for mobiles / country-wide."""
    try:
        n = phonenumbers.parse(number or "", None)
    except phonenumbers.NumberParseException:
        return None, None
    en = geocoder.description_for_number(n, "en")
    if not en or en == geocoder.country_name_for_number(n, "en"):
        return None, None
    return en, geocoder.description_for_number(n, LOCAL_LANG.get(country, "en")) or en


def number_of(row):
    if row.get("phone_e164"):
        return row["phone_e164"]
    for value in (row.get("phone"), row.get("phones")):
        m = re.search(r"\+\d{6,15}", value or "")
        if m:
            return m.group(0)
    return None


def decide(row, spellings):
    """(city, province or None) to write, or None. spellings: (country, key) -> Counter of stored spellings."""
    country = row["phone_country"]
    en, local = phone_place(number_of(row), country)
    if not en:
        return None
    if country == "CA":
        m = re.match(r"^(.+), ([A-Z]{2})$", en)
        if not m or m.group(2) not in CA_PROVINCES:
            return None
        stored = spellings.get((country, key(m.group(1))))
        return (stored.most_common(1)[0][0] if stored else m.group(1)), m.group(2)
    for candidate in (first_part(local), first_part(en)):
        stored = candidate and spellings.get((country, key(candidate)))
        if stored:
            return stored.most_common(1)[0][0], None
    return None


def columns(cur, table):
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = 'final' AND table_name = %s", (table,))
    return {r[0] for r in cur.fetchall()}


def plan(cur):
    """Rows to fill per table: [(uuid, city, province)]."""
    rows = {}
    for table in TABLES:
        cols = columns(cur, table)
        wanted = [c for c in ("uuid", "phone_country", "phone_e164", "phone", "phones", "city", "state") if c in cols]
        cur.execute(f"SELECT {', '.join(wanted)} FROM final.{table} "
                    f"WHERE phone_country NOT IN ('IN', 'US') AND {other_country_where(table)}")
        rows[table] = [dict(zip(wanted, r)) for r in cur.fetchall()]
    # Cities that already exist per country (both tables), with their spellings.
    spellings = collections.defaultdict(collections.Counter)
    for table in TABLES:
        for r in rows[table]:
            city = (r.get("city") or "").strip()
            if city:
                spellings[(r["phone_country"], key(city))][city] += 1
    fills = {}
    for table in TABLES:
        fills[table] = []
        for r in rows[table]:
            if (r.get("city") or "").strip():
                continue
            d = decide(r, spellings)
            if d:
                fills[table].append((str(r["uuid"]), d[0], d[1], r["phone_country"]))
    return rows, fills


def report(rows, fills):
    for table in TABLES:
        empty = sum(1 for r in rows[table] if not (r.get("city") or "").strip())
        print(f"{table}: {len(rows[table])} rows outside India/USA, {empty} without a city, {len(fills[table])} get one")
        per = collections.defaultdict(collections.Counter)
        for _, city, prov, country in fills[table]:
            per[country][city + (f" ({prov})" if prov else "")] += 1
        for country, places in sorted(per.items(), key=lambda kv: -sum(kv[1].values()))[:12]:
            top = ", ".join(f"{p} {n}" for p, n in places.most_common(5))
            print(f"  {country} +{sum(places.values())}: {top}")


LOG_DDL = """CREATE TABLE IF NOT EXISTS final.city_phone_fills (
  tbl text NOT NULL, uuid uuid NOT NULL, city text NOT NULL, state text, prev_state text,
  filled_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tbl, uuid))"""


def apply(conn, fills):
    with conn.cursor() as cur:
        cur.execute(LOG_DDL)
        for table in TABLES:
            done = 0
            for i in range(0, len(fills[table]), 1000):
                batch = [(u, c, p) for u, c, p, _ in fills[table][i:i + 1000]]
                # Only still-empty cities are filled; the previous state is logged for --revert.
                cur.execute(f"""
                    WITH v(uuid, city, state) AS (SELECT * FROM unnest(%s::uuid[], %s::text[], %s::text[])),
                    upd AS (
                      UPDATE final.{table} t
                         SET city = v.city,
                             state = CASE WHEN v.state IS NOT NULL AND (t.state IS NULL OR btrim(t.state) = '') THEN v.state ELSE t.state END
                        FROM v, final.{table} old
                       WHERE t.uuid = v.uuid AND old.uuid = t.uuid AND (t.city IS NULL OR btrim(t.city) = '')
                   RETURNING t.uuid, v.city, t.state, old.state AS prev_state)
                    INSERT INTO final.city_phone_fills (tbl, uuid, city, state, prev_state)
                    SELECT %s, uuid, city, state, prev_state FROM upd
                    ON CONFLICT (tbl, uuid) DO NOTHING""",
                    ([b[0] for b in batch], [b[1] for b in batch], [b[2] for b in batch], table))
                done += cur.rowcount
                conn.commit()
            print(f"{table}: filled {done}")


def revert(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('final.city_phone_fills')")
        if cur.fetchone()[0] is None:
            print("nothing to revert")
            return
        for table in TABLES:
            # Only rows still holding the filled city are reset (a later real edit is kept).
            cur.execute(f"""
                WITH gone AS (
                  UPDATE final.{table} t
                     SET city = NULL,
                         state = CASE WHEN t.state IS NOT DISTINCT FROM f.state THEN f.prev_state ELSE t.state END
                    FROM final.city_phone_fills f
                   WHERE f.tbl = %s AND f.uuid = t.uuid AND t.city = f.city
                RETURNING t.uuid)
                DELETE FROM final.city_phone_fills f USING gone WHERE f.tbl = %s AND f.uuid = gone.uuid""", (table, table))
            print(f"{table}: reverted {cur.rowcount}")
        conn.commit()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--dry-run"
    if mode not in ("--dry-run", "--apply", "--revert"):
        sys.exit(__doc__)
    conn = psycopg2.connect(database_url())
    if mode == "--revert":
        revert(conn)
        return
    with conn.cursor() as cur:
        rows, fills = plan(cur)
    conn.rollback()
    report(rows, fills)
    if mode == "--apply":
        apply(conn, fills)
    else:
        print("dry run: nothing written (use --apply)")


if __name__ == "__main__":
    main()
