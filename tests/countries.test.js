"use strict";
// Country filter: one set of rules for every search route (src/utils/countries.js).
// India / USA: address rules + phone-country fallback. Other countries: the phone number's country,
// unless the address says India / USA (the address wins).

const test = require("node:test");
const assert = require("node:assert/strict");
const { startStack, available } = require("./helpers/stack");

const skip = !available.postgres && "PostgreSQL not installed";
let stack, user;

test.before(async () => {
  if (skip) return;
  stack = await startStack();
  user = await stack.newUser("countries");
});
test.after(async () => { if (stack) await stack.stop(); });

async function all(route, qs) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const r = await stack.http("GET", `${route}?${qs}&limit=100&page=${page}`, { token: user.token });
    assert.equal(r.status, 200, `${route}?${qs}: ${JSON.stringify(r.json)}`);
    out.push(...r.json.records);
    if (r.json.records.length < 100) break;
  }
  return out;
}

test("normalizeCountry: names, codes and aliases; unknown input means no filter", () => {
  process.env.NEON_DATABASE_URL = process.env.NEON_DATABASE_URL || "postgresql://u@127.0.0.1:1/x";
  const { normalizeCountry, countryName } = require("../src/utils/countries");
  const cases = { india: "IN", IN: "IN", in: "IN", usa: "US", "United States": "US", us: "US", canada: "CA", CA: "CA",
    germany: "DE", de: "DE", uk: "GB", "United Kingdom": "GB", uae: "AE" };
  for (const [input, code] of Object.entries(cases)) assert.equal(normalizeCountry(input), code, input);
  for (const input of ["", "all", "xx", "EU", "Narnia", "'; drop table x; --", undefined]) assert.equal(normalizeCountry(input), null, String(input));
  assert.equal(countryName("DE"), "Germany");
});

test("companies: India and USA include phone-only rows; other countries use the phone country", { skip }, async () => {
  const C = stack.pg.companies;
  const R = "/api/final-companies";
  const expect = {
    US: C.filter((c) => ["us_zip", "us_city", "us_state"].includes(c.geo_source) || (c.phone_country === "US" && !["pincode", "csv_v2_import"].includes(c.geo_source))),
    IN: C.filter((c) => ["pincode", "csv_v2_import"].includes(c.geo_source) || (c.phone_country === "IN" && !["us_zip", "us_city", "us_state"].includes(c.geo_source))),
    CA: C.filter((c) => c.phone_country === "CA" && !c.geo_source),
    DE: C.filter((c) => c.phone_country === "DE" && !c.geo_source),
    GB: [], // its only company has a US address: it is a USA company, not a UK one
  };
  assert.ok(C.some((c) => c.phone_country === "GB"), "fixture has a GB number with a US address");
  assert.ok(expect.US.some((c) => c.geo_source === null), "fixture has a USA-by-phone company");
  for (const [code, rows] of Object.entries(expect)) {
    const got = await all(R, `country=${code}`);
    assert.deepEqual(got.map((r) => r.business_name).sort(), rows.map((r) => r.business_name).sort(), `country=${code}`);
  }
  // names and the f_country= form give the same rows
  assert.equal((await all(R, "f_country=germany")).length, expect.DE.length);
  assert.equal((await all(R, "f_country=India")).length, expect.IN.length);
  assert.equal((await all(R, "country=usa")).length, expect.US.length);
  // combines with other filters
  const deSoftware = await all(R, "country=DE&f_industry=Software");
  assert.equal(deSoftware.length, expect.DE.filter((c) => c.industry === "Software").length);
  // a country with no data returns nothing, and garbage is ignored instead of breaking the query
  assert.equal((await all(R, "country=FR")).length, 0);
  assert.equal((await stack.http("GET", `${R}?country=${encodeURIComponent("x' OR 1=1 --")}&limit=5`, { token: user.token })).status, 200);
});

