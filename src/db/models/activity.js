const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "note", "call", "email", "meeting", "whatsapp", "task", "follow_up",
      "stage_change", "deal_created", "deal_won", "deal_lost",
      "quotation_sent", "quotation_accepted", "quotation_rejected",
      "invoice_created", "payment_received",
    ],
    required: true,
  },
  title:       { type: String, required: true },
  description: String,
  // Associations — at least one should be set
  dealId:      { type: mongoose.Schema.Types.ObjectId, ref: "Deal", index: true },
  contactId:   { type: mongoose.Schema.Types.ObjectId, ref: "GeneratedLead" },
  companyName: String,
  // Task / Follow-up
  dueDate:     Date,
  dueTime:     String,
  completed:   { type: Boolean, default: false },
  completedAt: Date,
  priority:    { type: String, enum: ["low", "medium", "high"], default: "medium" },
  assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  // Call-specific
  callDuration: Number,   // seconds
  callOutcome:  { type: String, enum: ["answered", "no_answer", "voicemail", "busy", "callback", ""] },
  // Metadata (stage change details, etc.)
  metadata: mongoose.Schema.Types.Mixed,
  orgId:    { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

activitySchema.index({ orgId: 1, dealId: 1, createdAt: -1 });
activitySchema.index({ orgId: 1, type: 1 });
activitySchema.index({ orgId: 1, dueDate: 1, completed: 1 });

module.exports = mongoose.models.Activity || mongoose.model("Activity", activitySchema);
