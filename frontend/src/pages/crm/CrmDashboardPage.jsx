import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, IndianRupee, Trophy, XCircle, Clock, AlertTriangle,
  Target, BarChart3, Loader2, FileText, CreditCard, PieChart,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RPie, Pie, Cell, CartesianGrid } from "recharts";
import toast from "react-hot-toast";
import { getDealStats, getUpcomingActivities } from "../../api/crm";

const fmt = (v) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
};

export default function CrmDashboardPage() {
  const [stats, setStats] = useState(null);
  const [upcoming, setUpcoming] = useState({ overdue: [], today: [], upcoming: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, u] = await Promise.all([getDealStats(), getUpcomingActivities()]);
        setStats(s.data.stats);
        setUpcoming(u.data);
      } catch { toast.error("Failed to load dashboard"); }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: "Total Deals", value: stats.totalDeals, icon: Target, color: "#3b82f6" },
    { label: "Pipeline Value", value: fmt(stats.totalPipelineValue), icon: IndianRupee, color: "#E23744" },
    { label: "Won This Month", value: stats.wonThisMonth, sub: fmt(stats.wonThisMonthValue), icon: Trophy, color: "#22c55e" },
    { label: "Lost This Month", value: stats.lostThisMonth, icon: XCircle, color: "#ef4444" },
    { label: "Win Rate", value: `${stats.winRate}%`, icon: TrendingUp, color: "#8b5cf6" },
    { label: "Avg Deal Size", value: fmt(stats.avgDealSize), icon: BarChart3, color: "#f59e0b" },
    { label: "Receivable", value: fmt(stats.totalReceivable), sub: `${stats.outstandingInvoices} invoices`, icon: CreditCard, color: "#f97316" },
    { label: "Today's Tasks", value: stats.todayTasks, sub: `${stats.overdueTasks} overdue`, icon: Clock, color: stats.overdueTasks > 0 ? "#ef4444" : "#22c55e" },
  ];

  const stageData = (stats.stageStats || []).filter(s => s.stageId !== "won" && s.stageId !== "lost");
  const pieData = [
    { name: "Won", value: stats.wonThisMonth || 0, color: "#22c55e" },
    { name: "Lost", value: stats.lostThisMonth || 0, color: "#ef4444" },
  ].filter(d => d.value > 0);

  return (
    <div style={{ paddingBottom: 40, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>CRM Dashboard</h1>
      <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 24 }}>Overview of your sales pipeline and performance</p>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {statCards.map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="card" style={{ padding: 18 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${c.color}15` }}>
                <c.icon size={14} style={{ color: c.color }} />
              </div>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0, lineHeight: 1 }}>{c.value}</p>
            {c.sub && <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 0" }}>{c.sub}</p>}
          </motion.div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Pipeline Bar Chart */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Revenue by Stage</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stageData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fill: "var(--text-3)", fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fill: "var(--text-2)", fontSize: 11 }} />
              <Tooltip formatter={v => [`₹${v.toLocaleString("en-IN")}`, "Value"]} contentStyle={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {stageData.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Win/Loss Pie */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Win vs Loss (This Month)</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RPie>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
              </RPie>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-3)", fontSize: 13 }}>No closed deals this month</div>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#22c55e" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />Won: {stats.wonThisMonth}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#ef4444" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />Lost: {stats.lostThisMonth}</span>
          </div>
        </div>
      </div>

      {/* Upcoming / Overdue */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>Follow-ups & Tasks</h3>
        {upcoming.overdue.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}><AlertTriangle size={12} /> Overdue ({upcoming.overdue.length})</h4>
            {upcoming.overdue.slice(0, 5).map(t => <TaskRow key={t._id} task={t} overdue />)}
          </div>
        )}
        {upcoming.today.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginBottom: 8 }}>Today ({upcoming.today.length})</h4>
            {upcoming.today.map(t => <TaskRow key={t._id} task={t} />)}
          </div>
        )}
        {upcoming.upcoming.length > 0 && (
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 8 }}>Upcoming ({upcoming.upcoming.length})</h4>
            {upcoming.upcoming.slice(0, 5).map(t => <TaskRow key={t._id} task={t} />)}
          </div>
        )}
        {upcoming.overdue.length === 0 && upcoming.today.length === 0 && upcoming.upcoming.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-3)", textAlign: "center", padding: 20 }}>No pending tasks or follow-ups 🎉</p>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function TaskRow({ task, overdue }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
      background: overdue ? "rgba(239,68,68,0.06)" : "var(--surface-2)", marginBottom: 4,
      border: "1px solid var(--border)",
    }}>
      <Clock size={12} style={{ color: overdue ? "#ef4444" : "var(--text-3)" }} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{task.title}</span>
      {task.dueDate && (
        <span style={{ fontSize: 10, color: overdue ? "#ef4444" : "var(--text-3)" }}>
          {new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </span>
      )}
      <span style={{
        fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase",
        background: "var(--surface-3)", color: "var(--text-3)",
      }}>{task.type?.replace(/_/g, " ")}</span>
    </div>
  );
}
