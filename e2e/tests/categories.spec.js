// @ts-check
// Categories page: India, USA and every other country with category cards (worldCategories.json).
const { test, expect } = require("@playwright/test");

const API = process.env.E2E_API;
const USER = { name: "Cat User", email: "e2e.categories@example.test", password: "Passw0rd!e2e2" };
const WORLD = require("../../frontend/src/worldCategories.json");

test.beforeAll(async ({ request }) => {
  const r = await request.post(`${API}/api/auth/register`, { data: { ...USER, orgName: "Cat Org" } });
  expect([201, 409, 400]).toContain(r.status());
});

test("other countries have their own category cards, and a card opens that search", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.locator("#login-email").fill(USER.email);
  await page.locator("#login-password").fill(USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // the app opens the user's last page (or Companies) after sign-in; then go to Categories
  await page.waitForURL(/\/app\/\w+/);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/app/categories")) {
    await page.getByRole("button", { name: "Categories" }).or(page.getByRole("link", { name: "Categories" })).first().click();
  }
  await expect(page.getByText("Category & Industry Explorer")).toBeVisible();

  // pick Germany in the country picker
  const de = WORLD.countries.DE.companies;
  await expect(page.getByRole("tab", { name: /India/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /USA/ }).click();
  await expect(page.getByText(/Search and segment\s*United States/)).toBeVisible();
  await page.getByRole("tab", { name: /Global/ }).click();
  await page.getByRole("button", { name: "Country", exact: true }).click();
  await page.getByLabel("Search countries").fill("Germany");
  await page.getByRole("option", { name: /Germany/ }).click();
  await expect(page.getByText(/Search and segment\s*Germany/)).toBeVisible();
  await expect(page.getByText(`${de.length} categories available`)).toBeVisible();
  await expect(page.getByText(/Many have no industry/)).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`^${de[0].name}\\s`) }).first()).toBeVisible();
  await page.waitForTimeout(600); // let the previous grid finish fading out
  await page.screenshot({ path: "e2e-results/categories-germany.png" });

  // the largest card opens the Companies search with exactly that country and industry
  await page.getByRole("button", { name: new RegExp(`^${de[0].name}\\s`) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/app/companies\\?f_industry_eq=${encodeURIComponent(de[0].name)}&country=DE`));
  expect(errors, errors.join("\n")).toEqual([]);
});

test("job titles for Canada", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-email").fill(USER.email);
  await page.locator("#login-password").fill(USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\/\w+/);
  await page.goto("/app/categories?country=CA");
  await page.getByRole("button", { name: /Job Roles/ }).click();
  const ca = WORLD.countries.CA.people;
  await expect(page.getByText(`${ca.length} categories available`)).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "e2e-results/categories-canada-people.png" });
});
