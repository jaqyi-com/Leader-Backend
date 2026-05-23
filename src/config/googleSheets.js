"use strict";
// ============================================================
// GOOGLE SHEETS CLIENT CONFIG
// ============================================================
// Set these in your .env / Vercel environment:
//
//   Option A (local dev):
//     GOOGLE_SHEETS_CREDENTIALS_FILE=./src/config/googleSheetsCredentials.json
//
//   Option B (Vercel / production — paste the JSON as a one-line string):
//     GOOGLE_SHEETS_CREDENTIALS={"type":"service_account","project_id":...}
//
//   Required in all environments:
//     GOOGLE_SHEET_IDS=spreadsheetId1,spreadsheetId2,...
//
// Each spreadsheet must be shared with the service account email as Viewer.
// ============================================================

const path = require("path");
const fs   = require("fs");

let sheetsClient = null;
let SHEET_IDS    = [];

try {
  const { google } = require("googleapis");

  // ---- Load credentials ----
  let credentials = null;

  // 1. Try env var (JSON string) — works on Vercel
  if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
    } catch (e) {
      console.warn("[GoogleSheets] ⚠️  Failed to parse GOOGLE_SHEETS_CREDENTIALS env:", e.message);
    }
  }

  // 2. Try credentials file (local dev)
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
    console.warn("[GoogleSheets] ⚠️  No credentials found. Set GOOGLE_SHEETS_CREDENTIALS env var on Vercel.");
  } else {
    // ---- Build authenticated Sheets client ----
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    sheetsClient = google.sheets({ version: "v4", auth });
    console.log("[GoogleSheets] ✅ Service Account authenticated successfully.");
  }

  // ---- Parse sheet IDs from env ----
  SHEET_IDS = (process.env.GOOGLE_SHEET_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (SHEET_IDS.length === 0) {
    console.warn("[GoogleSheets] ⚠️  GOOGLE_SHEET_IDS not set. Add it to your environment variables.");
  } else {
    console.log(`[GoogleSheets] 📊 Configured with ${SHEET_IDS.length} sheet(s).`);
  }

} catch (err) {
  console.warn("[GoogleSheets] ⚠️  Initialization failed:", err.message);
}

module.exports = { sheetsClient, SHEET_IDS };
