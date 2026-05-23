"use strict";
// ============================================================
// INBUILD RECORD — MongoDB Model
// Stores all records synced from Google Sheets
// ============================================================
const mongoose = require("mongoose");

const inbuildRecordSchema = new mongoose.Schema(
  {
    // Core canonical fields (indexed for fast filtering)
    name:      { type: String, default: "" },
    category:  { type: String, default: "" },
    city_file: { type: String, default: "" },
    rating:    { type: String, default: "" },
    reviews:   { type: String, default: "" },
    phone:     { type: String, default: "" },
    address:   { type: String, default: "" },
    website:   { type: String, default: "" },
    url:       { type: String, default: "" },

    // Source tracking (which sheet/tab this row came from)
    _sheet: { type: String, default: "" },
    _tab:   { type: String, default: "" },

    // Any extra columns from the sheet go here
    extra: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: false,
    versionKey: false,
    collection: "inbuild_records",
  }
);

// Indexes for fast queries
inbuildRecordSchema.index({ name: 1 });
inbuildRecordSchema.index({ category: 1 });
inbuildRecordSchema.index({ city_file: 1 });
inbuildRecordSchema.index({ phone: 1 });
inbuildRecordSchema.index({ website: 1 });
// Text index for full-text search
inbuildRecordSchema.index(
  { name: "text", category: "text", city_file: "text", address: "text" },
  { name: "inbuild_text_search" }
);

module.exports = mongoose.models.InbuildRecord ||
  mongoose.model("InbuildRecord", inbuildRecordSchema);
