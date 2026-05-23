"use strict";
// ============================================================
// GOOGLE SHEETS CLIENT CONFIG
// ============================================================
// Set these in your .env file:
//   GOOGLE_SHEETS_CREDENTIALS_FILE=./src/config/googleSheetsCredentials.json
//   GOOGLE_SHEET_IDS=spreadsheetId1,spreadsheetId2,...
//
// Each spreadsheet must be shared with the service account:
//   leader@test-bucket-481215.iam.gserviceaccount.com (Viewer)
// ============================================================

const path = require("path");
const fs   = require("fs");
const { google } = require("googleapis");

// ---- Load credentials ----
let credentials = null;

const credFile = process.env.GOOGLE_SHEETS_CREDENTIALS_FILE
  ? path.resolve(process.cwd(), process.env.GOOGLE_SHEETS_CREDENTIALS_FILE)
  : path.join(__dirname, "googleSheetsCredentials.json");

if (fs.existsSync(credFile)) {
  try {
    credentials = JSON.parse(fs.readFileSync(credFile, "utf-8"));
  } catch (e) {
    console.warn("[GoogleSheets] ⚠️  Failed to parse credentials file:", e.message);
  }
} else if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
  try {
    credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
  } catch (e) {
    console.warn("[GoogleSheets] ⚠️  Failed to parse GOOGLE_SHEETS_CREDENTIALS env:", e.message);
  }
} else {
  console.warn("[GoogleSheets] ⚠️  No credentials found. InBuild Database will return empty data.");
}

// ---- Build authenticated client ----
let sheetsClient = null;

if (credentials) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    sheetsClient = google.sheets({ version: "v4", auth });
    console.log("[GoogleSheets] ✅ Service Account authenticated successfully.");
  } catch (e) {
    console.warn("[GoogleSheets] ⚠️  Auth failed:", e.message);
  }
}

// ---- Parse sheet IDs from env ----
// GOOGLE_SHEET_IDS=id1,id2,id3
const SHEET_IDS = (process.env.GOOGLE_SHEET_IDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

if (SHEET_IDS.length === 0) {
  console.warn("[GoogleSheets] ⚠️  GOOGLE_SHEET_IDS not set. InBuild Database will return empty data.");
} else {
  console.log(`[GoogleSheets] 📊 Configured with ${SHEET_IDS.length} sheet(s).`);
}

module.exports = { sheetsClient, SHEET_IDS };
