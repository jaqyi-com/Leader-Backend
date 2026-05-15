const mongoose = require("mongoose");

// ─── Ledger Group (Chart of Accounts hierarchy) ────────────────
const ledgerGroupSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  parentId:   { type: mongoose.Schema.Types.ObjectId, ref: "LedgerGroup", default: null },
  nature:     { type: String, enum: ["assets", "liabilities", "income", "expenses"], required: true },
  isDefault:  { type: Boolean, default: false },
  orgId:      { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

ledgerGroupSchema.index({ orgId: 1, name: 1 }, { unique: true });

// ─── Ledger (individual account) ───────────────────────────────
const ledgerSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  groupId:      { type: mongoose.Schema.Types.ObjectId, ref: "LedgerGroup", required: true },
  nature:       { type: String, enum: ["assets", "liabilities", "income", "expenses"] },
  openingBalance: { type: Number, default: 0 },
  currentBalance: { type: Number, default: 0 },
  balanceType:  { type: String, enum: ["debit", "credit"], default: "debit" },
  // Optional linked entity
  linkedType:   { type: String, enum: ["customer", "supplier", "bank", "cash", "tax", "general"], default: "general" },
  linkedId:     { type: mongoose.Schema.Types.ObjectId }, // link to contact/deal/etc
  // Bank details (if bank ledger)
  bankName:     String,
  accountNumber: String,
  ifscCode:     String,
  // Tax (if tax ledger)
  taxType:      { type: String, enum: ["cgst", "sgst", "igst", "tds", "tcs", ""] },
  taxRate:       Number,
  gstin:        String,
  description:  String,
  isActive:     { type: Boolean, default: true },
  orgId:        { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

ledgerSchema.index({ orgId: 1, name: 1 });
ledgerSchema.index({ orgId: 1, groupId: 1 });

// ─── Voucher (accounting transaction) ──────────────────────────
const voucherEntrySchema = new mongoose.Schema({
  ledgerId:   { type: mongoose.Schema.Types.ObjectId, ref: "Ledger", required: true },
  ledgerName: String,
  debit:      { type: Number, default: 0 },
  credit:     { type: Number, default: 0 },
}, { _id: true });

const voucherSchema = new mongoose.Schema({
  voucherNumber: { type: String, required: true },
  type: {
    type: String,
    enum: ["payment", "receipt", "journal", "contra", "sales", "purchase", "debit_note", "credit_note"],
    required: true,
  },
  date:        { type: Date, default: Date.now },
  entries:     { type: [voucherEntrySchema], default: [] },
  totalDebit:  { type: Number, default: 0 },
  totalCredit: { type: Number, default: 0 },
  narration:   String,
  reference:   String,  // cheque no, invoice no, etc.
  // Linked documents
  invoiceId:   { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
  paymentId:   { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
  isReconciled: { type: Boolean, default: false },
  reconciledDate: Date,
  orgId:       { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

voucherSchema.index({ orgId: 1, date: -1 });
voucherSchema.index({ orgId: 1, type: 1 });

voucherSchema.statics.nextNumber = async function (orgId, type) {
  const prefix = { payment: "PMT", receipt: "RCT", journal: "JRN", contra: "CTR", sales: "SAL", purchase: "PUR", debit_note: "DN", credit_note: "CN" }[type] || "V";
  const last = await this.findOne({ orgId, type }).sort({ createdAt: -1 }).select("voucherNumber").lean();
  if (!last) return `${prefix}-001`;
  const num = parseInt(last.voucherNumber.replace(/\D/g, ""), 10) || 0;
  return `${prefix}-${String(num + 1).padStart(3, "0")}`;
};

// ─── Default Chart of Accounts ─────────────────────────────────
const DEFAULT_GROUPS = [
  { name: "Current Assets", nature: "assets" },
  { name: "Fixed Assets", nature: "assets" },
  { name: "Bank Accounts", nature: "assets" },
  { name: "Cash-in-Hand", nature: "assets" },
  { name: "Sundry Debtors", nature: "assets" },
  { name: "Current Liabilities", nature: "liabilities" },
  { name: "Sundry Creditors", nature: "liabilities" },
  { name: "Duties & Taxes", nature: "liabilities" },
  { name: "Capital Account", nature: "liabilities" },
  { name: "Sales Accounts", nature: "income" },
  { name: "Direct Income", nature: "income" },
  { name: "Indirect Income", nature: "income" },
  { name: "Purchase Accounts", nature: "expenses" },
  { name: "Direct Expenses", nature: "expenses" },
  { name: "Indirect Expenses", nature: "expenses" },
];

ledgerGroupSchema.statics.seedDefaults = async function (orgId) {
  const existing = await this.countDocuments({ orgId });
  if (existing > 0) return;
  for (const g of DEFAULT_GROUPS) {
    await this.create({ ...g, isDefault: true, orgId });
  }
};

const LedgerGroup = mongoose.models.LedgerGroup || mongoose.model("LedgerGroup", ledgerGroupSchema);
const Ledger = mongoose.models.Ledger || mongoose.model("Ledger", ledgerSchema);
const Voucher = mongoose.models.Voucher || mongoose.model("Voucher", voucherSchema);

module.exports = { LedgerGroup, Ledger, Voucher };
