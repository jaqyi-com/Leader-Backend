// @ts-check
// Public /categories page (no login): India / USA / Global lists of industries and job titles,
// and the landing page's "Categories" menu item and preview lead there.
const { test, expect } = require("@playwright/test");

test("the Categories menu item opens its own page; India, USA and Global lists work", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Categories" }).click();
  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Browse every category");
  await expect(page).toHaveTitle(/Doott Categories/);

  const region = page.getByRole("tablist", { name: "Region" });
  await expect(region.getByRole("tab", { name: "India" })).toHaveAttribute("aria-selected", "true");
  const firstLink = page.locator("ul a").first();
  await expect(firstLink).toHaveAttribute("href", /^\/app\/companies\?f_industry_eq=.+&f_country=india$/);

  // search narrows the list
  await page.getByLabel("Search industries").fill("pharma");
  await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: /India · \d+ of \d+ industries/ })).toBeVisible();
  for (const t of await page.locator("ul a").allInnerTexts()) expect(t.toLowerCase()).toContain("pharma");
  await page.getByLabel("Search industries").fill("");

  // USA job titles
  await region.getByRole("tab", { name: "USA" }).click();
  await page.getByRole("button", { name: /Job titles/ }).click();
  await expect(page.locator("ul a").first()).toHaveAttribute("href", /^\/app\/people\?f_job_title_eq=.+&f_country=usa$/);

  // Global: country picker; France has industries only, so the page switches to industries
  await region.getByRole("tab", { name: "Global" }).click();
  await page.getByLabel("Country", { exact: true }).selectOption("FR");
  await expect(page.getByRole("button", { name: /Job titles/ })).toBeDisabled();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("France");
  await expect(page.locator("ul a").first()).toHaveAttribute("href", /^\/app\/companies\?f_industry_eq=.+&country=FR$/);
  await page.screenshot({ path: "e2e-results/public-categories.png", fullPage: false });
  expect(errors, errors.join("\n")).toEqual([]);
});

test("the landing page shows a short preview that links to /categories", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "B2B categories" });
  await expect(section.getByRole("heading", { name: "Top industries in India" })).toBeVisible();
  // every country with categories is listed; one click opens that country
  const countries = section.getByRole("list", { name: "Categories by country" }).locator("li");
  expect(await countries.count()).toBeGreaterThan(50);
  await expect(countries.first()).toContainText("India");
  await section.getByRole("link", { name: /Germany/ }).click();
  await expect(page).toHaveURL(/\/categories\?country=DE$/);
  await expect(page.getByRole("tablist", { name: "Region" }).getByRole("tab", { name: "Global" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Germany");
  await expect(page.locator("ul a").first()).toHaveAttribute("href", /&country=DE$/);
  await page.goto("/");
  await page.getByRole("region", { name: "B2B categories" }).getByRole("link", { name: "Browse all categories →" }).click();
  await expect(page).toHaveURL(/\/categories$/);
});

test("/categories?country=US opens the USA list; picking a country updates the link", async ({ page }) => {
  await page.goto("/categories?country=US");
  await expect(page.getByRole("tab", { name: "USA" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Global" }).click();
  await page.getByLabel("Country", { exact: true }).selectOption("CA");
  await expect(page).toHaveURL(/\/categories\?country=CA$/);
});
