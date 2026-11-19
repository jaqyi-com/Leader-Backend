// @ts-check
// "Checks" column: every record shows how its email and phone were checked and when; the raw check
// fields are hidden from the table but stay in the CSV export. API rows are synthetic.
const { test, expect } = require("@playwright/test");
const fs = require("fs");

const API = process.env.E2E_API;
const USER = { name: "Badge User", email: "e2e.badges@example.test", password: "Passw0rd!e2e4" };
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const COLUMNS = ["business_name", "phone", "emails", "email_status", "email_verified_at", "phone_status", "phone_line_type", "phone_e164", "phone_verified_at", "city"];
const ROWS = [
  { business_name: "Alpha", phone: "+919876500001", emails: "{a@alpha.test}", email_status: "deliverable", email_verified_at: daysAgo(3), phone_status: "valid", phone_line_type: "mobile", phone_e164: "+919876500001", phone_verified_at: daysAgo(12), city: "Pune" },
  { business_name: "Beta", phone: "+12025550100", emails: "{b@beta.test}", email_status: "risky", email_verified_at: daysAgo(40), phone_status: "valid", phone_line_type: "fixed_or_mobile", phone_e164: "+12025550100", phone_verified_at: daysAgo(0), city: "Austin" },
  { business_name: "Gamma", phone: "12345", emails: "{g@gamma.test}", email_status: "undeliverable", email_verified_at: daysAgo(1), phone_status: "invalid", phone_line_type: "", phone_e164: "", phone_verified_at: daysAgo(90), city: "Delhi" },
  { business_name: "Delta", phone: "+919876500004", emails: "{d@delta.test}", email_status: "pending", email_verified_at: "", phone_status: "", phone_line_type: "", phone_e164: "", phone_verified_at: "", city: "Goa" },
  { business_name: "Epsilon", phone: "", emails: "", email_status: "pending", email_verified_at: "", phone_status: "", phone_line_type: "", phone_e164: "", phone_verified_at: "", city: "Agra" },
];

test.beforeAll(async ({ request }) => {
  const r = await request.post(`${API}/api/auth/register`, { data: { ...USER, orgName: "Badge Org" } });
  expect([201, 409, 400]).toContain(r.status());
});

test("Companies: Checks badges per record, raw check columns hidden, still exported", async ({ page }) => {
  await page.route(/\/api\/final-companies(\/columns|\/stats)?(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/columns")) return route.fulfill({ json: { columns: COLUMNS } });
    if (url.pathname.endsWith("/stats")) return route.fulfill({ json: { total: ROWS.length } });
    return route.fulfill({ json: { records: ROWS, total: ROWS.length, total_exact: true } });
  });
  await page.goto("/login");
  await page.locator("#login-email").fill(USER.email);
  await page.locator("#login-password").fill(USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\/\w+/);
  await page.goto("/app/companies");
  await expect(page.getByText("Alpha", { exact: true })).toBeVisible();

  const row = (name) => page.locator("tbody tr").filter({ hasText: name });
  await expect(page.getByRole("columnheader", { name: "Checks" })).toBeVisible();
  await expect(row("Alpha")).toContainText("Mobile· 12 days ago");
  await expect(row("Alpha")).toContainText("Email valid· 3 days ago");
  await expect(row("Beta")).toContainText("Phone valid· today");
  await expect(row("Beta")).toContainText("Email risky· 40 days ago");
  await expect(row("Gamma")).toContainText("Phone invalid· 3 months ago");
  await expect(row("Gamma")).toContainText("Email invalid· yesterday");
  await expect(row("Delta")).toContainText("Phone not checked");
  await expect(row("Delta")).toContainText("Email not checked");
  await expect(row("Epsilon").locator("td").nth(1)).toHaveText("—");
  // hover text explains the check
  await expect(row("Alpha").getByLabel(/Mobile: \+919876500001 .*numbering plan.*Checked/)).toBeVisible();
  await expect(row("Beta").getByLabel(/Email risky: b@beta.test .*catch-all/)).toBeVisible();

  // raw check fields are not table columns any more
  for (const h of ["Email Status", "Email Verified At", "Phone Status", "Phone Line Type", "Phone E164", "Phone Verified At"])
    await expect(page.getByRole("columnheader", { name: h, exact: true })).toHaveCount(0);
  await page.screenshot({ path: "e2e-results/check-badges.png" });

  // …but the CSV still carries them
  await page.getByRole("button", { name: /^Export CSV/ }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /All rows on this page/ }).click()]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  expect(csv.split("\r\n")[0]).toContain('"Email Status","Email Verified At","Phone Status"');
  expect(csv).toContain('"deliverable"');
});

test("People pages show the Checks column", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/\/api\/final-[a-z-]+(\/columns|\/stats)?(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/columns")) return route.fulfill({ json: { columns: ["full_name", "job_title", "emails", "phones", "email_status", "email_verified_at", "phone_status", "phone_line_type", "phone_verified_at"] } });
    if (url.pathname.endsWith("/stats")) return route.fulfill({ json: { total: 1 } });
    const records = [{ full_name: "Person One", job_title: "CEO", emails: "{p1@example.test}", phones: "{+919876543201}", email_status: "deliverable", email_verified_at: daysAgo(5), phone_status: "valid", phone_line_type: "mobile", phone_verified_at: daysAgo(2) }];
    return route.fulfill({ json: { records, total: 1, total_exact: true } });
  });
  await page.goto("/login");
  await page.locator("#login-email").fill(USER.email);
  await page.locator("#login-password").fill(USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\/\w+/);
  for (const path of ["/app/people", "/app/email", "/app/number"]) {
    await page.goto(path);
    const r = page.locator("tbody tr").filter({ hasText: "Person One" });
    await expect(r).toContainText("Mobile· 2 days ago");
    await expect(r).toContainText("Email valid· 5 days ago");
    await expect(page.getByRole("columnheader", { name: "Email Status", exact: true })).toHaveCount(0);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});
