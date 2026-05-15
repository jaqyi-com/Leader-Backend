import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, FileText, Loader2, CreditCard, IndianRupee, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { getInvoices, createInvoice, recordPayment, getReceivables } from "../../api/crm";

const STATUS_COLORS = {
  draft: { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
  sent: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
  partially_paid: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  paid: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
  overdue: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
  cancelled: { bg: "rgba(148,163,184,0.12)", color: "#64748b" },
};

export default function CrmInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [receivables, setReceivables] = useState(null);
  const [payingId, setPayingId] = useState(null);

  const load = async () => {
    try {
      const [inv, rec] = await Promise.all([getInvoices(), getReceivables()]);
      setInvoices(inv.data.invoices || []);
      setReceivables(rec.data);
    } catch { toast.error("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handlePayment = async (invoiceId, amount, method) => {
    try {
      await recordPayment({ invoiceId, amount: Number(amount), method });
      toast.success("Payment recorded!");
      setPayingId(null);
      load();
    } catch { toast.error("Failed"); }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Invoices & Payments</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Track invoices, record payments, and view receivables</p>
        </div>
      </div>

      {/* Receivables Summary */}
      {receivables && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
          <div className="card" style={{ padding: 16, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", margin: "0 0 6px" }}>Total Receivable</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: 0 }}>₹{(receivables.totalReceivable || 0).toLocaleString("en-IN")}</p>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", margin: "0 0 6px" }}>Overdue Amount</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#ef4444", margin: 0 }}>₹{(receivables.overdueAmount || 0).toLocaleString("en-IN")}</p>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", margin: "0 0 6px" }}>Overdue Invoices</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b", margin: 0 }}>{receivables.overdueCount || 0}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={24} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>
          <CreditCard size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
          <p>No invoices yet. Convert an accepted quotation to create one.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {invoices.map((inv, i) => {
            const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.draft;
            return (
              <motion.div key={inv._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="card" style={{ padding: 16 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(245,158,11,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <CreditCard size={18} style={{ color: "#f59e0b" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{inv.invoiceNumber}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: sc.bg, color: sc.color, textTransform: "uppercase" }}>{inv.status?.replace(/_/g, " ")}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-3)", margin: "2px 0 0" }}>
                      {inv.companyName || inv.contactName || "—"} · Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "—"}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", marginRight: 12 }}>
                    <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: 0 }}>₹{(inv.grandTotal || 0).toLocaleString("en-IN")}</p>
                    <p style={{ fontSize: 11, margin: 0 }}>
                      <span style={{ color: "#22c55e" }}>Paid: ₹{(inv.amountPaid || 0).toLocaleString("en-IN")}</span>
                      {(inv.amountDue > 0) && <span style={{ color: "#ef4444", marginLeft: 8 }}>Due: ₹{(inv.amountDue || 0).toLocaleString("en-IN")}</span>}
                    </p>
                  </div>
                  {inv.status !== "paid" && inv.status !== "cancelled" && (
                    <button onClick={() => setPayingId(payingId === inv._id ? null : inv._id)} style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 8,
                      border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)",
                      color: "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}>
                      <IndianRupee size={11} /> Record Payment
                    </button>
                  )}
                </div>

                {/* Payment form */}
                {payingId === inv._id && (
                  <PaymentForm invoiceId={inv._id} amountDue={inv.amountDue} onPay={handlePayment} onCancel={() => setPayingId(null)} />
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PaymentForm({ invoiceId, amountDue, onPay, onCancel }) {
  const [amount, setAmount] = useState(amountDue || 0);
  const [method, setMethod] = useState("bank_transfer");
  const methods = ["bank_transfer", "upi", "cash", "cheque", "card"];
  return (
    <div style={{ marginTop: 12, padding: 14, background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10 }}>
        <div>
          <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: 4 }}>Amount (₹)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: 4 }}>Method</label>
          <select value={method} onChange={e => setMethod(e.target.value)}
            style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none", boxSizing: "border-box" }}>
            {methods.map(m => <option key={m} value={m}>{m.replace(/_/g, " ").toUpperCase()}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          <button onClick={() => onPay(invoiceId, amount, method)} className="btn-primary" style={{ fontSize: 11, padding: "8px 16px" }}>
            <CheckCircle size={12} /> Pay
          </button>
          <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
