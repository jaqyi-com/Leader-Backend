const mongoose = require("mongoose");

// ─── Stock Group ───────────────────────────────────────────────
const stockGroupSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "StockGroup", default: null },
  orgId:    { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

stockGroupSchema.index({ orgId: 1, name: 1 }, { unique: true });

// ─── Stock Item ────────────────────────────────────────────────
const stockItemSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  sku:           String,
  groupId:       { type: mongoose.Schema.Types.ObjectId, ref: "StockGroup" },
  hsnCode:       String,
  unit:          { type: String, default: "pcs" },    // pcs, kg, ltr, box, etc.
  // Pricing
  purchaseRate:  { type: Number, default: 0 },
  sellingRate:   { type: Number, default: 0 },
  mrp:           { type: Number, default: 0 },
  taxPercent:    { type: Number, default: 18 },       // GST %
  // Stock levels
  openingQty:    { type: Number, default: 0 },
  currentQty:    { type: Number, default: 0 },
  reorderLevel:  { type: Number, default: 0 },
  // Valuation
  valuationMethod: { type: String, enum: ["fifo", "lifo", "weighted_avg", "standard"], default: "weighted_avg" },
  currentValue:  { type: Number, default: 0 },        // total stock value
  // Godown / Location
  godown:        { type: String, default: "Main" },
  // Batch tracking
  batchEnabled:  { type: Boolean, default: false },
  expiryTracking: { type: Boolean, default: false },
  description:   String,
  isActive:      { type: Boolean, default: true },
  orgId:         { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

stockItemSchema.index({ orgId: 1, name: 1 });
stockItemSchema.index({ orgId: 1, currentQty: 1 });

// ─── Stock Movement (In/Out log) ──────────────────────────────
const stockMovementSchema = new mongoose.Schema({
  stockItemId: { type: mongoose.Schema.Types.ObjectId, ref: "StockItem", required: true, index: true },
  type:        { type: String, enum: ["in", "out", "adjustment", "transfer", "return"], required: true },
  quantity:    { type: Number, required: true },
  rate:        { type: Number, default: 0 },
  totalValue:  { type: Number, default: 0 },
  // Reference
  referenceType: { type: String, enum: ["purchase_order", "sales_order", "invoice", "manual", "return", ""] },
  referenceId:   { type: mongoose.Schema.Types.ObjectId },
  referenceNumber: String,
  // Batch
  batchNumber: String,
  expiryDate:  Date,
  // Location
  fromGodown:  String,
  toGodown:    String,
  narration:   String,
  date:        { type: Date, default: Date.now },
  orgId:       { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

stockMovementSchema.index({ orgId: 1, date: -1 });

// ─── Purchase / Sales Order ────────────────────────────────────
const orderItemSchema = new mongoose.Schema({
  stockItemId:   { type: mongoose.Schema.Types.ObjectId, ref: "StockItem" },
  name:          String,
  quantity:      { type: Number, default: 1 },
  rate:          { type: Number, default: 0 },
  taxPercent:    { type: Number, default: 18 },
  taxAmount:     { type: Number, default: 0 },
  total:         { type: Number, default: 0 },
  deliveredQty:  { type: Number, default: 0 },
}, { _id: true });

const orderSchema = new mongoose.Schema({
  orderNumber:  { type: String, required: true },
  type:         { type: String, enum: ["purchase", "sales"], required: true },
  status:       { type: String, enum: ["draft", "confirmed", "partially_delivered", "delivered", "cancelled"], default: "draft" },
  // Party
  partyName:    String,
  partyEmail:   String,
  partyPhone:   String,
  partyAddress: String,
  partyGstin:   String,
  // Items
  items:        { type: [orderItemSchema], default: [] },
  subtotal:     { type: Number, default: 0 },
  taxTotal:     { type: Number, default: 0 },
  discount:     { type: Number, default: 0 },
  grandTotal:   { type: Number, default: 0 },
  currency:     { type: String, default: "INR" },
  // Dates
  orderDate:    { type: Date, default: Date.now },
  expectedDate: Date,
  deliveredDate: Date,
  notes:        String,
  orgId:        { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

orderSchema.index({ orgId: 1, type: 1, createdAt: -1 });

orderSchema.statics.nextNumber = async function (orgId, type) {
  const prefix = type === "purchase" ? "PO" : "SO";
  const last = await this.findOne({ orgId, type }).sort({ createdAt: -1 }).select("orderNumber").lean();
  if (!last) return `${prefix}-001`;
  const num = parseInt(last.orderNumber.replace(/\D/g, ""), 10) || 0;
  return `${prefix}-${String(num + 1).padStart(3, "0")}`;
};

const StockGroup = mongoose.models.StockGroup || mongoose.model("StockGroup", stockGroupSchema);
const StockItem = mongoose.models.StockItem || mongoose.model("StockItem", stockItemSchema);
const StockMovement = mongoose.models.StockMovement || mongoose.model("StockMovement", stockMovementSchema);
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

module.exports = { StockGroup, StockItem, StockMovement, Order };
