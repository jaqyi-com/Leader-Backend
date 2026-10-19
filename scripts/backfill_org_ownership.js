#!/usr/bin/env node
"use strict";
/**
 * Give legacy records that have no organisation (orgId) to one organisation.
 *
 * Since the tenant-isolation fix, every lead / post / scraper record is visible only to the
 * organisation in its orgId. Records created before that fix have no orgId, so nobody sees them.
 *
 *   node scripts/backfill_org_ownership.js --org <organisationId>            # DRY RUN: counts only
 *   node scripts/backfill_org_ownership.js --org <organisationId> --execute  # assigns them
 *
 * Only documents WITHOUT an orgId are touched; records that already belong to an org are never changed.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const EXECUTE = process.argv.includes("--execute");
const orgId = arg("--org");
const COLLECTIONS = ["generatedleads", "socialposts", "autonomousleads", "autoscraperleads"];

(async () => {
  if (!orgId || !/^[0-9a-f]{24}$/i.test(orgId)) {
    console.error("Usage: node scripts/backfill_org_ownership.js --org <24-char organisationId> [--execute]");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const org = await db.collection("organizations").findOne({ _id: new mongoose.Types.ObjectId(orgId) }, { projection: { name: 1 } });
  if (!org) { console.error("No organisation with that id."); process.exit(1); }
  console.log(`Target organisation: "${org.name}" (${orgId})  mode: ${EXECUTE ? "EXECUTE" : "dry run"}`);

  const filter = { $or: [{ orgId: { $exists: false } }, { orgId: null }] };
  for (const name of COLLECTIONS) {
    const c = db.collection(name);
    const n = await c.countDocuments(filter);
    if (EXECUTE && n > 0) {
      const r = await c.updateMany(filter, { $set: { orgId: new mongoose.Types.ObjectId(orgId) } });
      console.log(`${name}: ${n} found, ${r.modifiedCount} assigned`);
    } else {
      console.log(`${name}: ${n} without an organisation${EXECUTE ? "" : " (not changed)"}`);
    }
  }
  await mongoose.disconnect();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
