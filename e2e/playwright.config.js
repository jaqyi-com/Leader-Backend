// @ts-check
// Browser end-to-end tests. Everything runs LOCALLY and hermetically:
//   throwaway mongod (temp dir)  →  backend (fake third-party keys)  →  Vite dev server
// The frontend is pointed at the local backend through VITE_API_URL, never at production.
const { defineConfig, devices } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const MONGO_PORT = 27988;
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
      command: `sh -c 'D=$(mktemp -d) && exec mongod --dbpath "$D" --port ${MONGO_PORT} --bind_ip 127.0.0.1 --nounixsocket --quiet'`,
      port: MONGO_PORT,
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
        MONGO_URI: `mongodb://127.0.0.1:${MONGO_PORT}/e2e`, FRONTEND_URL: WEB, CORS_ORIGIN: WEB,
        NEON_DATABASE_URL: "postgresql://u:p@127.0.0.1:1/x",
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
