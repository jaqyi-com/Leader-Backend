import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, FileText, Loader2, Send, CheckCircle, XCircle, ArrowRight, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { getQuotations, createQuotation, updateQuotationStatus } from "../../api/crm";
import { createInvoiceFromQuotation } from "../../api/crm";

const STATUS_COLORS = {
  draft: { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
  sent: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
  accepted: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
  rejected: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
  expired: { bg: "rgba(148,163,184,0.12)", color: "#64748b" },
  converted: { bg: "rgba(139,92,246,0.12)", color: "#8b5cf6" },
};

export default function CrmQuotationsPage() {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    try {
      const { data } = await getQuotations();
      setQuotations(data.quotations || []);
    } catch { toast.error("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleStatusChange = async (id, status) => {
    try {
      await updateQuotationStatus(id, status);
      toast.success(`Status updated to ${status}`);
      load();
    } catch { toast.error("Failed"); }
  };

  const handleConvertToInvoice = async (qtId) => {
    try {
      await createInvoiceFromQuotation(qtId);
      toast.success("Invoice created from quotation!");
      load();
    } catch { toast.error("Failed to convert"); }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Quotations</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Create and manage quotations with GST</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary" style={{ gap: 6, fontSize: 13 }}>
          <Plus size={14} /> New Quotation
        </button>
      </div>

      {showCreate && <CreateQuotationForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={24} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : quotations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>
          <FileText size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
          <p>No quotations yet</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {quotations.map((qt, i) => {
            const sc = STATUS_COLORS[qt.status] || STATUS_COLORS.draft;
            return (
              <motion.div key={qt._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 14 }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(226,55,68,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <FileText size={18} style={{ color: "var(--accent)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{qt.quotationNumber}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: sc.bg, color: sc.color, textTransform: "uppercase" }}>{qt.status}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: "2px 0 0" }}>
                    {qt.companyName || qt.contactName || "—"} · {new Date(qt.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <div style={{ textAlign: "right", marginRight: 12 }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: 0 }}>₹{(qt.grandTotal || 0).toLocaleString("en-IN")}</p>
                  <p style={{ fontSize: 10, color: "var(--text-3)", margin: 0 }}>GST: ₹{(qt.taxTotal || 0).toLocaleString("en-IN")}</p>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {qt.status === "draft" && (
                    <button onClick={() => handleStatusChange(qt._id, "sent")} title="Mark as Sent" style={{ background: "rgba(59,130,246,0.1)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer" }}>
                      <Send size={12} style={{ color: "#3b82f6" }} />
                    </button>
                  )}
                  {qt.status === "sent" && (
                    <>
                      <button onClick={() => handleStatusChange(qt._id, "accepted")} title="Accept" style={{ background: "rgba(34,197,94,0.1)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer" }}>
                        <CheckCircle size={12} style={{ color: "#22c55e" }} />
                      </button>
                      <button onClick={() => handleStatusChange(qt._id, "rejected")} title="Reject" style={{ background: "rgba(239,68,68,0.1)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer" }}>
                        <XCircle size={12} style={{ color: "#ef4444" }} />
                      </button>
                    </>
                  )}
                  {qt.status === "accepted" && (
                    <button onClick={() => handleConvertToInvoice(qt._id)} title="Convert to Invoice" style={{ background: "rgba(139,92,246,0.1)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer" }}>
                      <ArrowRight size={12} style={{ color: "#8b5cf6" }} />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function CreateQuotationForm({ onClose, onCreated }) {
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [items, setItems] = useState([{ name: "", quantity: 1, rate: 0, taxPercent: 18 }]);
  const [saving, setSaving] = useState(false);

  const addItem = () => setItems([...items, { name: "", quantity: 1, rate: 0, taxPercent: 18 }]);
  const updateItem = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    setItems(next);
  };
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((a, it) => a + (it.quantity * it.rate), 0);
  const taxTotal = items.reduce((a, it) => a + (it.quantity * it.rate * (it.taxPercent / 100)), 0);
  const grandTotal = subtotal + taxTotal;

  const save = async () => {
    if (!items[0]?.name) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      await createQuotation({ contactName, companyName, contactEmail, items });
      toast.success("Quotation created!");
      onCreated();
    } catch { toast.error("Failed"); }
    setSaving(false);
  };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>New Quotation</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <input placeholder="Contact Name" value={contactName} onChange={e => setContactName(e.target.value)}
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
        <input placeholder="Company Name" value={companyName} onChange={e => setCompanyName(e.target.value)}
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
        <input placeholder="Email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
      </div>

      <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 8 }}>Line Items</h4>
      {items.map((item, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 1fr 0.7fr auto", gap: 8, marginBottom: 8 }}>
          <input placeholder="Item name" value={item.name} onChange={e => updateItem(i, "name", e.target.value)}
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
          <input placeholder="Qty" type="number" value={item.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))}
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
          <input placeholder="Rate (₹)" type="number" value={item.rate} onChange={e => updateItem(i, "rate", Number(e.target.value))}
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
          <input placeholder="GST %" type="number" value={item.taxPercent} onChange={e => updateItem(i, "taxPercent", Number(e.target.value))}
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
          <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 4 }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={addItem} style={{ background: "none", border: "1px dashed var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 11, color: "var(--text-3)", cursor: "pointer", marginBottom: 14 }}>+ Add Item</button>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <div style={{ width: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>
            <span>Subtotal</span><span>₹{subtotal.toLocaleString("en-IN")}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>
            <span>GST</span><span>₹{taxTotal.toLocaleString("en-IN")}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, color: "var(--text)", borderTop: "1px solid var(--border)", paddingTop: 6 }}>
            <span>Grand Total</span><span>₹{grandTotal.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 20px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 12, padding: "8px 24px" }}>{saving ? "Saving..." : "Create Quotation"}</button>
      </div>
    </div>
  );
}
