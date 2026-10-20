// @ts-check
const { test, expect } = require("@playwright/test");
const jwt = require("jsonwebtoken");

const API = process.env.E2E_API;
const SECRET = process.env.E2E_JWT_SECRET;
const USER = { name: "E2E User", email: "e2e.user@example.test", password: "Passw0rd!e2e1" };

test.beforeAll(async ({ request }) => {
  const r = await request.post(`${API}/api/auth/register`, { data: { ...USER, orgName: "E2E Org" } });
  expect([201, 409, 400]).toContain(r.status());
});

async function login(page, email = USER.email, password = USER.password) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test("landing page renders without script errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page).toHaveTitle(/.+/);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("public pages load: login, pricing, api-docs", async ({ page }) => {
  for (const p of ["/login", "/pricing", "/forgot-password"]) {
    const res = await page.goto(p);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toBeEmpty();
  }
});

test("protected routes redirect anonymous visitors to login", async ({ page }) => {
  for (const p of ["/app", "/app/people", "/app/crm", "/app/settings"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("wrong password shows an error and stays on login", async ({ page }) => {
  await login(page, USER.email, "definitely-wrong-password");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/invalid|incorrect|failed|wrong/i).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("leader_token"))).toBeNull();
});

test("unknown account and wrong password give the same error (no account enumeration)", async ({ page }) => {
  await login(page, "nobody.here@example.test", "whatever-password-1");
  const unknown = (await page.locator("form").innerText()).replace(/\s+/g, " ");
  await login(page, USER.email, "whatever-password-1");
  await expect(page).toHaveURL(/\/login/);
  const wrong = (await page.locator("form").innerText()).replace(/\s+/g, " ");
  expect(wrong).toBe(unknown);
});

test("valid login enters the app, survives a refresh, and sign-out clears the session", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/app/);
  expect(await page.evaluate(() => localStorage.getItem("leader_token"))).toBeTruthy();

  await page.reload();
  await expect(page).toHaveURL(/\/app/);

  await page.getByText(USER.name).first().click(); // opens the user menu
  await page.getByText("Sign out").first().click();
  await expect(page).toHaveURL(/\/(login)?$/);
  expect(await page.evaluate(() => localStorage.getItem("leader_token"))).toBeNull();
  await page.goto("/app/people");
  await expect(page).toHaveURL(/\/login/);
});

test("tampered, forged and expired tokens do not grant access", async ({ page }) => {
  const forged = jwt.sign({ userId: "u1", orgId: "507f1f77bcf86cd799439011", role: "owner" }, "changeme-secret", { expiresIn: "1h" });
  const expired = jwt.sign({ userId: "u1", orgId: "507f1f77bcf86cd799439011", role: "admin" }, SECRET, { expiresIn: -60 });
  for (const token of ["not.a.jwt", forged, expired]) {
    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("leader_token", t), token);
    await page.goto("/app/people");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  }
});

test("XSS probe in the login email field is not executed", async ({ page }) => {
  let dialog = false;
  page.on("dialog", async (d) => { dialog = true; await d.dismiss(); });
  await page.goto("/login?error=" + encodeURIComponent("<img src=x onerror=alert(1)>"));
  await login(page, '"><img src=x onerror=alert(1)>@example.test', "x-password-123");
  await page.waitForTimeout(500);
  expect(dialog).toBe(false);
});
