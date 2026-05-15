const mongoose = require("mongoose");

const invoiceLineSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  hsnCode:     String,
  quantity:    { type: Number, default: 1 },
  rate:        { type: Number, default: 0 },
  taxPercent:  { type: Number, default: 18 },
  taxAmount:   { type: Number, default: 0 },
  total:       { type: Number, default: 0 },
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true },
  dealId:        { type: mongoose.Schema.Types.ObjectId, ref: "Deal", index: true },
  quotationId:   { type: mongoose.Schema.Types.ObjectId, ref: "Quotation" },
  // Contact / Billing
  contactName:    String,
  contactEmail:   String,
  contactPhone:   String,
  companyName:    String,
  billingAddress: String,
  gstin:          String,
  // Items
  items:     { type: [invoiceLineSchema], default: [] },
  subtotal:  { type: Number, default: 0 },
  taxTotal:  { type: Number, default: 0 },
  discount:  { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  grandTotal:  { type: Number, default: 0 },
  amountPaid:  { type: Number, default: 0 },
  amountDue:   { type: Number, default: 0 },
  currency:    { type: String, default: "INR" },
  // Status
  status: {
    type: String,
    enum: ["draft", "sent", "partially_paid", "paid", "overdue", "cancelled"],
    default: "draft",
  },
  issueDate:  { type: Date, default: Date.now },
  dueDate:    Date,
  paidAt:     Date,
  sentAt:     Date,
  notes:      String,
  terms:      String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

invoiceSchema.index({ orgId: 1, createdAt: -1 });
invoiceSchema.index({ orgId: 1, status: 1 });

invoiceSchema.statics.nextNumber = async function (orgId) {
  const last = await this.findOne({ orgId }).sort({ createdAt: -1 }).select("invoiceNumber").lean();
  if (!last) return "INV-001";
  const num = parseInt(last.invoiceNumber.replace(/\D/g, ""), 10) || 0;
  return `INV-${String(num + 1).padStart(3, "0")}`;
};

module.exports = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
