const mongoose = require("mongoose");

// ─── Employee ──────────────────────────────────────────────────
const employeeSchema = new mongoose.Schema({
  employeeId:    { type: String, required: true },    // EMP-001
  fullName:      { type: String, required: true },
  email:         String,
  phone:         String,
  // Personal
  dateOfBirth:   Date,
  gender:        { type: String, enum: ["male", "female", "other"], default: "male" },
  bloodGroup:    String,
  address:       String,
  city:          String,
  state:         String,
  pincode:       String,
  // Employment
  designation:   String,
  department:    String,
  dateOfJoining: Date,
  dateOfExit:    Date,
  status:        { type: String, enum: ["active", "resigned", "terminated", "on_leave"], default: "active" },
  // Bank
  bankName:      String,
  accountNumber: String,
  ifscCode:      String,
  // Statutory
  panNumber:     String,
  aadharNumber:  String,
  uanNumber:     String,     // PF UAN
  esiNumber:     String,
  pfNumber:      String,
  // Salary structure reference
  salaryStructureId: { type: mongoose.Schema.Types.ObjectId, ref: "SalaryStructure" },
  ctc:           { type: Number, default: 0 },       // Cost to Company (annual)
  orgId:         { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

employeeSchema.index({ orgId: 1, employeeId: 1 }, { unique: true });

employeeSchema.statics.nextId = async function (orgId) {
  const last = await this.findOne({ orgId }).sort({ createdAt: -1 }).select("employeeId").lean();
  if (!last) return "EMP-001";
  const num = parseInt(last.employeeId.replace(/\D/g, ""), 10) || 0;
  return `EMP-${String(num + 1).padStart(3, "0")}`;
};

// ─── Salary Structure ──────────────────────────────────────────
const salaryComponentSchema = new mongoose.Schema({
  name:       { type: String, required: true },       // Basic, HRA, DA, Conveyance, etc.
  type:       { type: String, enum: ["earning", "deduction"], required: true },
  calcType:   { type: String, enum: ["fixed", "percent_of_basic", "percent_of_ctc"], default: "fixed" },
  value:      { type: Number, default: 0 },           // fixed amount or percentage
  isTaxable:  { type: Boolean, default: true },
}, { _id: true });

const salaryStructureSchema = new mongoose.Schema({
  name:        { type: String, required: true },       // "Standard", "Senior", etc.
  components:  { type: [salaryComponentSchema], default: [] },
  // Employer contributions (not part of CTC usually)
  employerPfPercent:  { type: Number, default: 12 },  // 12% of basic
  employerEsiPercent: { type: Number, default: 3.25 }, // 3.25% of gross
  isDefault:   { type: Boolean, default: false },
  orgId:       { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

const DEFAULT_COMPONENTS = [
  { name: "Basic",          type: "earning",    calcType: "percent_of_ctc", value: 40, isTaxable: true },
  { name: "HRA",            type: "earning",    calcType: "percent_of_basic", value: 50, isTaxable: true },
  { name: "DA",             type: "earning",    calcType: "percent_of_basic", value: 10, isTaxable: true },
  { name: "Conveyance",     type: "earning",    calcType: "fixed", value: 1600, isTaxable: false },
  { name: "Medical",        type: "earning",    calcType: "fixed", value: 1250, isTaxable: false },
  { name: "Special Allow.",  type: "earning",    calcType: "fixed", value: 0, isTaxable: true },
  { name: "PF (Employee)",  type: "deduction",  calcType: "percent_of_basic", value: 12, isTaxable: false },
  { name: "ESI (Employee)", type: "deduction",  calcType: "percent_of_basic", value: 0.75, isTaxable: false },
  { name: "Prof. Tax",      type: "deduction",  calcType: "fixed", value: 200, isTaxable: false },
];

salaryStructureSchema.statics.getOrCreateDefault = async function (orgId) {
  let s = await this.findOne({ orgId, isDefault: true });
  if (!s) {
    s = await this.create({ name: "Standard Structure", components: DEFAULT_COMPONENTS, isDefault: true, orgId });
  }
  return s;
};

// ─── Payroll Run (monthly payslip batch) ───────────────────────
const payslipSchema = new mongoose.Schema({
  employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  employeeName: String,
  employeeCode: String,
  designation:  String,
  department:   String,
  // Period
  month:        { type: Number, required: true },     // 1-12
  year:         { type: Number, required: true },
  // Attendance
  workingDays:  { type: Number, default: 30 },
  presentDays:  { type: Number, default: 30 },
  leaveDays:    { type: Number, default: 0 },
  lopDays:      { type: Number, default: 0 },         // Loss of Pay
  // Earnings
  earnings:     [{
    name:   String,
    amount: Number,
  }],
  totalEarnings: { type: Number, default: 0 },
  // Deductions
  deductions:   [{
    name:   String,
    amount: Number,
  }],
  totalDeductions: { type: Number, default: 0 },
  // Net
  netPay:       { type: Number, default: 0 },
  // Employer contributions
  employerPf:   { type: Number, default: 0 },
  employerEsi:  { type: Number, default: 0 },
  // Status
  status:       { type: String, enum: ["draft", "approved", "paid"], default: "draft" },
  paidAt:       Date,
  paymentMode:  { type: String, enum: ["bank_transfer", "cheque", "cash", "upi"], default: "bank_transfer" },
  orgId:        { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

payslipSchema.index({ orgId: 1, month: 1, year: 1 });
payslipSchema.index({ orgId: 1, employeeId: 1 });

// ─── Attendance ────────────────────────────────────────────────
const attendanceSchema = new mongoose.Schema({
  employeeId:  { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  date:        { type: Date, required: true },
  status:      { type: String, enum: ["present", "absent", "half_day", "leave", "holiday", "week_off"], default: "present" },
  checkIn:     String,
  checkOut:    String,
  hoursWorked: Number,
  leaveType:   { type: String, enum: ["casual", "sick", "earned", "unpaid", ""], default: "" },
  notes:       String,
  orgId:       { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

attendanceSchema.index({ orgId: 1, employeeId: 1, date: 1 }, { unique: true });

const Employee = mongoose.models.Employee || mongoose.model("Employee", employeeSchema);
const SalaryStructure = mongoose.models.SalaryStructure || mongoose.model("SalaryStructure", salaryStructureSchema);
const Payslip = mongoose.models.Payslip || mongoose.model("Payslip", payslipSchema);
const Attendance = mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);

module.exports = { Employee, SalaryStructure, Payslip, Attendance };
