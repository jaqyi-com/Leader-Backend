const express = require("express");
const { auth } = require("../middleware/auth");
const { Deal, Pipeline, Activity, Quotation, Invoice, Payment, GeneratedLead } = require("../db/mongoose");

const router = express.Router();
router.use(auth);

// ═══════════════════════════════════════════════════════════════════
// PIPELINES
// ═══════════════════════════════════════════════════════════════════

router.get("/pipelines", async (req, res) => {
  try {
    let pipelines = await Pipeline.find({ orgId: req.user.orgId }).sort({ createdAt: 1 }).lean();
    if (!pipelines.length) {
      const def = await Pipeline.getOrCreateDefault(req.user.orgId);
      pipelines = [def.toObject()];
    }
    res.json({ success: true, pipelines });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/pipelines", async (req, res) => {
  try {
    const { name, stages } = req.body;
    const p = await Pipeline.create({ name: name || "New Pipeline", stages: stages || [], orgId: req.user.orgId });
    res.json({ success: true, pipeline: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/pipelines/:id", async (req, res) => {
  try {
    const p = await Pipeline.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    if (!p) return res.status(404).json({ error: "Pipeline not found" });
    res.json({ success: true, pipeline: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// DEALS
// ═══════════════════════════════════════════════════════════════════

router.get("/deals", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.pipelineId) filter.pipelineId = req.query.pipelineId;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    const deals = await Deal.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, deals, total: deals.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kanban board — deals grouped by stage
router.get("/deals/board", async (req, res) => {
  try {
    const pipeline = await Pipeline.getOrCreateDefault(req.user.orgId);
    const pFilter = { orgId: req.user.orgId };
    if (req.query.pipelineId) pFilter.pipelineId = req.query.pipelineId;
    const deals = await Deal.find(pFilter).sort({ stageOrder: 1, createdAt: -1 }).lean();
    const board = {};
    pipeline.stages.forEach(s => { board[s.stageId] = []; });
    deals.forEach(d => {
      if (board[d.stage]) board[d.stage].push(d);
      else if (board["new_lead"]) board["new_lead"].push(d);
    });
    res.json({ success: true, pipeline, board });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/deals", async (req, res) => {
  try {
    const pipeline = await Pipeline.getOrCreateDefault(req.user.orgId);
    const deal = await Deal.create({ ...req.body, pipelineId: pipeline._id, orgId: req.user.orgId });
    await Activity.create({
      type: "deal_created", title: `Deal "${deal.title}" created`,
      dealId: deal._id, companyName: deal.companyName, orgId: req.user.orgId,
    });
    res.json({ success: true, deal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/deals/:id", async (req, res) => {
  try {
    const deal = await Deal.findOne({ _id: req.params.id, orgId: req.user.orgId }).lean();
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    const activities = await Activity.find({ dealId: deal._id, orgId: req.user.orgId }).sort({ createdAt: -1 }).lean();
    const quotations = await Quotation.find({ dealId: deal._id, orgId: req.user.orgId }).sort({ createdAt: -1 }).lean();
    const invoices = await Invoice.find({ dealId: deal._id, orgId: req.user.orgId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, deal, activities, quotations, invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/deals/:id", async (req, res) => {
  try {
    const deal = await Deal.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    res.json({ success: true, deal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch("/deals/:id/stage", async (req, res) => {
  try {
    const { stage } = req.body;
    const deal = await Deal.findOne({ _id: req.params.id, orgId: req.user.orgId });
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    const oldStage = deal.stage;
    deal.stage = stage;
    // Auto-set probability from pipeline
    const pipeline = await Pipeline.findById(deal.pipelineId);
    if (pipeline) {
      const stageInfo = pipeline.stages.find(s => s.stageId === stage);
      if (stageInfo) deal.probability = stageInfo.probability;
    }
    await deal.save();
    await Activity.create({
      type: "stage_change", title: `Stage changed: ${oldStage} → ${stage}`,
      dealId: deal._id, companyName: deal.companyName, orgId: req.user.orgId,
      metadata: { from: oldStage, to: stage },
    });
    res.json({ success: true, deal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch("/deals/:id/won", async (req, res) => {
  try {
    const deal = await Deal.findOne({ _id: req.params.id, orgId: req.user.orgId });
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    deal.stage = "won"; deal.probability = 100; deal.actualCloseDate = new Date();
    await deal.save();
    await Activity.create({
      type: "deal_won", title: `Deal Won! "${deal.title}" — ₹${(deal.value || 0).toLocaleString("en-IN")}`,
      dealId: deal._id, companyName: deal.companyName, orgId: req.user.orgId,
    });
    res.json({ success: true, deal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch("/deals/:id/lost", async (req, res) => {
  try {
    const deal = await Deal.findOne({ _id: req.params.id, orgId: req.user.orgId });
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    deal.stage = "lost"; deal.probability = 0; deal.actualCloseDate = new Date();
    deal.lostReason = req.body.reason || "";
    await deal.save();
    await Activity.create({
      type: "deal_lost", title: `Deal Lost: "${deal.title}"${deal.lostReason ? ` — ${deal.lostReason}` : ""}`,
      dealId: deal._id, companyName: deal.companyName, orgId: req.user.orgId,
    });
    res.json({ success: true, deal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/deals/:id", async (req, res) => {
  try {
    await Deal.deleteOne({ _id: req.params.id, orgId: req.user.orgId });
    await Activity.deleteMany({ dealId: req.params.id, orgId: req.user.orgId });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Convert a GeneratedLead into a Deal
router.post("/deals/convert", async (req, res) => {
  try {
    const { leadId, title, value, source } = req.body;
    const lead = await GeneratedLead.findOne({ _id: leadId, orgId: req.user.orgId });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    const pipeline = await Pipeline.getOrCreateDefault(req.user.orgId);
    const deal = await Deal.create({
      title: title || `${lead.companyName || lead.fullName || "New"} — Deal`,
      value: value || 0, stage: "new_lead", source: source || lead.source || "manual",
      contactId: lead._id, contactName: lead.fullName, contactEmail: lead.email,
      contactPhone: lead.phone, companyName: lead.companyName, companyDomain: lead.companyDomain,
      pipelineId: pipeline._id, orgId: req.user.orgId,
    });
    lead.status = "qualified"; await lead.save();
    await Activity.create({
      type: "deal_created", title: `Deal created from lead: ${lead.fullName || lead.email}`,
      dealId: deal._id, contactId: lead._id, companyName: deal.companyName, orgId: req.user.orgId,
    });
    res.json({ success: true, deal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dashboard stats
router.get("/deals/stats", async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const allDeals = await Deal.find({ orgId }).lean();
    const wonDeals = allDeals.filter(d => d.stage === "won");
    const lostDeals = allDeals.filter(d => d.stage === "lost");
    const closedDeals = [...wonDeals, ...lostDeals];
    const wonThisMonth = wonDeals.filter(d => d.actualCloseDate >= monthStart);
    const lostThisMonth = lostDeals.filter(d => d.actualCloseDate >= monthStart);
    const pipeline = await Pipeline.getOrCreateDefault(orgId);
    const stageStats = pipeline.stages.map(s => {
      const stageDeals = allDeals.filter(d => d.stage === s.stageId);
      return { stageId: s.stageId, name: s.name, color: s.color, count: stageDeals.length, value: stageDeals.reduce((a, d) => a + (d.value || 0), 0) };
    });
    const totalPipelineValue = allDeals.filter(d => d.stage !== "won" && d.stage !== "lost").reduce((a, d) => a + (d.value || 0), 0);
    const winRate = closedDeals.length > 0 ? Math.round((wonDeals.length / closedDeals.length) * 100) : 0;
    const wonTotal = wonDeals.reduce((a, d) => a + (d.value || 0), 0);
    const avgDealSize = wonDeals.length > 0 ? Math.round(wonTotal / wonDeals.length) : 0;
    // Overdue follow-ups
    const overdueTasks = await Activity.countDocuments({ orgId, completed: false, dueDate: { $lt: now }, type: { $in: ["task", "follow_up"] } });
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const todayTasks = await Activity.countDocuments({ orgId, completed: false, dueDate: { $gte: todayStart, $lt: todayEnd }, type: { $in: ["task", "follow_up"] } });
    // Outstanding invoices
    const outstandingInvoices = await Invoice.find({ orgId, status: { $in: ["sent", "partially_paid", "overdue"] } }).lean();
    const totalReceivable = outstandingInvoices.reduce((a, i) => a + (i.amountDue || 0), 0);
    res.json({
      success: true,
      stats: {
        totalDeals: allDeals.length, totalPipelineValue, winRate, avgDealSize,
        wonThisMonth: wonThisMonth.length, wonThisMonthValue: wonThisMonth.reduce((a, d) => a + (d.value || 0), 0),
        lostThisMonth: lostThisMonth.length, totalWonValue: wonTotal,
        stageStats, overdueTasks, todayTasks, totalReceivable,
        outstandingInvoices: outstandingInvoices.length,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════════════════════════════

router.get("/activities", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.dealId) filter.dealId = req.query.dealId;
    if (req.query.type) filter.type = req.query.type;
    const limit = parseInt(req.query.limit) || 100;
    const activities = await Activity.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, activities });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/activities", async (req, res) => {
  try {
    const act = await Activity.create({ ...req.body, orgId: req.user.orgId });
    res.json({ success: true, activity: act });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/activities/:id", async (req, res) => {
  try {
    const act = await Activity.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    if (!act) return res.status(404).json({ error: "Activity not found" });
    res.json({ success: true, activity: act });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch("/activities/:id/complete", async (req, res) => {
  try {
    const act = await Activity.findOneAndUpdate(
      { _id: req.params.id, orgId: req.user.orgId },
      { completed: true, completedAt: new Date() },
      { new: true }
    );
    if (!act) return res.status(404).json({ error: "Activity not found" });
    res.json({ success: true, activity: act });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/activities/:id", async (req, res) => {
  try {
    await Activity.deleteOne({ _id: req.params.id, orgId: req.user.orgId });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/activities/upcoming", async (req, res) => {
  try {
    const now = new Date();
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    const tasks = await Activity.find({
      orgId: req.user.orgId, completed: false,
      type: { $in: ["task", "follow_up", "meeting", "call"] },
      dueDate: { $lte: weekEnd },
    }).sort({ dueDate: 1 }).lean();
    const overdue = tasks.filter(t => t.dueDate < now);
    const today = tasks.filter(t => {
      const d = new Date(t.dueDate);
      return d.toDateString() === now.toDateString();
    });
    const upcoming = tasks.filter(t => t.dueDate > now && t.dueDate <= weekEnd);
    res.json({ success: true, overdue, today, upcoming });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// QUOTATIONS
// ═══════════════════════════════════════════════════════════════════

router.get("/quotations", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.dealId) filter.dealId = req.query.dealId;
    if (req.query.status) filter.status = req.query.status;
    const quotations = await Quotation.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, quotations });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/quotations", async (req, res) => {
  try {
    const quotationNumber = await Quotation.nextNumber(req.user.orgId);
    const data = { ...req.body, quotationNumber, orgId: req.user.orgId };
    // Recalculate totals
    let subtotal = 0, taxTotal = 0;
    (data.items || []).forEach(item => {
      item.total = (item.quantity || 1) * (item.rate || 0);
      item.taxAmount = item.total * ((item.taxPercent || 0) / 100);
      subtotal += item.total;
      taxTotal += item.taxAmount;
    });
    data.subtotal = subtotal;
    data.taxTotal = taxTotal;
    const discountAmt = data.discountPercent ? subtotal * (data.discountPercent / 100) : (data.discount || 0);
    data.grandTotal = subtotal + taxTotal - discountAmt;
    const qt = await Quotation.create(data);
    // Log activity
    if (data.dealId) {
      await Activity.create({
        type: "quotation_sent", title: `Quotation ${quotationNumber} created — ₹${qt.grandTotal.toLocaleString("en-IN")}`,
        dealId: data.dealId, companyName: data.companyName, orgId: req.user.orgId,
      });
    }
    res.json({ success: true, quotation: qt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/quotations/:id", async (req, res) => {
  try {
    const data = req.body;
    // Recalculate
    if (data.items) {
      let subtotal = 0, taxTotal = 0;
      data.items.forEach(item => {
        item.total = (item.quantity || 1) * (item.rate || 0);
        item.taxAmount = item.total * ((item.taxPercent || 0) / 100);
        subtotal += item.total; taxTotal += item.taxAmount;
      });
      data.subtotal = subtotal; data.taxTotal = taxTotal;
      const discountAmt = data.discountPercent ? subtotal * (data.discountPercent / 100) : (data.discount || 0);
      data.grandTotal = subtotal + taxTotal - discountAmt;
    }
    const qt = await Quotation.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, data, { new: true });
    if (!qt) return res.status(404).json({ error: "Quotation not found" });
    res.json({ success: true, quotation: qt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch("/quotations/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const qt = await Quotation.findOneAndUpdate(
      { _id: req.params.id, orgId: req.user.orgId },
      { status, ...(status === "sent" ? { sentAt: new Date() } : {}) },
      { new: true }
    );
    if (!qt) return res.status(404).json({ error: "Quotation not found" });
    if (qt.dealId && (status === "accepted" || status === "rejected")) {
      await Activity.create({
        type: status === "accepted" ? "quotation_accepted" : "quotation_rejected",
        title: `Quotation ${qt.quotationNumber} ${status}`,
        dealId: qt.dealId, companyName: qt.companyName, orgId: req.user.orgId,
      });
    }
    res.json({ success: true, quotation: qt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// INVOICES (Phase 2)
// ═══════════════════════════════════════════════════════════════════

router.get("/invoices", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.dealId) filter.dealId = req.query.dealId;
    const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/invoices", async (req, res) => {
  try {
    const invoiceNumber = await Invoice.nextNumber(req.user.orgId);
    const data = { ...req.body, invoiceNumber, orgId: req.user.orgId };
    // Calculate totals
    let subtotal = 0, taxTotal = 0;
    (data.items || []).forEach(item => {
      item.total = (item.quantity || 1) * (item.rate || 0);
      item.taxAmount = item.total * ((item.taxPercent || 0) / 100);
      subtotal += item.total; taxTotal += item.taxAmount;
    });
    data.subtotal = subtotal; data.taxTotal = taxTotal;
    const discountAmt = data.discountPercent ? subtotal * (data.discountPercent / 100) : (data.discount || 0);
    data.grandTotal = subtotal + taxTotal - discountAmt;
    data.amountDue = data.grandTotal - (data.amountPaid || 0);
    const inv = await Invoice.create(data);
    if (data.dealId) {
      await Activity.create({
        type: "invoice_created", title: `Invoice ${invoiceNumber} created — ₹${inv.grandTotal.toLocaleString("en-IN")}`,
        dealId: data.dealId, companyName: data.companyName, orgId: req.user.orgId,
      });
    }
    res.json({ success: true, invoice: inv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Convert quotation to invoice
router.post("/invoices/from-quotation/:quotationId", async (req, res) => {
  try {
    const qt = await Quotation.findOne({ _id: req.params.quotationId, orgId: req.user.orgId });
    if (!qt) return res.status(404).json({ error: "Quotation not found" });
    const invoiceNumber = await Invoice.nextNumber(req.user.orgId);
    const inv = await Invoice.create({
      invoiceNumber, dealId: qt.dealId, quotationId: qt._id,
      contactName: qt.contactName, contactEmail: qt.contactEmail, contactPhone: qt.contactPhone,
      companyName: qt.companyName, billingAddress: qt.companyAddress,
      items: qt.items, subtotal: qt.subtotal, taxTotal: qt.taxTotal,
      discount: qt.discount, discountPercent: qt.discountPercent,
      grandTotal: qt.grandTotal, amountDue: qt.grandTotal, currency: qt.currency,
      dueDate: new Date(Date.now() + 30 * 86400000), // 30 days
      notes: qt.notes, terms: qt.terms, orgId: req.user.orgId,
    });
    qt.status = "converted"; await qt.save();
    if (qt.dealId) {
      await Activity.create({
        type: "invoice_created", title: `Invoice ${invoiceNumber} created from Quotation ${qt.quotationNumber}`,
        dealId: qt.dealId, companyName: qt.companyName, orgId: req.user.orgId,
      });
    }
    res.json({ success: true, invoice: inv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/invoices/:id", async (req, res) => {
  try {
    const inv = await Invoice.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    res.json({ success: true, invoice: inv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════════

router.post("/payments", async (req, res) => {
  try {
    const { invoiceId, amount, method, reference, paymentDate, notes } = req.body;
    const inv = await Invoice.findOne({ _id: invoiceId, orgId: req.user.orgId });
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    const pmt = await Payment.create({
      invoiceId, dealId: inv.dealId, amount, method, reference,
      paymentDate: paymentDate || new Date(), notes, orgId: req.user.orgId,
    });
    // Update invoice
    inv.amountPaid = (inv.amountPaid || 0) + amount;
    inv.amountDue = inv.grandTotal - inv.amountPaid;
    if (inv.amountDue <= 0) { inv.status = "paid"; inv.paidAt = new Date(); }
    else { inv.status = "partially_paid"; }
    await inv.save();
    if (inv.dealId) {
      await Activity.create({
        type: "payment_received", title: `Payment received: ₹${amount.toLocaleString("en-IN")} via ${method}`,
        dealId: inv.dealId, companyName: inv.companyName, orgId: req.user.orgId,
        metadata: { invoiceNumber: inv.invoiceNumber, paymentId: pmt._id },
      });
    }
    res.json({ success: true, payment: pmt, invoice: inv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/payments", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.invoiceId) filter.invoiceId = req.query.invoiceId;
    const payments = await Payment.find(filter).sort({ paymentDate: -1 }).lean();
    res.json({ success: true, payments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Receivables / Payables summary
router.get("/ledger/receivables", async (req, res) => {
  try {
    const invoices = await Invoice.find({
      orgId: req.user.orgId, status: { $in: ["sent", "partially_paid", "overdue"] },
    }).sort({ dueDate: 1 }).lean();
    const now = new Date();
    const overdue = invoices.filter(i => i.dueDate && i.dueDate < now);
    const totalReceivable = invoices.reduce((a, i) => a + (i.amountDue || 0), 0);
    const overdueAmount = overdue.reduce((a, i) => a + (i.amountDue || 0), 0);
    res.json({ success: true, invoices, totalReceivable, overdueAmount, overdueCount: overdue.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
