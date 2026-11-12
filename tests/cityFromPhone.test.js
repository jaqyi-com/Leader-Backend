"use strict";
// scripts/fill_city_from_phone.py: fills empty cities outside India / USA from landline area codes,
// logs every fill, and --revert undoes them exactly. Runs against the throwaway PostgreSQL.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { startStack, available } = require("./helpers/stack");

const SCRIPT = path.join(__dirname, "..", "scripts", "fill_city_from_phone.py");
const pythonReady = spawnSync("python3", ["-c", "import phonenumbers, psycopg2"]).status === 0;
const skip = (!available.postgres && "PostgreSQL not installed") || (!pythonReady && "python3 with phonenumbers + psycopg2 not installed");
let stack, user;

const run = (mode) => execFileSync("python3", [SCRIPT, mode], { env: { ...process.env, NEON_DATABASE_URL: stack.pg.url }, encoding: "utf8" });
const company = async (name) => (await stack.pg.pool.query("select city, state from final.companies where business_name = $1", [name])).rows[0];
const person = async (name) => (await stack.pg.pool.query("select city, state from final.people where full_name = $1", [name])).rows[0];

test.before(async () => {
  if (skip) return;
  stack = await startStack();
  user = await stack.newUser("cityphone");
  const q = (sql, v) => stack.pg.pool.query(sql, v);
  const co = (name, phone, pc, city, state, geo = null) => q(
    "insert into final.companies (business_name, phone, phone_country, city, state, geo_source, created_at) values ($1,$2,$3,$4,$5,$6,'2026-01-01')",
    [name, phone, pc, city, state, geo]);
  await co("UK known", "+442075620400", "GB", "London", null);            // London exists as a UK city
  await co("UK landline", "+442073885560", "GB", null, null);             // 020 → London
  await co("UK mobile", "+447911123456", "GB", "", null);                 // mobile: no place
  await co("DE known", "+498912345678", "DE", "München", null);
  await co("DE landline", "+4989987654", "DE", null, null);               // 089 → Munich → stored "München"
  await co("DE berlin", "+4930123456", "DE", null, null);                 // 030 → Berlin (fixture Germany companies have Berlin)
  await co("BR region", "+553133334444", "BR", null, null);               // 031 → Minas Gerais-area, no Brazilian city stored
  await co("CA landline", "+14162031234", "CA", null, null);              // 416-203 → "Toronto, ON"
  await co("CA province", "+14165550123", "CA", null, null);             // → "Ontario" only: not filled
  await co("US address", "+442071234567", "GB", null, "NY", "us_zip");    // USA by address: never filled
  await q("insert into final.people (full_name, phones, phone_country, city, state, location, created_at) values ($1,$2,$3,$4,$5,$6,'2026-01-01')",
    ["Indian in Dubai", "{+97143123456}", "AE", null, "Kerala", "Kochi, India"]); // Indian address: never filled
  await q("insert into final.people (full_name, phones, phone_country, city, state, created_at) values ($1,$2,$3,$4,$5,'2026-01-01')",
    ["Dubai known", "{+97143999999}", "AE", "Dubai", null]);
  await q("insert into final.people (full_name, phones, phone_country, city, state, created_at) values ($1,$2,$3,$4,$5,'2026-01-01')",
    ["Dubai landline", "{+97143888888}", "AE", null, null]);
});
test.after(async () => { if (stack) await stack.stop(); });

test("dry run writes nothing", { skip }, async () => {
  const out = run("--dry-run");
  assert.match(out, /dry run: nothing written/);
  assert.equal((await company("UK landline")).city, null);
});

test("--apply fills only safe cities, in the stored spelling, and logs them", { skip }, async () => {
  run("--apply");
  assert.equal((await company("UK landline")).city, "London");
  assert.equal((await company("DE landline")).city, "München", "Munich written as the stored German spelling");
  assert.equal((await company("DE berlin")).city, "Berlin", "fixture Germany companies already have Berlin");
  assert.equal((await company("BR region")).city, null, "a place that is not a known city of the country is not written");
  assert.deepEqual(await company("CA landline"), { city: "Toronto", state: "ON" }, "Canada: city + province");
  assert.equal((await company("CA province")).city, null, "a province-wide number gives no city");
  assert.equal((await company("UK mobile")).city, "", "mobile numbers name no place");
  assert.equal((await company("US address")).city, null, "a US-address row is a USA company: untouched");
  assert.equal((await person("Indian in Dubai")).city, null, "an Indian-address person is not given a Dubai city");
  assert.equal((await person("Dubai landline")).city, "Dubai");
  assert.equal((await company("UK known")).city, "London", "existing cities are never changed");
  const log = (await stack.pg.pool.query("select tbl, count(*)::int n from final.city_phone_fills group by tbl order by tbl")).rows;
  assert.deepEqual(log, [{ tbl: "companies", n: 4 }, { tbl: "people", n: 1 }]);
  // filled rows are found by the search: country + city
  const r = await stack.http("GET", "/api/final-companies?country=GB&f_city=London&limit=50", { token: user.token });
  assert.deepEqual(r.json.records.map((x) => x.business_name).sort(), ["UK known", "UK landline"]);
  // running again changes nothing
  run("--apply");
  assert.equal((await stack.pg.pool.query("select count(*)::int n from final.city_phone_fills")).rows[0].n, 5);
});

test("--revert restores the previous values exactly", { skip }, async () => {
  run("--revert");
  assert.equal((await company("UK landline")).city, null);
  assert.deepEqual(await company("CA landline"), { city: null, state: null });
  assert.equal((await person("Dubai landline")).city, null);
  assert.equal((await company("UK known")).city, "London");
  assert.equal((await stack.pg.pool.query("select count(*)::int n from final.city_phone_fills")).rows[0].n, 0);
});
