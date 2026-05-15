const express = require("express");
const { auth } = require("../middleware/auth");
const { Employee, SalaryStructure, Payslip, Attendance } = require("../db/mongoose");

const router = express.Router();
router.use(auth);

// ═══════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════

router.get("/employees", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = req.query.department;
    const employees = await Employee.find(filter).sort({ fullName: 1 }).lean();
    res.json({ success: true, employees });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/employees", async (req, res) => {
  try {
    const employeeId = await Employee.nextId(req.user.orgId);
    const emp = await Employee.create({ ...req.body, employeeId, orgId: req.user.orgId });
    res.json({ success: true, employee: emp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/employees/:id", async (req, res) => {
  try {
    const emp = await Employee.findOne({ _id: req.params.id, orgId: req.user.orgId }).lean();
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, employee: emp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/employees/:id", async (req, res) => {
  try {
    const emp = await Employee.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, employee: emp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// SALARY STRUCTURES
// ═══════════════════════════════════════════════════════════════

router.get("/salary-structures", async (req, res) => {
  try {
    const structures = await SalaryStructure.find({ orgId: req.user.orgId }).lean();
    if (structures.length === 0) {
      const def = await SalaryStructure.getOrCreateDefault(req.user.orgId);
      return res.json({ success: true, structures: [def.toObject()] });
    }
    res.json({ success: true, structures });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/salary-structures", async (req, res) => {
  try {
    const s = await SalaryStructure.create({ ...req.body, orgId: req.user.orgId });
    res.json({ success: true, structure: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/salary-structures/:id", async (req, res) => {
  try {
    const s = await SalaryStructure.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, req.body, { new: true });
    res.json({ success: true, structure: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// PAYROLL RUN (generate payslips)
// ═══════════════════════════════════════════════════════════════

router.post("/run", async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: "month and year required" });

    // Check if already run
    const existing = await Payslip.countDocuments({ orgId: req.user.orgId, month, year });
    if (existing > 0) return res.status(400).json({ error: `Payroll already generated for ${month}/${year}. Delete existing payslips first.` });

    const employees = await Employee.find({ orgId: req.user.orgId, status: "active" }).lean();
    const payslips = [];

    for (const emp of employees) {
      let structure = null;
      if (emp.salaryStructureId) {
        structure = await SalaryStructure.findById(emp.salaryStructureId).lean();
      }
      if (!structure) {
        const def = await SalaryStructure.getOrCreateDefault(req.user.orgId);
        structure = def.toObject ? def.toObject() : def;
      }

      // Attendance
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const workingDays = endDate.getDate();
      const attendanceRecords = await Attendance.find({ orgId: req.user.orgId, employeeId: emp._id, date: { $gte: startDate, $lte: endDate } }).lean();
      const presentDays = attendanceRecords.filter(a => a.status === "present" || a.status === "half_day").length;
      const halfDays = attendanceRecords.filter(a => a.status === "half_day").length;
      const leaveDays = attendanceRecords.filter(a => a.status === "leave").length;
      const effectiveDays = presentDays - (halfDays * 0.5);
      const lopDays = Math.max(0, workingDays - effectiveDays - leaveDays - attendanceRecords.filter(a => a.status === "holiday" || a.status === "week_off").length);

      // Calculate salary
      const monthlyCTC = (emp.ctc || 0) / 12;
      const basicPercent = structure.components.find(c => c.name === "Basic")?.value || 40;
      const basicPay = monthlyCTC * (basicPercent / 100);

      const earnings = [];
      const deductions = [];
      let totalEarnings = 0, totalDeductions = 0;

      for (const comp of structure.components) {
        let amount = 0;
        if (comp.calcType === "fixed") amount = comp.value;
        else if (comp.calcType === "percent_of_basic") amount = basicPay * (comp.value / 100);
        else if (comp.calcType === "percent_of_ctc") amount = monthlyCTC * (comp.value / 100);

        // Prorate for LOP
        if (lopDays > 0 && workingDays > 0) {
          amount = amount * ((workingDays - lopDays) / workingDays);
        }
        amount = Math.round(amount);

        if (comp.type === "earning") { earnings.push({ name: comp.name, amount }); totalEarnings += amount; }
        else { deductions.push({ name: comp.name, amount }); totalDeductions += amount; }
      }

      const employerPf = Math.round(basicPay * ((structure.employerPfPercent || 12) / 100));
      const employerEsi = totalEarnings <= 21000 ? Math.round(totalEarnings * ((structure.employerEsiPercent || 3.25) / 100)) : 0;
      const netPay = totalEarnings - totalDeductions;

      const ps = await Payslip.create({
        employeeId: emp._id, employeeName: emp.fullName, employeeCode: emp.employeeId,
        designation: emp.designation, department: emp.department,
        month, year, workingDays, presentDays: Math.round(effectiveDays), leaveDays, lopDays: Math.round(lopDays),
        earnings, totalEarnings, deductions, totalDeductions, netPay,
        employerPf, employerEsi, orgId: req.user.orgId,
      });
      payslips.push(ps);
    }

    res.json({ success: true, payslips, count: payslips.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get payslips
router.get("/payslips", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.month) filter.month = Number(req.query.month);
    if (req.query.year) filter.year = Number(req.query.year);
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    const payslips = await Payslip.find(filter).sort({ employeeName: 1 }).lean();
    res.json({ success: true, payslips });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Approve / Pay payslip
router.patch("/payslips/:id/approve", async (req, res) => {
  try {
    const ps = await Payslip.findOneAndUpdate({ _id: req.params.id, orgId: req.user.orgId }, { status: "approved" }, { new: true });
    res.json({ success: true, payslip: ps });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch("/payslips/:id/pay", async (req, res) => {
  try {
    const ps = await Payslip.findOneAndUpdate(
      { _id: req.params.id, orgId: req.user.orgId },
      { status: "paid", paidAt: new Date(), paymentMode: req.body.paymentMode || "bank_transfer" },
      { new: true }
    );
    res.json({ success: true, payslip: ps });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete payslips for a month (re-run)
router.delete("/payslips", async (req, res) => {
  try {
    const { month, year } = req.query;
    await Payslip.deleteMany({ orgId: req.user.orgId, month: Number(month), year: Number(year), status: "draft" });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════════

router.get("/attendance", async (req, res) => {
  try {
    const filter = { orgId: req.user.orgId };
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }
    const records = await Attendance.find(filter).sort({ date: -1 }).limit(500).lean();
    res.json({ success: true, records });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/attendance", async (req, res) => {
  try {
    const record = await Attendance.findOneAndUpdate(
      { orgId: req.user.orgId, employeeId: req.body.employeeId, date: new Date(req.body.date) },
      { ...req.body, orgId: req.user.orgId },
      { upsert: true, new: true }
    );
    res.json({ success: true, record });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk attendance
router.post("/attendance/bulk", async (req, res) => {
  try {
    const { records } = req.body; // [{ employeeId, date, status, checkIn, checkOut }]
    const ops = (records || []).map(r => ({
      updateOne: {
        filter: { orgId: req.user.orgId, employeeId: r.employeeId, date: new Date(r.date) },
        update: { $set: { ...r, orgId: req.user.orgId } },
        upsert: true,
      },
    }));
    await Attendance.bulkWrite(ops);
    res.json({ success: true, count: ops.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Payroll summary
router.get("/summary", async (req, res) => {
  try {
    const employees = await Employee.find({ orgId: req.user.orgId }).lean();
    const active = employees.filter(e => e.status === "active").length;
    const totalCtc = employees.filter(e => e.status === "active").reduce((a, e) => a + (e.ctc || 0), 0);
    const now = new Date();
    const thisMonthPayslips = await Payslip.find({ orgId: req.user.orgId, month: now.getMonth() + 1, year: now.getFullYear() }).lean();
    const totalPaid = thisMonthPayslips.filter(p => p.status === "paid").reduce((a, p) => a + p.netPay, 0);
    const pending = thisMonthPayslips.filter(p => p.status !== "paid").length;
    const departments = [...new Set(employees.map(e => e.department).filter(Boolean))];
    res.json({ success: true, totalEmployees: employees.length, activeEmployees: active, totalCtc, totalMonthlyCtc: Math.round(totalCtc / 12), totalPaid, pendingPayslips: pending, departments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
