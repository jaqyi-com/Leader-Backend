// @ts-check
// Selective CSV export on the data pages: tick rows (across pages, Shift-click ranges), then
// export only those, or every row on the page. The Companies API is answered with synthetic rows
// (the e2e database has no lead data).
const { test, expect } = require("@playwright/test");
const fs = require("fs");

const API = process.env.E2E_API;
const USER = { name: "Export User", email: "e2e.export@example.test", password: "Passw0rd!e2e3" };
const TOTAL = 60;
const row = (i) => ({
  business_name: `Company ${String(i).padStart(2, "0")}`,
  phone: `+9198765${String(43200 + i)}`,
  emails: i === 1 ? "{a1@example.test,b1@example.test}" : `{c${i}@example.test}`,
  industry: i === 2 ? "=HYPERLINK(\"http://x\")" : "Software",
  city: "Pune",
});

test.beforeAll(async ({ request }) => {
  const r = await request.post(`${API}/api/auth/register`, { data: { ...USER, orgName: "Export Org" } });
  expect([201, 409, 400]).toContain(r.status());
});

async function readDownload(download) {
  const file = await download.path();
  return fs.readFileSync(file, "utf8");
}

test("tick rows on two pages and export only those; or export the whole page", async ({ page }) => {
  await page.route(/\/api\/final-companies(\/columns|\/stats)?(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/columns")) return route.fulfill({ json: { columns: ["business_name", "phone", "emails", "industry", "city"] } });
    if (url.pathname.endsWith("/stats")) return route.fulfill({ json: { total: TOTAL } });
    const p = Number(url.searchParams.get("page") || 1);
    const limit = Number(url.searchParams.get("limit") || 50);
    const records = [];
    for (let i = (p - 1) * limit + 1; i <= Math.min(TOTAL, p * limit); i++) records.push(row(i));
    return route.fulfill({ json: { records, total: TOTAL, total_exact: true } });
  });

  await page.goto("/login");
  await page.locator("#login-email").fill(USER.email);
  await page.locator("#login-password").fill(USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\/\w+/);
  await page.goto("/app/companies");
  await page.waitForLoadState("networkidle");
  // the page may land on Companies already; make sure the table is there
  await expect(page.getByRole("checkbox", { name: "Select row 1", exact: true })).toBeVisible();

  // row 1, then Shift-click row 4 → rows 1–4
  await page.getByRole("checkbox", { name: "Select row 1", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select row 4", exact: true }).click({ modifiers: ["Shift"] });
  await expect(page.getByRole("region", { name: "Selected rows" }).filter({ hasText: "4 rows selected" })).toBeVisible();
  const header = page.getByRole("checkbox", { name: "Select all rows on this page" });
  expect(await header.evaluate((el) => el.indeterminate)).toBe(true);

  // next page: one more; the first page's rows stay selected
  await page.getByRole("button", { name: "Next ›" }).click();
  await expect(page.getByText("Company 51")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select row 1", exact: true }).click();
  await expect(page.getByRole("region", { name: "Selected rows" })).toContainText("5 rows selected");
  await expect(page.getByRole("region", { name: "Selected rows" })).toContainText("(1 on this page)");
  await page.screenshot({ path: "e2e-results/export-selection.png" });

  // Export selected (from the bar) → 5 rows, Excel-friendly
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export selected" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^companies_selected_\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readDownload(dl);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).trim().split("\r\n");
  expect(lines).toHaveLength(1 + 5);
  expect(lines[0]).toBe('"Business Name","Phone","Emails","Industry","City"');
  expect(csv).toContain('"a1@example.test; b1@example.test"');       // list cell, not "{a,b}"
  expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);                 // formula neutralised
  expect(csv).toContain('"+919876543201"');                            // phone kept as is
  expect(csv).toContain("Company 51");

  // Export menu → all rows on this page (10 on page 2)
  await page.getByRole("button", { name: /Export \(5 selected\)/ }).click();
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /All rows on this page/ }).click()]);
  expect((await readDownload(dl2)).slice(1).trim().split("\r\n")).toHaveLength(1 + 10);

  // header checkbox ticks the whole page; Clear empties the selection
  await header.click();
  await expect(page.getByRole("region", { name: "Selected rows" })).toContainText("14 rows selected");
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("region", { name: "Selected rows" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Export CSV/ })).toBeVisible();
});

test("People, Emails and Numbers have the checkboxes and the export menu", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/\/api\/final-[a-z-]+(\/columns|\/stats)?(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/columns")) return route.fulfill({ json: { columns: ["full_name", "job_title", "emails", "phones", "city"] } });
    if (url.pathname.endsWith("/stats")) return route.fulfill({ json: { total: 3 } });
    const records = [1, 2, 3].map((i) => ({ full_name: `Person ${i}`, business_name: `Company ${i}`, job_title: "CEO", emails: `{p${i}@example.test}`, phones: `{+91987654320${i}}`, city: "Pune" }));
    return route.fulfill({ json: { records, total: 3, total_exact: true } });
  });
  await page.goto("/login");
  await page.locator("#login-email").fill(USER.email);
  await page.locator("#login-password").fill(USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\/\w+/);
  for (const path of ["/app/people", "/app/email", "/app/number"]) {
    await page.goto(path);
    await page.getByRole("checkbox", { name: "Select row 2", exact: true }).click();
    await expect(page.getByRole("region", { name: "Selected rows" })).toContainText("1 row selected");
    await expect(page.getByRole("button", { name: /Export \(1 selected\)/ })).toBeVisible();
  }
  expect(errors, errors.join("\n")).toEqual([]);
});
