import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle, Clock, AlertTriangle, StickyNote, PhoneCall, Video,
  Mail, MessageSquare, Plus, Loader2, Calendar, Filter,
} from "lucide-react";
import toast from "react-hot-toast";
import { getActivities, createActivity, completeActivity } from "../../api/crm";

const TYPE_CFG = {
  note: { icon: StickyNote, color: "#94a3b8", label: "Note" },
  call: { icon: PhoneCall, color: "#3b82f6", label: "Call" },
  email: { icon: Mail, color: "#E23744", label: "Email" },
  meeting: { icon: Video, color: "#8b5cf6", label: "Meeting" },
  whatsapp: { icon: MessageSquare, color: "#25d366", label: "WhatsApp" },
  task: { icon: CheckCircle, color: "#f59e0b", label: "Task" },
  follow_up: { icon: Clock, color: "#f97316", label: "Follow-up" },
};

export default function CrmActivitiesPage() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    try {
      const params = {};
      if (filter !== "all") params.type = filter;
      const { data } = await getActivities(params);
      setActivities(data.activities || []);
    } catch { toast.error("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleComplete = async (id) => {
    try {
      await completeActivity(id);
      setActivities(prev => prev.map(a => a._id === id ? { ...a, completed: true, completedAt: new Date() } : a));
      toast.success("Completed!");
    } catch { toast.error("Failed"); }
  };

  const handleAdd = async (type, title, description, dueDate) => {
    try {
      await createActivity({ type, title, description, dueDate: dueDate || undefined });
      toast.success("Activity created");
      setShowAdd(false);
      load();
    } catch { toast.error("Failed"); }
  };

  const now = new Date();
  const overdue = activities.filter(a => !a.completed && a.dueDate && new Date(a.dueDate) < now);
  const pending = activities.filter(a => !a.completed && (!a.dueDate || new Date(a.dueDate) >= now));
  const completed = activities.filter(a => a.completed);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Activities & Tasks</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Track follow-ups, calls, meetings, and tasks</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary" style={{ gap: 6, fontSize: 13 }}>
          <Plus size={14} /> New Activity
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {["all", "task", "follow_up", "call", "meeting", "note", "email"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: "1px solid var(--border)", textTransform: "capitalize",
            background: filter === f ? "var(--accent)" : "var(--surface-2)",
            color: filter === f ? "#fff" : "var(--text-2)",
          }}>
            {f === "all" ? "All" : (TYPE_CFG[f]?.label || f)}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <AddActivityForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={24} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : (
        <>
          {/* Overdue */}
          {overdue.length > 0 && (
            <Section title={`Overdue (${overdue.length})`} color="#ef4444" icon={AlertTriangle}>
              {overdue.map(a => <ActivityRow key={a._id} act={a} onComplete={handleComplete} overdue />)}
            </Section>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <Section title={`Pending (${pending.length})`} color="#f59e0b" icon={Clock}>
              {pending.map(a => <ActivityRow key={a._id} act={a} onComplete={handleComplete} />)}
            </Section>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <Section title={`Completed (${completed.length})`} color="#22c55e" icon={CheckCircle}>
              {completed.slice(0, 20).map(a => <ActivityRow key={a._id} act={a} done />)}
            </Section>
          )}

          {activities.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>
              <Calendar size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
              <p>No activities yet. Create your first task or follow-up!</p>
            </div>
          )}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Section({ title, color, icon: Icon, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color, marginBottom: 10 }}>
        <Icon size={14} /> {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function ActivityRow({ act, onComplete, overdue, done }) {
  const cfg = TYPE_CFG[act.type] || TYPE_CFG.note;
  const Icon = cfg.icon;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12,
        background: overdue ? "rgba(239,68,68,0.05)" : "var(--surface)", border: "1px solid var(--border)",
        opacity: done ? 0.5 : 1,
      }}
    >
      {!done && onComplete ? (
        <button onClick={() => onComplete(act._id)} style={{
          width: 22, height: 22, borderRadius: "50%", border: `2px solid ${overdue ? "#ef4444" : "var(--border)"}`,
          background: "none", cursor: "pointer", flexShrink: 0,
        }} />
      ) : (
        <CheckCircle size={16} style={{ color: "#22c55e", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0, textDecoration: done ? "line-through" : "none" }}>{act.title}</p>
        {act.description && <p style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 0" }}>{act.description}</p>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {act.dueDate && (
          <span style={{ fontSize: 10, color: overdue ? "#ef4444" : "var(--text-3)" }}>
            {new Date(act.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        )}
        <span style={{
          display: "flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700,
          padding: "2px 8px", borderRadius: 6, background: `${cfg.color}15`, color: cfg.color,
          textTransform: "uppercase",
        }}>
          <Icon size={9} />{cfg.label}
        </span>
      </div>
    </motion.div>
  );
}

function AddActivityForm({ onSubmit, onCancel }) {
  const [type, setType] = useState("task");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(TYPE_CFG).map(([k, v]) => (
          <button key={k} onClick={() => setType(k)} style={{
            padding: "5px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
            border: type === k ? `1px solid ${v.color}` : "1px solid var(--border)",
            background: type === k ? `${v.color}15` : "var(--surface-3)",
            color: type === k ? v.color : "var(--text-3)", fontWeight: 600,
          }}>{v.label}</button>
        ))}
      </div>
      <input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} autoFocus
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
      />
      <textarea placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} rows={2}
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none", resize: "vertical" }}
      />
      <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => title && onSubmit(type, title, desc, dueDate)} className="btn-primary" style={{ flex: 1, fontSize: 12 }}>Create</button>
        <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
