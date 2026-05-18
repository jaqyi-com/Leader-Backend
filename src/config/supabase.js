"use strict";
// ============================================================
// SUPABASE CLIENT
// ============================================================
// Set these in your .env file:
//   SUPABASE_URL=https://your-project.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
//   SUPABASE_TABLE=leads   (default: "leads")
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn("[Supabase] ⚠️  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. InBuild Database will use mock data.");
}

const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "leads";

module.exports = { supabase, SUPABASE_TABLE };
