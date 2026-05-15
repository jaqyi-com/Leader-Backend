import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Building2, User, Mail, Phone, IndianRupee, Calendar,
  Trophy, XCircle, StickyNote, PhoneCall, Video, MessageSquare,
  CheckCircle, Clock, Loader2, Edit3, Trash2, ChevronDown,
  FileText, CreditCard, ArrowRightLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import { getDeal, updateDeal, markDealWon, markDealLost, createActivity } from "../../api/crm";

const ACTIVITY_ICONS = {
  note: StickyNote, call: PhoneCall, email: Mail, meeting: Video,
  whatsapp: MessageSquare, task: CheckCircle, follow_up: Clock,
  stage_change: ArrowRightLeft, deal_created: FileText,
  deal_won: Trophy, deal_lost: XCircle,
  quotation_sent: FileText, quotation_accepted: CheckCircle,
  quotation_rejected: XCircle, invoice_created: CreditCard,
  payment_received: IndianRupee,
};

const ACTIVITY_COLORS = {
  note: "#94a3b8", call: "#3b82f6", email: "#E23744", meeting: "#8b5cf6",
  whatsapp: "#25d366", task: "#f59e0b", follow_up: "#f97316",
  stage_change: "#22d3ee", deal_created: "#10b981", deal_won: "#22c55e",
  deal_lost: "#ef4444", quotation_sent: "#a78bfa", quotation_accepted: "#22c55e",
  quotation_rejected: "#ef4444", invoice_created: "#f59e0b", payment_received: "#10b981",
};

