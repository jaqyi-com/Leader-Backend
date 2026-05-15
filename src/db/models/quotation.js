const mongoose = require("mongoose");

const lineItemSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  hsnCode:     String,
  quantity:    { type: Number, default: 1 },
  rate:        { type: Number, default: 0 },
  taxPercent:  { type: Number, default: 18 },   // GST %
  taxAmount:   { type: Number, default: 0 },
  total:       { type: Number, default: 0 },
}, { _id: true });

const quotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, required: true },
  dealId:          { type: mongoose.Schema.Types.ObjectId, ref: "Deal", index: true },
  // Contact
  contactName:  String,
  contactEmail: String,
  contactPhone: String,
  companyName:  String,
  companyAddress: String,
  // Items
  items:    { type: [lineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },       // flat discount
  discountPercent: { type: Number, default: 0 }, // percentage discount
  grandTotal: { type: Number, default: 0 },
  currency:   { type: String, default: "INR" },
  // Status
  status: {
    type: String,
    enum: ["draft", "sent", "viewed", "accepted", "rejected", "expired", "converted"],
    default: "draft",
  },
  validUntil: Date,
  sentAt:     Date,
  notes:      String,
  terms:      String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

quotationSchema.index({ orgId: 1, createdAt: -1 });
quotationSchema.index({ orgId: 1, status: 1 });

/**
 * Auto-generate next quotation number for an org.
 */
quotationSchema.statics.nextNumber = async function (orgId) {
  const last = await this.findOne({ orgId }).sort({ createdAt: -1 }).select("quotationNumber").lean();
  if (!last) return "QT-001";
  const num = parseInt(last.quotationNumber.replace(/\D/g, ""), 10) || 0;
  return `QT-${String(num + 1).padStart(3, "0")}`;
};

module.exports = mongoose.models.Quotation || mongoose.model("Quotation", quotationSchema);
