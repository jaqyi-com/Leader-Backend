const express = require("express");
const { auth } = require("../middleware/auth");
const { StockGroup, StockItem, StockMovement, Order } = require("../db/mongoose");

const router = express.Router();
router.use(auth);

// ═══════════════════════════════════════════════════════════════
// STOCK GROUPS
// ═══════════════════════════════════════════════════════════════

router.get("/groups", async (req, res) => {
  try {
    const groups = await StockGroup.find({ orgId: req.user.orgId }).sort({ name: 1 }).lean();
    res.json({ success: true, groups });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/groups", async (req, res) => {
  try {
    const g = await StockGroup.create({ ...req.body, orgId: req.user.orgId });
    res.json({ success: true, group: g });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// STOCK ITEMS
// ═══════════════════════════════════════════════════════════════

router.get("/items", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.groupId) filter.groupId = req.query.groupId;
    if (req.query.lowStock === "true") filter.currentQty = { $lte: "$reorderLevel" };
    const items = await StockItem.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/items", async (req, res) => {
  try {
    const item = await StockItem.create({ ...req.body, currentQty: req.body.openingQty || 0, orgId: req.user.orgId });
    res.json({ success: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/items/:id", async (req, res) => {
  try {
    const item = await StockItem.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/items/:id", async (req, res) => {
  try {
    const item = await StockItem.findOne({ _id: req.params.id, orgId: req.user.orgId }).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    const movements = await StockMovement.find({ stockItemId: item._id, orgId: req.user.orgId }).sort({ date: -1 }).limit(50).lean();
    res.json({ success: true, item, movements });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reorder alerts
router.get("/alerts/reorder", async (req, res) => {
  try {
    const items = await StockItem.find({ orgId: req.user.orgId, isActive: true }).lean();
    const alerts = items.filter(i => i.reorderLevel > 0 && i.currentQty <= i.reorderLevel);
    res.json({ success: true, alerts, total: alerts.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// STOCK MOVEMENTS
// ═══════════════════════════════════════════════════════════════

router.post("/movements", async (req, res) => {
  try {
    const data = { ...req.body, orgId: req.user.orgId };
    data.totalValue = (data.quantity || 0) * (data.rate || 0);
    const mv = await StockMovement.create(data);
    // Update stock quantity
    const qtyChange = data.type === "in" || data.type === "return" ? data.quantity : -data.quantity;
    await StockItem.findByIdAndUpdate(data.stockItemId, { $inc: { currentQty: qtyChange } });
    res.json({ success: true, movement: mv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/movements", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.stockItemId) filter.stockItemId = req.query.stockItemId;
    if (req.query.type) filter.type = req.query.type;
    const movements = await StockMovement.find(filter).sort({ date: -1 }).limit(200).lean();
    res.json({ success: true, movements });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// PURCHASE & SALES ORDERS
// ═══════════════════════════════════════════════════════════════

router.get("/orders", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, orders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/orders", async (req, res) => {
  try {
    const orderNumber = await Order.nextNumber(req.user.orgId, req.body.type);
    const data = { ...req.body, orderNumber, orgId: req.user.orgId };
    let subtotal = 0, taxTotal = 0;
    (data.items || []).forEach(item => {
      item.total = (item.quantity || 1) * (item.rate || 0);
      item.taxAmount = item.total * ((item.taxPercent || 0) / 100);
      subtotal += item.total; taxTotal += item.taxAmount;
    });
    data.subtotal = subtotal; data.taxTotal = taxTotal;
    data.grandTotal = subtotal + taxTotal - (data.discount || 0);
    const order = await Order.create(data);
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/orders/:id", async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stock summary report
router.get("/reports/summary", async (req, res) => {
  try {
    const items = await StockItem.find({ orgId: req.user.orgId, isActive: true }).lean();
    const totalItems = items.length;
    const totalValue = items.reduce((a, i) => a + ((i.currentQty || 0) * (i.purchaseRate || 0)), 0);
    const lowStock = items.filter(i => i.reorderLevel > 0 && i.currentQty <= i.reorderLevel).length;
    const outOfStock = items.filter(i => i.currentQty <= 0).length;
    res.json({ success: true, totalItems, totalValue, lowStock, outOfStock, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
