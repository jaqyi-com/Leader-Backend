// @ts-check
// Browser end-to-end tests. Everything runs LOCALLY and hermetically:
//   throwaway PostgreSQL (temp dir)  →  backend (fake third-party keys)  →  Vite dev server
// The frontend is pointed at the local backend through VITE_API_URL, never at production.
const { defineConfig, devices } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PG_PORT = 55988;
const PG_BIN = ["/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/opt/postgresql@17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin"]
  .find((d) => require("node:fs").existsSync(path.join(d, "initdb"))) || "";
const API_PORT = 4888;
const WEB_PORT = 5199;
const SECRET = "e2e-secret-" + "z".repeat(40);
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;

process.env.E2E_API = API;
process.env.E2E_JWT_SECRET = SECRET;

module.exports = defineConfig({
  testDir: path.join(__dirname, "tests"),
  outputDir: path.join(ROOT, "e2e-results"),
  reporter: [["list"], ["html", { outputFolder: path.join(ROOT, "playwright-report"), open: "never" }]],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: { baseURL: WEB, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Accounts live in PostgreSQL (schema "app", created by the backend on first use).
      command: `sh -c 'D=$(mktemp -d) && "${PG_BIN}/initdb" -D "$D" -U postgres -A trust -E UTF8 --locale=C >/dev/null && exec "${PG_BIN}/postgres" -D "$D" -p ${PG_PORT} -k "$D" -c listen_addresses=127.0.0.1'`,
      port: PG_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node src/server.js",
      cwd: ROOT,
      url: `${API}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PATH: process.env.PATH || "", NODE_ENV: "production", PORT: String(API_PORT), JWT_SECRET: SECRET,
        FRONTEND_URL: WEB, CORS_ORIGIN: WEB,
        NEON_DATABASE_URL: `postgresql://postgres@127.0.0.1:${PG_PORT}/postgres`,
        OPENAI_API_KEY: "fake", APOLLO_API_KEY: "fake", SMTP_USER: "fake", SMTP_PASS: "fake",
      },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: path.join(ROOT, "frontend"),
      url: WEB,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PATH: process.env.PATH || "", VITE_API_URL: `${API}/api`, VITE_CRAWLER_API_URL: `${API}/api/crawler` },
    },
  ],
});
