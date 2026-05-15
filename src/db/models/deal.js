const mongoose = require("mongoose");

const dealSchema = new mongoose.Schema({
  title:             { type: String, required: true },
  value:             { type: Number, default: 0 },
  currency:          { type: String, default: "INR" },
  stage:             { type: String, default: "new_lead" },
  probability:       { type: Number, default: 10 },
  priority:          { type: String, enum: ["hot", "warm", "cold"], default: "warm" },
  expectedCloseDate: Date,
  actualCloseDate:   Date,
  lostReason:        String,
  // Source
  source: {
    type: String,
    enum: ["website", "phone", "referral", "scraper", "whatsapp", "email", "social", "manual", "other"],
    default: "manual",
  },
  // Contact
  contactId:    { type: mongoose.Schema.Types.ObjectId, ref: "GeneratedLead" },
  contactName:  String,
  contactEmail: String,
  contactPhone: String,
  // Company
  companyName:   String,
  companyDomain: String,
  // Assignment
  assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  assignedToName: String,
  // Pipeline
  pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: "Pipeline" },
  stageOrder: { type: Number, default: 0 },
  // Extra
  tags:  [String],
  notes: String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

dealSchema.index({ orgId: 1, stage: 1 });
dealSchema.index({ orgId: 1, pipelineId: 1 });
dealSchema.index({ orgId: 1, createdAt: -1 });

module.exports = mongoose.models.Deal || mongoose.model("Deal", dealSchema);
