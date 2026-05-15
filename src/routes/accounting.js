const express = require("express");
const { auth } = require("../middleware/auth");
const { LedgerGroup, Ledger, Voucher } = require("../db/mongoose");

const router = express.Router();
router.use(auth);

// ═══════════════════════════════════════════════════════════════
// LEDGER GROUPS (Chart of Accounts)
// ═══════════════════════════════════════════════════════════════

router.get("/groups", async (req, res) => {
  try {
    await LedgerGroup.seedDefaults(req.user.orgId);
    const groups = await LedgerGroup.find({ orgId: req.user.orgId }).sort({ nature: 1, name: 1 }).lean();
    res.json({ success: true, groups });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/groups", async (req, res) => {
  try {
    const g = await LedgerGroup.create({ ...req.body, orgId: req.user.orgId });
    res.json({ success: true, group: g });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// LEDGERS
// ═══════════════════════════════════════════════════════════════

router.get("/ledgers", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.groupId) filter.groupId = req.query.groupId;
    if (req.query.linkedType) filter.linkedType = req.query.linkedType;
    const ledgers = await Ledger.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, ledgers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/ledgers", async (req, res) => {
  try {
    const group = await LedgerGroup.findById(req.body.groupId);
    const l = await Ledger.create({ ...req.body, nature: group?.nature, orgId: req.user.orgId });
    res.json({ success: true, ledger: l });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/ledgers/:id", async (req, res) => {
  try {
    const l = await Ledger.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    if (!l) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, ledger: l });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// VOUCHERS
// ═══════════════════════════════════════════════════════════════

router.get("/vouchers", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }
    const vouchers = await Voucher.find(filter).sort({ date: -1 }).limit(200).lean();
    res.json({ success: true, vouchers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/vouchers", async (req, res) => {
  try {
    const voucherNumber = await Voucher.nextNumber(req.user.orgId, req.body.type);
    const data = { ...req.body, voucherNumber, orgId: req.user.orgId };
    // Calculate totals
    let totalDebit = 0, totalCredit = 0;
    (data.entries || []).forEach(e => { totalDebit += (e.debit || 0); totalCredit += (e.credit || 0); });
    data.totalDebit = totalDebit;
    data.totalCredit = totalCredit;
    const v = await Voucher.create(data);
    // Update ledger balances
    for (const entry of (data.entries || [])) {
      const inc = (entry.debit || 0) - (entry.credit || 0);
      await Ledger.findByIdAndUpdate(entry.ledgerId, { $inc: { currentBalance: inc } });
    }
    res.json({ success: true, voucher: v });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/vouchers/:id", async (req, res) => {
  try {
    const v = await Voucher.findOne({ _id: req.params.id, orgId: req.user.orgId }).lean();
    if (!v) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, voucher: v });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// FINANCIAL STATEMENTS
// ═══════════════════════════════════════════════════════════════

// Trial Balance
router.get("/reports/trial-balance", async (req, res) => {
  try {
    const ledgers = await Ledger.find({ orgId: req.user.orgId, isActive: true }).populate("groupId", "name nature").lean();
    let totalDebit = 0, totalCredit = 0;
    const rows = ledgers.map(l => {
      const bal = l.currentBalance || 0;
      const debit = bal >= 0 ? bal : 0;
      const credit = bal < 0 ? Math.abs(bal) : 0;
      totalDebit += debit; totalCredit += credit;
      return { ledgerId: l._id, name: l.name, group: l.groupId?.name, nature: l.nature, debit, credit, balance: bal };
    }).filter(r => r.debit > 0 || r.credit > 0);
    res.json({ success: true, rows, totalDebit, totalCredit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Profit & Loss
router.get("/reports/profit-loss", async (req, res) => {
  try {
    const ledgers = await Ledger.find({ orgId: req.user.orgId, isActive: true, nature: { $in: ["income", "expenses"] } }).lean();
    const income = ledgers.filter(l => l.nature === "income");
    const expenses = ledgers.filter(l => l.nature === "expenses");
    const totalIncome = income.reduce((a, l) => a + Math.abs(l.currentBalance || 0), 0);
    const totalExpenses = expenses.reduce((a, l) => a + Math.abs(l.currentBalance || 0), 0);
    const netProfit = totalIncome - totalExpenses;
    res.json({ success: true, income, expenses, totalIncome, totalExpenses, netProfit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Balance Sheet
router.get("/reports/balance-sheet", async (req, res) => {
  try {
    const ledgers = await Ledger.find({ orgId: req.user.orgId, isActive: true, nature: { $in: ["assets", "liabilities"] } }).lean();
    const assets = ledgers.filter(l => l.nature === "assets");
    const liabilities = ledgers.filter(l => l.nature === "liabilities");
    const totalAssets = assets.reduce((a, l) => a + Math.abs(l.currentBalance || 0), 0);
    const totalLiabilities = liabilities.reduce((a, l) => a + Math.abs(l.currentBalance || 0), 0);
    res.json({ success: true, assets, liabilities, totalAssets, totalLiabilities });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Day Book
router.get("/reports/daybook", async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const from = req.query.from ? new Date(req.query.from) : today;
    const to = req.query.to ? new Date(req.query.to) : tomorrow;
    const vouchers = await Voucher.find({ orgId: req.user.orgId, date: { $gte: from, $lt: to } }).sort({ date: -1 }).lean();
    res.json({ success: true, vouchers, from, to });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Receivables Aging
router.get("/reports/aging", async (req, res) => {
  try {
    const { Invoice } = require("../db/mongoose");
    const invoices = await Invoice.find({ orgId: req.user.orgId, status: { $in: ["sent", "partially_paid", "overdue"] } }).sort({ dueDate: 1 }).lean();
    const now = new Date();
    const buckets = { current: [], days30: [], days60: [], days90: [], over90: [] };
    invoices.forEach(inv => {
      const days = inv.dueDate ? Math.floor((now - new Date(inv.dueDate)) / 86400000) : 0;
      if (days <= 0) buckets.current.push(inv);
      else if (days <= 30) buckets.days30.push(inv);
      else if (days <= 60) buckets.days60.push(inv);
      else if (days <= 90) buckets.days90.push(inv);
      else buckets.over90.push(inv);
    });
    const summary = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { count: v.length, total: v.reduce((a, i) => a + (i.amountDue || 0), 0) }]));
    res.json({ success: true, buckets, summary });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
