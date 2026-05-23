"use strict";
// ============================================================
// GOOGLE SHEETS CLIENT CONFIG
// ============================================================
// Vercel env vars: GOOGLE_SHEETS_CREDENTIALS (JSON string), GOOGLE_SHEET_IDS
// Local dev:       GOOGLE_SHEETS_CREDENTIALS_FILE or auto-detects
//                  src/config/googleSheetsCredentials.json
// ============================================================

const path = require("path");
const fs   = require("fs");

let sheetsClient = null;
let SHEET_IDS    = [];

try {
  const { google } = require("googleapis");

  // ---- Load credentials ----
  let credentials = null;

  // 1. GOOGLE_SHEETS_CREDENTIALS env var (works on Vercel)
  if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
    try {
      let raw = process.env.GOOGLE_SHEETS_CREDENTIALS;
      credentials = JSON.parse(raw);
    } catch (e) {
      console.warn("[GoogleSheets] ⚠️  Failed to parse GOOGLE_SHEETS_CREDENTIALS:", e.message);
    }
  }

  // 2. Local credentials file (local dev)
  if (!credentials) {
    const credFile = process.env.GOOGLE_SHEETS_CREDENTIALS_FILE
      ? path.resolve(process.cwd(), process.env.GOOGLE_SHEETS_CREDENTIALS_FILE)
      : path.join(__dirname, "googleSheetsCredentials.json");

    if (fs.existsSync(credFile)) {
      try {
        credentials = JSON.parse(fs.readFileSync(credFile, "utf-8"));
      } catch (e) {
        console.warn("[GoogleSheets] ⚠️  Failed to parse credentials file:", e.message);
      }
    }
  }

  if (!credentials) {
    console.warn("[GoogleSheets] ⚠️  No credentials found. Set GOOGLE_SHEETS_CREDENTIALS on Vercel.");
  } else {
    // ---- FIX: Vercel double-escapes \n in private_key — repair it ----
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    sheetsClient = google.sheets({ version: "v4", auth });
    console.log("[GoogleSheets] ✅ Service Account authenticated.");
  }

  // ---- Parse sheet IDs ----
  SHEET_IDS = (process.env.GOOGLE_SHEET_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (SHEET_IDS.length === 0) {
    console.warn("[GoogleSheets] ⚠️  GOOGLE_SHEET_IDS not set — database will be empty.");
  } else {
    console.log(`[GoogleSheets] 📊 ${SHEET_IDS.length} sheet(s) configured.`);
  }

} catch (err) {
  console.warn("[GoogleSheets] ⚠️  Init error (non-fatal):", err.message);
}

module.exports = { sheetsClient, SHEET_IDS };
