import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, GripVertical, Building2, User, IndianRupee, Calendar,
  Flame, Thermometer, Snowflake, X, Loader2, MoreHorizontal,
  Trophy, XCircle, ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { getDealsBoard, createDeal, moveDealStage, deleteDeal } from "../../api/crm";

const PRIORITY_CFG = {
  hot:  { icon: Flame, color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "Hot" },
  warm: { icon: Thermometer, color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "Warm" },
  cold: { icon: Snowflake, color: "#3b82f6", bg: "rgba(59,130,246,0.12)", label: "Cold" },
};

const fmt = (v) => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : v >= 1000 ? `₹${(v/1000).toFixed(0)}K` : `₹${v}`;

export default function CrmPipelinePage() {
  const [board, setBoard] = useState({});
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(null);
  const [dragging, setDragging] = useState(null);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getDealsBoard();
      setPipeline(data.pipeline);
      setBoard(data.board || {});
    } catch (e) { toast.error("Failed to load pipeline"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDrop = async (stageId) => {
    if (!dragging || dragging.stage === stageId) { setDragging(null); return; }
    const deal = dragging;
    // Optimistic update
    setBoard(prev => {
      const next = { ...prev };
      next[deal.stage] = (next[deal.stage] || []).filter(d => d._id !== deal._id);
      next[stageId] = [{ ...deal, stage: stageId }, ...(next[stageId] || [])];
      return next;
    });
    setDragging(null);
    try {
      await moveDealStage(deal._id, stageId);
    } catch { toast.error("Failed to move deal"); load(); }
  };

  const handleDelete = async (id, stageId) => {
    if (!window.confirm("Delete this deal?")) return;
    setBoard(prev => ({ ...prev, [stageId]: (prev[stageId] || []).filter(d => d._id !== id) }));
    try { await deleteDeal(id); } catch { load(); }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  const stages = pipeline?.stages || [];

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Sales Pipeline</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Drag deals between stages to update progress</p>
        </div>
        <button onClick={() => setShowAdd("new_lead")} className="btn-primary" style={{ gap: 6, fontSize: 13 }}>
          <Plus size={14} /> New Deal
        </button>
      </div>

      {/* Kanban Board */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 20, minHeight: "65vh" }}>
        {stages.map(stage => {
          const deals = board[stage.stageId] || [];
          const totalValue = deals.reduce((a, d) => a + (d.value || 0), 0);
          return (
            <div
              key={stage.stageId}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(stage.stageId)}
              style={{
                minWidth: 280, maxWidth: 300, flex: "0 0 280px",
                display: "flex", flexDirection: "column",
                background: "var(--surface)", borderRadius: 14,
                border: "1px solid var(--border)",
              }}
            >
              {/* Column Header */}
              <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1 }}>{stage.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                    background: "var(--surface-3)", color: "var(--text-3)",
                  }}>{deals.length}</span>
                </div>
                {totalValue > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>
                    {fmt(totalValue)} total
                  </span>
                )}
              </div>

              {/* Cards */}
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: "calc(100vh - 260px)" }}>
                {deals.map(deal => (
                  <DealCard
                    key={deal._id} deal={deal}
                    onDragStart={() => setDragging(deal)}
                    onClick={() => nav(`/app/crm/deals/${deal._id}`)}
                    onDelete={() => handleDelete(deal._id, stage.stageId)}
                  />
                ))}

                {/* Quick add */}
                {showAdd === stage.stageId ? (
                  <QuickAddForm
                    stageId={stage.stageId}
                    onClose={() => setShowAdd(null)}
                    onCreated={() => { setShowAdd(null); load(); }}
                  />
                ) : (
                  <button
                    onClick={() => setShowAdd(stage.stageId)}
                    style={{
                      background: "none", border: "1px dashed var(--border)", borderRadius: 10,
                      padding: "10px 0", color: "var(--text-3)", fontSize: 12, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    }}
                  >
                    <Plus size={12} /> Add deal
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function DealCard({ deal, onDragStart, onClick, onDelete }) {
  const p = PRIORITY_CFG[deal.priority] || PRIORITY_CFG.warm;
  const PIcon = p.icon;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--surface-2)", borderRadius: 12, padding: 14, cursor: "grab",
        border: "1px solid var(--border)", position: "relative",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      whileHover={{ boxShadow: "0 4px 20px rgba(0,0,0,0.15)", borderColor: "var(--accent)" }}
    >
      {/* Title & menu */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{deal.title}</span>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--text-3)" }}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Company & contact */}
      {deal.companyName && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4, fontSize: 11, color: "var(--text-3)" }}>
          <Building2 size={10} /> {deal.companyName}
        </div>
      )}
      {deal.contactName && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8, fontSize: 11, color: "var(--text-3)" }}>
          <User size={10} /> {deal.contactName}
        </div>
      )}

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
          <IndianRupee size={12} />{(deal.value || 0).toLocaleString("en-IN")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {deal.expectedCloseDate && (
            <span style={{ fontSize: 10, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 2 }}>
              <Calendar size={9} />{new Date(deal.expectedCloseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
          )}
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "2px 6px",
            borderRadius: 6, background: p.bg, color: p.color, display: "flex", alignItems: "center", gap: 2,
          }}>
            <PIcon size={8} />{p.label}
          </span>
        </div>
      </div>

      {/* Context menu */}
      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: 36, right: 8, zIndex: 50,
            background: "var(--surface-3)", border: "1px solid var(--border)",
            borderRadius: 10, padding: 4, minWidth: 120, boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <button onClick={() => { setMenuOpen(false); onDelete(); }} style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%",
            background: "none", border: "none", padding: "8px 10px", borderRadius: 8,
            fontSize: 12, color: "#ef4444", cursor: "pointer",
          }}>
            <X size={12} /> Delete Deal
          </button>
        </div>
      )}
    </motion.div>
  );
}

function QuickAddForm({ stageId, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createDeal({ title, value: Number(value) || 0, companyName: company, stage: stageId });
      toast.success("Deal created");
      onCreated();
    } catch { toast.error("Failed"); }
    setSaving(false);
  };

  return (
    <div style={{
      background: "var(--surface-2)", borderRadius: 12, padding: 12,
      border: "1px solid var(--accent)", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <input ref={ref} placeholder="Deal title *" value={title} onChange={e => setTitle(e.target.value)}
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
        onKeyDown={e => e.key === "Enter" && save()}
      />
      <input placeholder="Company" value={company} onChange={e => setCompany(e.target.value)}
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
      />
      <input placeholder="Value (₹)" type="number" value={value} onChange={e => setValue(e.target.value)}
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ flex: 1, fontSize: 12, padding: "7px 0" }}>
          {saving ? "Saving..." : "Add"}
        </button>
        <button onClick={onClose} style={{
          background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "7px 12px", fontSize: 12, color: "var(--text-3)", cursor: "pointer",
        }}>Cancel</button>
      </div>
    </div>
  );
}