test("people, emails and numbers: country codes and names on every route", { skip }, async () => {
  const P = stack.pg.rows;
  const INDIAN_STATES = ["Maharashtra", "Delhi", "Tamil Nadu"];
  const abroad = (r) => !INDIAN_STATES.includes(r.state) && r.state !== "TX";
  assert.ok(P.some((r) => r.phone_country === "CA" && INDIAN_STATES.includes(r.state)), "fixture has a CA number with an Indian address");
  const hasEmail = (r) => r.emails && r.emails !== "{}";
  const hasPhone = (r) => r.phones && r.phones !== "{}";
  for (const [route, base] of [["/api/final-people", P], ["/api/final-people-email", P.filter(hasEmail)], ["/api/final-people-number", P.filter(hasPhone)]]) {
    for (const code of ["DE", "CA"]) {
      const want = base.filter((r) => r.phone_country === code && abroad(r)).map((r) => r.full_name).sort();
      const got = (await all(route, `country=${code}`)).map((r) => r.full_name).sort();
      assert.deepEqual(got, want, `${route} country=${code}`);
    }
    // USA = the Texas rows (address rule); India = the Indian states, including foreign-number rows there
    assert.equal((await all(route, "country=US")).length, base.filter((r) => r.state === "TX").length, `${route} US`);
    assert.equal((await all(route, "country=india")).length, base.filter((r) => INDIAN_STATES.includes(r.state)).length, `${route} India`);
    // a city in another country keeps the country filter: country=CA&f_city=Toronto finds only Canadians
    const toronto = (await all(route, "country=CA&f_city=Toronto&f_state_eq=ON")).map((r) => r.full_name).sort();
    assert.deepEqual(toronto, base.filter((r) => r.phone_country === "CA" && r.city === "Toronto").map((r) => r.full_name).sort(), `${route} Toronto`);
    assert.equal((await all(route, "country=DE&f_city=Delhi")).length, 0, `${route} Delhi is not in Germany`);
  }
  // with a quick filter
  const deMobile = await all("/api/final-people", "country=CA&f_phone_status=mobile");
  assert.equal(deMobile.length, P.filter((r) => r.phone_country === "CA" && r.phone_status === "valid" && ["mobile", "fixed_or_mobile"].includes(r.phone_line_type)).length);
});

test("country totals are exact for small countries", { skip }, async () => {
  const r = await stack.http("GET", "/api/final-companies?country=DE&limit=5", { token: user.token });
  assert.equal(r.json.total, stack.pg.companies.filter((c) => c.phone_country === "DE").length);
  assert.equal(r.json.total_exact, true);
});

test("countryOnlyTotal: used only when country is the only filter", () => {
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
  const file = path.join(os.tmpdir(), `doott-country-counts-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify({ countries: [{ code: "DE", name: "Germany", people: 781, companies: 4092 }] }));
  process.env.COUNTRY_COUNTS_FILE = file;
  delete require.cache[require.resolve("../src/utils/countries")];
  const { countryOnlyTotal } = require("../src/utils/countries");
  assert.equal(countryOnlyTotal("companies", { country: "DE", page: "2", limit: "50" }), 4092);
  assert.equal(countryOnlyTotal("people", { f_country: "germany" }), 781);
  assert.equal(countryOnlyTotal("companies", { country: "DE", f_industry: "Software" }), null, "another filter → no shortcut");
  assert.equal(countryOnlyTotal("companies", { country: "DE", search: "acme" }), null);
  assert.equal(countryOnlyTotal("companies", { country: "FR" }), null, "unknown in the file → normal count");
  assert.equal(countryOnlyTotal("companies", {}), null);
  fs.rmSync(file, { force: true });
});

test("world city cards: Canadian province, Montréal spellings, and the card's URL filters", () => {
  process.env.NEON_DATABASE_URL = process.env.NEON_DATABASE_URL || "postgresql://u@127.0.0.1:1/x";
  const { cityCardParams, canonicalCity, candidates } = require("../scripts/refresh_world_cities");
  for (const raw of ["Montral", "Montréal", "Montr", "MontrÃ©al", "MONTREAL"]) assert.equal(canonicalCity(raw), "Montreal", raw);
  assert.equal(canonicalCity("TORONTO"), "Toronto");
  assert.deepEqual(cityCardParams("CA", { name: "Toronto", state: "ON" }), { country: "CA", f_city: "Toronto", f_state_eq: "ON" });
  assert.deepEqual(cityCardParams("DE", { name: "Berlin" }), { country: "DE", f_city: "Berlin" });
  const cards = candidates("CA", [
    { city: "Toronto", state: "ON", n: 30 }, { city: "TORONTO", state: "ON", n: 5 },
    { city: "Research Triangle Park", state: "NC", n: 99 }, // a US place: not a Canadian province
    { city: "Montral", state: "QC", n: 12 }, { city: "Montreal", state: "QC", n: 20 },
  ]);
  assert.deepEqual(cards.map((c) => [c.name, c.state, c.n]), [["Toronto", "ON", 35], ["Montreal", "QC", 32]]);
  // Indian / US city names and junk under another country are not offered as that country's cities
  const ae = candidates("AE", [{ city: "Dubai", n: 40 }, { city: "Delhi", n: 300 }, { city: "Hyd", n: 50 }, { city: "Kerala", n: 80 }, { city: "Other Than India", n: 30 }]);
  assert.deepEqual(ae.map((c) => c.name), ["Dubai"]);
  // non-Latin city names are real cities
  assert.deepEqual(candidates("RU", [{ city: "г. Москва", n: 40 }, { city: "--", n: 40 }]).map((c) => c.name), ["г. Москва"]);
});