export default function DealDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [deal, setDeal] = useState(null);
  const [activities, setActivities] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actForm, setActForm] = useState(null); // null | { type }
  const [editField, setEditField] = useState(null);

  const load = async () => {
    try {
      const { data } = await getDeal(id);
      setDeal(data.deal);
      setActivities(data.activities || []);
      setQuotations(data.quotations || []);
      setInvoices(data.invoices || []);
    } catch { toast.error("Failed to load deal"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleWon = async () => {
    try { await markDealWon(id); toast.success("🎉 Deal Won!"); load(); }
    catch { toast.error("Failed"); }
  };

  const handleLost = async () => {
    const reason = prompt("Reason for losing this deal?");
    if (reason === null) return;
    try { await markDealLost(id, reason); toast.success("Deal marked as lost"); load(); }
    catch { toast.error("Failed"); }
  };

  const handleAddActivity = async (type, title, description, dueDate) => {
    try {
      await createActivity({ type, title, description, dealId: id, dueDate: dueDate || undefined });
      toast.success("Activity added");
      setActForm(null);
      load();
    } catch { toast.error("Failed"); }
  };

  const handleFieldSave = async (field, value) => {
    try {
      await updateDeal(id, { [field]: value });
      setDeal(prev => ({ ...prev, [field]: value }));
      setEditField(null);
    } catch { toast.error("Failed to update"); }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!deal) return <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>Deal not found</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 40 }}>
      {/* Back button */}
      <button onClick={() => nav("/app/crm/pipeline")} style={{
        display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
        color: "var(--text-3)", fontSize: 13, cursor: "pointer", marginBottom: 16, padding: 0,
      }}>
        <ArrowLeft size={14} /> Back to Pipeline
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20 }}>
        {/* LEFT — Deal Info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Title & Actions */}
          <div className="card" style={{ padding: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>{deal.title}</h1>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <InfoRow icon={IndianRupee} label="Value" value={`₹${(deal.value || 0).toLocaleString("en-IN")}`}
                editable field="value" editField={editField} setEditField={setEditField}
                onSave={v => handleFieldSave("value", Number(v))} />
              <InfoRow icon={Building2} label="Company" value={deal.companyName || "—"} />
              <InfoRow icon={User} label="Contact" value={deal.contactName || "—"} />
              <InfoRow icon={Mail} label="Email" value={deal.contactEmail || "—"} />
              <InfoRow icon={Phone} label="Phone" value={deal.contactPhone || "—"} />
              <InfoRow icon={Calendar} label="Expected Close"
                value={deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString("en-IN") : "—"} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ color: "var(--text-3)", width: 90 }}>Stage</span>
                <span style={{
                  padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  background: "rgba(226,55,68,0.1)", color: "var(--accent)", textTransform: "capitalize",
                }}>{deal.stage?.replace(/_/g, " ")}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ color: "var(--text-3)", width: 90 }}>Probability</span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{deal.probability || 0}%</span>
              </div>
            </div>

            {/* Won / Lost buttons */}
            {deal.stage !== "won" && deal.stage !== "lost" && (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={handleWon} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px 0", borderRadius: 10, border: "1px solid rgba(34,197,94,0.3)",
                  background: "rgba(34,197,94,0.08)", color: "#22c55e", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                  <Trophy size={14} /> Mark Won
                </button>
                <button onClick={handleLost} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px 0", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                  <XCircle size={14} /> Mark Lost
                </button>
              </div>
            )}
          </div>

          {/* Quotations */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Quotations</h3>
            {quotations.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>No quotations yet</p>
            ) : quotations.map(q => (
              <div key={q._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{q.quotationNumber}</span>
                <span style={{ color: "var(--text)" }}>₹{(q.grandTotal || 0).toLocaleString("en-IN")}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 6,
                  background: q.status === "accepted" ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.12)",
                  color: q.status === "accepted" ? "#22c55e" : "var(--text-3)",
                }}>{q.status}</span>
              </div>
            ))}
          </div>

          {/* Invoices */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Invoices</h3>
            {invoices.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>No invoices yet</p>
            ) : invoices.map(inv => (
              <div key={inv._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{inv.invoiceNumber}</span>
                <span style={{ color: "var(--text)" }}>₹{(inv.grandTotal || 0).toLocaleString("en-IN")}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 6,
                  background: inv.status === "paid" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                  color: inv.status === "paid" ? "#22c55e" : "#f59e0b",
                }}>{inv.status?.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Activity Timeline */}
        <div className="card" style={{ padding: 20, alignSelf: "start" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>Activity Timeline</h3>
          </div>

          {/* Quick action buttons */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { type: "note", label: "Note", icon: StickyNote },
              { type: "call", label: "Log Call", icon: PhoneCall },
              { type: "meeting", label: "Meeting", icon: Video },
              { type: "follow_up", label: "Follow-up", icon: Clock },
              { type: "task", label: "Task", icon: CheckCircle },
            ].map(a => (
              <button key={a.type} onClick={() => setActForm({ type: a.type })} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
                borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)",
                fontSize: 11, color: "var(--text-2)", cursor: "pointer", fontWeight: 500,
              }}>
                <a.icon size={11} /> {a.label}
              </button>
            ))}
          </div>

          {/* Activity form */}
          {actForm && (
            <ActivityForm type={actForm.type} onSubmit={handleAddActivity} onCancel={() => setActForm(null)} />
          )}

          {/* Timeline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {activities.map((act, i) => {
              const Icon = ACTIVITY_ICONS[act.type] || StickyNote;
              const color = ACTIVITY_COLORS[act.type] || "#94a3b8";
              return (
                <div key={act._id} style={{ display: "flex", gap: 12, position: "relative" }}>
                  {/* Timeline line */}
                  {i < activities.length - 1 && (
                    <div style={{ position: "absolute", left: 13, top: 28, bottom: -4, width: 1, background: "var(--border)" }} />
                  )}
                  {/* Icon */}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: `${color}18`, border: `1px solid ${color}40`,
                  }}>
                    <Icon size={12} style={{ color }} />
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, paddingBottom: 16 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: "2px 0 2px" }}>{act.title}</p>
                    {act.description && (
                      <p style={{ fontSize: 12, color: "var(--text-3)", margin: "2px 0 4px", lineHeight: 1.5 }}>{act.description}</p>
                    )}
                    <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                      {new Date(act.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}
            {activities.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-3)", textAlign: "center", padding: 20 }}>No activity yet. Add a note or log a call to get started.</p>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, editable, field, editField, setEditField, onSave }) {
  const [val, setVal] = useState(value);
  const editing = editField === field;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <Icon size={12} style={{ color: "var(--text-3)" }} />
      <span style={{ color: "var(--text-3)", width: 80 }}>{label}</span>
      {editing ? (
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onBlur={() => onSave(val)} onKeyDown={e => e.key === "Enter" && onSave(val)}
          style={{ background: "var(--surface-3)", border: "1px solid var(--accent)", borderRadius: 6, padding: "3px 8px", fontSize: 12, color: "var(--text)", outline: "none", flex: 1 }}
        />
      ) : (
        <span style={{ color: "var(--text)", fontWeight: 500, flex: 1 }}>
          {value}
          {editable && (
            <Edit3 size={10} style={{ marginLeft: 6, color: "var(--text-3)", cursor: "pointer" }}
              onClick={() => { setVal(value); setEditField(field); }} />
          )}
        </span>
      )}
    </div>
  );
}

function ActivityForm({ type, onSubmit, onCancel }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const hasDate = ["follow_up", "task", "meeting"].includes(type);
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid var(--accent)", display: "flex", flexDirection: "column", gap: 8 }}>
      <input placeholder={`${type.replace(/_/g, " ")} title *`} value={title} onChange={e => setTitle(e.target.value)} autoFocus
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
      />
      <textarea placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} rows={2}
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none", resize: "vertical" }}
      />
      {hasDate && (
        <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
        />
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => title && onSubmit(type, title, desc, dueDate)} className="btn-primary" style={{ flex: 1, fontSize: 12, padding: "7px 0" }}>Save</button>
        <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
