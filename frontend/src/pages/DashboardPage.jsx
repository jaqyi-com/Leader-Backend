import { useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useSpring, animate } from "framer-motion";
import {
  Building2, Users, Mail, TrendingUp, MessageSquare, Star,
  ArrowUpRight, RefreshCw, Zap, Activity, Target, ChevronRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { getStats, BASE } from "../api";

// ── Animated counter ─────────────────────────────────────────────────────────
function CountUp({ to, suffix = "", duration = 1.5 }) {
  const ref = useRef(null);
  useEffect(() => {
    const controls = animate(0, Number(to) || 0, {
      duration,
      ease: "easeOut",
      onUpdate(val) {
        if (ref.current) ref.current.textContent = Math.round(val).toLocaleString() + suffix;
      },
    });
    return controls.stop;
  }, [to, suffix, duration]);
  return <span ref={ref}>0{suffix}</span>;
}

// ── Stat helpers ──────────────────────────────────────────────────────────────
const s_companies = (s) => s?.scraping?.totalCompanies   ?? s?.scraping?.discovered  ?? 0;
const s_contacts  = (s) => s?.enrichment?.totalContacts  ?? s?.enrichment?.enrichedContacts ?? 0;
const s_qualified = (s) => s?.scraping?.qualifiedCompanies ?? s?.scraping?.discovered ?? 0;
const s_highPri   = (s) => s?.scoring?.highPriority      ?? s?.scoring?.high         ?? 0;
const s_medPri    = (s) => s?.scoring?.mediumPriority    ?? s?.scoring?.medium        ?? 0;
const s_lowPri    = (s) => s?.scoring?.lowPriority       ?? s?.scoring?.low           ?? 0;

// ── Micro-sparkline bar chart ─────────────────────────────────────────────────
function SparkBars({ values = [], color = "var(--accent)" }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.map((v, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${(v / max) * 100}%` }}
          transition={{ delay: i * 0.05, duration: 0.5, ease: "easeOut" }}
          className="flex-1 rounded-sm opacity-60"
          style={{ background: color, minHeight: 2 }}
        />
      ))}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, suffix, icon: Icon, gradient, sparkData, change, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card card-interactive card-glow p-5 flex flex-col gap-3 cursor-default"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: gradient, boxShadow: `0 4px 16px rgba(0,0,0,0.3)` }}
        >
          <Icon size={17} color="#fff" />
        </div>
        {change && (
          <span className="badge badge-green text-[10px] gap-0.5">
            <ArrowUpRight size={10} />
            {change}
          </span>
        )}
      </div>

      {/* Value */}
      <div>
        <p className="text-3xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          <CountUp to={value} suffix={suffix} />
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
          {label}
        </p>
      </div>

      {/* Sparkline */}
      {sparkData && <SparkBars values={sparkData} color={gradient.match(/#[a-f0-9]{6}/i)?.[0] ?? "var(--accent)"} />}
    </motion.div>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 shadow-xl text-xs"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text)" }}
    >
      <p className="font-semibold mb-1" style={{ color: "var(--text-2)" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey}>
          <span style={{ color: p.color }}>{p.name}: </span>
          <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ── Pipeline phase row ─────────────────────────────────────────────────────────
function PhaseRow({ phase, val, unit, color, progress, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="flex items-center gap-4"
    >
      <div className="w-28 flex-shrink-0">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{phase}</p>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>{unit}</p>
      </div>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ delay: delay + 0.2, duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span
        className="w-10 text-right text-sm font-bold flex-shrink-0"
        style={{ color: "var(--text)" }}
      >
        {val ?? "—"}
      </span>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data } = await getStats();
      setStats(data.stats);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      setError(`Could not reach ${BASE}. Ensure the backend is running.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const CARDS = [
    {
      label: "Companies Found", value: s_companies(stats), icon: Building2,
      gradient: "linear-gradient(135deg, #6c63ff, #8b5cf6)",
      change: "+12%", sparkData: [2, 5, 4, 8, 6, 12, 10], delay: 0,
    },
    {
      label: "Contacts Enriched", value: s_contacts(stats), icon: Users,
      gradient: "linear-gradient(135deg, #22d3ee, #06b6d4)",
      change: "+8%", sparkData: [1, 3, 5, 4, 7, 6, 9], delay: 0.05,
    },
    {
      label: "Emails Sent", value: stats?.outreach?.totalSent ?? 0, icon: Mail,
      gradient: "linear-gradient(135deg, #a78bfa, #7c3aed)",
      change: "+24%", sparkData: [3, 6, 4, 9, 7, 11, 8], delay: 0.1,
    },
    {
      label: "Response Rate", value: stats?.outreach?.responseRate ?? 0, suffix: "%", icon: TrendingUp,
      gradient: "linear-gradient(135deg, #10b981, #059669)",
      change: "+3%", sparkData: [5, 8, 7, 12, 10, 9, 13], delay: 0.15,
    },
    {
      label: "Inbound Replies", value: stats?.outreach?.totalResponses ?? 0, icon: MessageSquare,
      gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
      change: "+5", sparkData: [1, 2, 1, 3, 2, 4, 3], delay: 0.2,
    },
    {
      label: "High Priority", value: s_highPri(stats), icon: Star,
      gradient: "linear-gradient(135deg, #f43f5e, #e11d48)",
      sparkData: [1, 1, 2, 2, 3, 3, 4], delay: 0.25,
    },
  ];

  const areaData = [
    { name: "Scrape",   companies: s_companies(stats), contacts: 0 },
    { name: "Enrich",   companies: s_companies(stats), contacts: s_contacts(stats) },
    { name: "Outreach", companies: s_companies(stats), contacts: stats?.outreach?.totalSent ?? 0 },
    { name: "Score",    companies: s_companies(stats), contacts: s_highPri(stats) + s_medPri(stats) },
  ];

  const pieData = [
    { name: "High",   value: Math.max(s_highPri(stats), 0.01) },
    { name: "Medium", value: Math.max(s_medPri(stats), 0.01) },
    { name: "Low",    value: Math.max(s_lowPri(stats), 0.01) },
  ];
  const PIE_COLORS = ["#f43f5e", "#f59e0b", "#10b981"];

  const totalLeads = s_companies(stats) || 1;
  const PHASES = [
    { phase: "Scrape",   val: s_companies(stats) || "—",          unit: "companies", color: "linear-gradient(90deg, #6c63ff, #8b5cf6)", progress: 100, delay: 0 },
    { phase: "Enrich",   val: s_contacts(stats) || "—",           unit: "contacts",  color: "linear-gradient(90deg, #22d3ee, #06b6d4)", progress: s_contacts(stats) / totalLeads * 100, delay: 0.05 },
    { phase: "Qualify",  val: s_qualified(stats) || "—",          unit: "qualified", color: "linear-gradient(90deg, #a78bfa, #7c3aed)", progress: s_qualified(stats) / totalLeads * 100, delay: 0.10 },
    { phase: "Outreach", val: stats?.outreach?.totalSent ?? "—",  unit: "sent",      color: "linear-gradient(90deg, #10b981, #059669)", progress: (stats?.outreach?.totalSent ?? 0) / totalLeads * 100, delay: 0.15 },
    { phase: "Score",    val: s_highPri(stats) + s_medPri(stats) || "—", unit: "scored", color: "linear-gradient(90deg, #f59e0b, #d97706)", progress: (s_highPri(stats) + s_medPri(stats)) / totalLeads * 100, delay: 0.20 },
    { phase: "Replies",  val: stats?.outreach?.totalResponses ?? "—", unit: "responses", color: "linear-gradient(90deg, #f43f5e, #e11d48)", progress: (stats?.outreach?.totalResponses ?? 0) / totalLeads * 100, delay: 0.25 },
  ];

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <motion.h2
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            Welcome back 👋
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm mt-1"
            style={{ color: "var(--text-3)" }}
          >
            {lastUpdated
              ? `Last updated ${lastUpdated.toLocaleTimeString()}`
              : "Real-time pipeline intelligence"}
          </motion.p>
        </div>

        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={fetchStats}
          disabled={loading}
          className="btn-secondary gap-2"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Refreshing..." : "Refresh"}
        </motion.button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 flex items-center gap-3 text-sm"
          style={{
            background: "rgba(244,63,94,0.08)",
            border: "1px solid rgba(244,63,94,0.2)",
            color: "#f43f5e",
          }}
        >
          <Zap size={16} /> {error}
        </motion.div>
      )}

      {/* ── Stat cards grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {CARDS.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Pipeline funnel — 3 cols */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="card card-glow p-6 lg:col-span-3"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Pipeline Funnel</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>Companies → Qualified leads</p>
            </div>
            <span className="badge badge-purple gap-1">
              <Activity size={10} /> Live
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={areaData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6c63ff" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6c63ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="companies" stroke="#6c63ff" fill="url(#g1)" strokeWidth={2} dot={false} name="Companies" />
              <Area type="monotone" dataKey="contacts"  stroke="#22d3ee" fill="url(#g2)" strokeWidth={2} dot={false} name="Contacts" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Lead priority donut — 2 cols */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card card-glow p-6 lg:col-span-2"
        >
          <div className="mb-4">
            <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Lead Priority</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>Score distribution</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={46} outerRadius={68}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-col gap-2 mt-1">
            {[
              { label: "High Priority",   color: "#f43f5e", val: s_highPri(stats) },
              { label: "Medium Priority", color: "#f59e0b", val: s_medPri(stats) },
              { label: "Low Priority",    color: "#10b981", val: s_lowPri(stats) },
            ].map(({ label, color, val }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span style={{ color: "var(--text-3)" }}>{label}</span>
                </div>
                <span className="font-bold" style={{ color: "var(--text)" }}>{val}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Pipeline phase progress ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="card card-glow p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Pipeline Progress</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>Phase-by-phase funnel conversion</p>
          </div>
          <Target size={16} style={{ color: "var(--text-3)" }} />
        </div>

        <div className="flex flex-col gap-4">
          {PHASES.map((p) => (
            <PhaseRow key={p.phase} {...p} />
          ))}
        </div>
      </motion.div>

    </div>
  );
}
