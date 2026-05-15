const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", index: true, required: true },
  dealId:    { type: mongoose.Schema.Types.ObjectId, ref: "Deal" },
  amount:    { type: Number, required: true },
  currency:  { type: String, default: "INR" },
  method: {
    type: String,
    enum: ["cash", "bank_transfer", "upi", "cheque", "card", "other"],
    default: "bank_transfer",
  },
  reference:   String,   // cheque no / UTR / txn id
  paymentDate: { type: Date, default: Date.now },
  notes:       String,
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

paymentSchema.index({ orgId: 1, invoiceId: 1 });
paymentSchema.index({ orgId: 1, paymentDate: -1 });

module.exports = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
