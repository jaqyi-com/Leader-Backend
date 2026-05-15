import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, Plus, Loader2, IndianRupee, Calendar, CheckCircle,
  Clock, Play, UserPlus, Building2, CreditCard, FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getEmployees, createEmployee, getPayrollSummary,
  runPayroll, getPayslips, approvePayslip, payPayslip,
  getAttendance, markAttendance,
} from "../../api/payroll";

const TABS = ["employees", "payroll", "attendance"];
const TAB_LABELS = { employees: "Employees", payroll: "Payroll & Payslips", attendance: "Attendance" };
const fmt = (v) => `₹${(v || 0).toLocaleString("en-IN")}`;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function PayrollPage() {
  const [tab, setTab] = useState("employees");
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const load = async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([getEmployees(), getPayrollSummary()]);
      setEmployees(e.data.employees || []);
      setSummary(s.data);
    } catch { toast.error("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (tab === "payroll") {
      getPayslips({ month: selectedMonth, year: selectedYear }).then(r => setPayslips(r.data.payslips || [])).catch(() => {});
    }
  }, [tab, selectedMonth, selectedYear]);

  const handleAddEmployee = async (data) => {
    try { await createEmployee(data); toast.success("Employee added"); setShowAddEmp(false); load(); }
    catch { toast.error("Failed"); }
  };

  const handleRunPayroll = async () => {
    if (!window.confirm(`Generate payslips for ${MONTHS[selectedMonth-1]} ${selectedYear}?`)) return;
    try {
      const r = await runPayroll({ month: selectedMonth, year: selectedYear });
      toast.success(`${r.data.count} payslips generated!`);
      getPayslips({ month: selectedMonth, year: selectedYear }).then(r => setPayslips(r.data.payslips || []));
    } catch (e) { toast.error(e.response?.data?.error || "Failed"); }
  };

  const handleApprove = async (id) => {
    try { await approvePayslip(id); toast.success("Approved"); getPayslips({ month: selectedMonth, year: selectedYear }).then(r => setPayslips(r.data.payslips || [])); }
    catch { toast.error("Failed"); }
  };

  const handlePay = async (id) => {
    try { await payPayslip(id, {}); toast.success("Marked as paid"); getPayslips({ month: selectedMonth, year: selectedYear }).then(r => setPayslips(r.data.payslips || [])); }
    catch { toast.error("Failed"); }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Payroll & HR</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Employee management, salary processing & attendance</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "employees" && <button onClick={() => setShowAddEmp(true)} className="btn-primary" style={{ gap: 6, fontSize: 13 }}><UserPlus size={14} /> Add Employee</button>}
          {tab === "payroll" && payslips.length === 0 && <button onClick={handleRunPayroll} className="btn-primary" style={{ gap: 6, fontSize: 13 }}><Play size={14} /> Run Payroll</button>}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Active Employees", value: summary.activeEmployees, icon: Users, color: "#3b82f6" },
            { label: "Monthly CTC", value: fmt(summary.totalMonthlyCtc), icon: IndianRupee, color: "#22c55e" },
            { label: "Paid This Month", value: fmt(summary.totalPaid), icon: CreditCard, color: "#8b5cf6" },
            { label: "Pending Payslips", value: summary.pendingPayslips, icon: Clock, color: summary.pendingPayslips > 0 ? "#f59e0b" : "#22c55e" },
          ].map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>{c.label}</span>
                <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${c.color}15` }}>
                  <c.icon size={13} style={{ color: c.color }} />
                </div>
              </div>
              <p style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>{c.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "none", border: "none",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            color: tab === t ? "var(--accent)" : "var(--text-3)",
          }}>{TAB_LABELS[t]}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Loader2 size={24} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} /></div>
      ) : (
        <>
          {tab === "employees" && (
            <>
              {showAddEmp && <AddEmployeeForm onSubmit={handleAddEmployee} onCancel={() => setShowAddEmp(false)} />}
              <EmployeeList employees={employees} />
            </>
          )}
          {tab === "payroll" && (
            <>
              {/* Month selector */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--text)", outline: "none" }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--text)", outline: "none" }}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{payslips.length} payslips</span>
              </div>
              <PayslipList payslips={payslips} onApprove={handleApprove} onPay={handlePay} />
            </>
          )}
          {tab === "attendance" && <AttendanceView employees={employees} />}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmployeeList({ employees }) {
  const statusColors = { active: "#22c55e", resigned: "#f59e0b", terminated: "#ef4444", on_leave: "#3b82f6" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {employees.map((emp, i) => (
        <motion.div key={emp._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
          className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), #f4576a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            {emp.fullName?.charAt(0)?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{emp.fullName}</span>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{emp.employeeId}</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 0" }}>
              {emp.designation || "—"} {emp.department ? `· ${emp.department}` : ""}
            </p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", background: `${statusColors[emp.status] || "#94a3b8"}15`, color: statusColors[emp.status] || "#94a3b8" }}>{emp.status}</span>
          <div style={{ textAlign: "right", minWidth: 80 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: 0 }}>{fmt(emp.ctc)}</p>
            <p style={{ fontSize: 9, color: "var(--text-3)", margin: 0 }}>CTC/yr</p>
          </div>
        </motion.div>
      ))}
      {employees.length === 0 && <p style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>No employees yet. Add your first team member!</p>}
    </div>
  );
}

function PayslipList({ payslips, onApprove, onPay }) {
  const statusColors = { draft: "#94a3b8", approved: "#3b82f6", paid: "#22c55e" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {payslips.map(ps => (
        <div key={ps._id} className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileText size={16} style={{ color: "#8b5cf6" }} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{ps.employeeName}</span>
            <p style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 0" }}>{ps.employeeCode} · {ps.designation}</p>
          </div>
          <div style={{ textAlign: "center", fontSize: 11 }}>
            <p style={{ margin: 0, color: "#22c55e" }}>Earn: {fmt(ps.totalEarnings)}</p>
            <p style={{ margin: 0, color: "#ef4444" }}>Ded: {fmt(ps.totalDeductions)}</p>
          </div>
          <div style={{ textAlign: "right", minWidth: 90 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: 0 }}>{fmt(ps.netPay)}</p>
            <p style={{ fontSize: 9, color: "var(--text-3)", margin: 0 }}>Net Pay</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", background: `${statusColors[ps.status]}15`, color: statusColors[ps.status] }}>{ps.status}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {ps.status === "draft" && (
              <button onClick={() => onApprove(ps._id)} style={{ background: "rgba(59,130,246,0.1)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer" }} title="Approve">
                <CheckCircle size={12} style={{ color: "#3b82f6" }} />
              </button>
            )}
            {ps.status === "approved" && (
              <button onClick={() => onPay(ps._id)} style={{ background: "rgba(34,197,94,0.1)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer" }} title="Mark Paid">
                <CreditCard size={12} style={{ color: "#22c55e" }} />
              </button>
            )}
          </div>
        </div>
      ))}
      {payslips.length === 0 && <p style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>No payslips for this period. Click "Run Payroll" to generate.</p>}
    </div>
  );
}

function AttendanceView({ employees }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState({});
  const inp = { background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" };

  useEffect(() => {
    getAttendance({ from: date, to: date }).then(r => {
      const map = {};
      (r.data.records || []).forEach(rec => { map[rec.employeeId] = rec.status; });
      setRecords(map);
    }).catch(() => {});
  }, [date]);

  const handleMark = async (empId, status) => {
    try {
      await markAttendance({ employeeId: empId, date, status });
      setRecords(prev => ({ ...prev, [empId]: status }));
    } catch { toast.error("Failed"); }
  };

  const statuses = ["present", "absent", "half_day", "leave", "holiday"];
  const statusEmoji = { present: "✅", absent: "❌", half_day: "🌗", leave: "🏖️", holiday: "🎉" };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {employees.filter(e => e.status === "active").map(emp => (
          <div key={emp._id} className="card" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1 }}>{emp.fullName}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {statuses.map(s => (
                <button key={s} onClick={() => handleMark(emp._id, s)} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                  border: records[emp._id] === s ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: records[emp._id] === s ? "rgba(226,55,68,0.08)" : "var(--surface-3)",
                  color: records[emp._id] === s ? "var(--accent)" : "var(--text-3)",
                }}>{statusEmoji[s]} {s.replace(/_/g, " ")}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddEmployeeForm({ onSubmit, onCancel }) {
  const [f, setF] = useState({ fullName: "", email: "", phone: "", designation: "", department: "", ctc: 0, dateOfJoining: "", panNumber: "", aadharNumber: "" });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" };
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Add Employee</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <input placeholder="Full Name *" value={f.fullName} onChange={e => u("fullName", e.target.value)} autoFocus style={inp} />
        <input placeholder="Email" value={f.email} onChange={e => u("email", e.target.value)} style={inp} />
        <input placeholder="Phone" value={f.phone} onChange={e => u("phone", e.target.value)} style={inp} />
        <input placeholder="Designation" value={f.designation} onChange={e => u("designation", e.target.value)} style={inp} />
        <input placeholder="Department" value={f.department} onChange={e => u("department", e.target.value)} style={inp} />
        <input placeholder="CTC (Annual ₹)" type="number" value={f.ctc} onChange={e => u("ctc", Number(e.target.value))} style={inp} />
        <input placeholder="Date of Joining" type="date" value={f.dateOfJoining} onChange={e => u("dateOfJoining", e.target.value)} style={inp} />
        <input placeholder="PAN Number" value={f.panNumber} onChange={e => u("panNumber", e.target.value)} style={inp} />
        <input placeholder="Aadhar Number" value={f.aadharNumber} onChange={e => u("aadharNumber", e.target.value)} style={inp} />
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
        <button onClick={() => f.fullName && onSubmit(f)} className="btn-primary" style={{ fontSize: 12 }}>Add Employee</button>
      </div>
    </div>
  );
}
