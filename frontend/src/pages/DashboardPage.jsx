import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useCountUp } from "react-countup";
import {
  Building2, Users, Mail, TrendingUp, Activity, RefreshCw,
  MessageSquare, Star, ArrowUpRight
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { getStats, BASE } from "../api";

function AnimatedNumber({ value, suffix = "" }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = Number(value) || 0;
    if (start === end) { setDisplay(end); return; }
    const duration = 1200;
    const step = Math.ceil(end / (duration / 16));
    const timer = setInterval(() => {
      start = Math.min(start + step, end);
      setDisplay(start);
      if (start >= end) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toLocaleString()}{suffix}</span>;
}

// Helper — supports both old field names and new
const s_companies   = (s) => s?.scraping?.totalCompanies   ?? s?.scraping?.discovered          ?? 0;
const s_contacts    = (s) => s?.enrichment?.totalContacts  ?? s?.enrichment?.enrichedContacts   ?? 0;
const s_qualified   = (s) => s?.scraping?.qualifiedCompanies ?? s?.scraping?.discovered         ?? 0;
const s_highPri     = (s) => s?.scoring?.highPriority      ?? s?.scoring?.high                  ?? 0;
const s_medPri      = (s) => s?.scoring?.mediumPriority    ?? s?.scoring?.medium                ?? 0;
const s_lowPri      = (s) => s?.scoring?.lowPriority       ?? s?.scoring?.low                   ?? 0;

const STAT_CARDS = (stats) => [
  {
    label: "Companies Found",
    value: s_companies(stats),
    icon: Building2,
    color: "from-brand-500 to-brand-600",
    glow: "shadow-glow",
    change: "+12%",
  },
  {
    label: "Contacts Enriched",
    value: s_contacts(stats),
    icon: Users,
    color: "from-accent-cyan to-teal-500",
    glow: "shadow-glow-cyan",
    change: "+8%",
  },
  {
    label: "Emails Sent",
    value: stats?.outreach?.totalSent ?? 0,
    icon: Mail,
    color: "from-violet-500 to-purple-600",
    glow: "",
    change: "+24%",
  },
  {
    label: "Response Rate",
    value: stats?.outreach?.responseRate ?? 0,
    suffix: "%",
    icon: TrendingUp,
    color: "from-accent-green to-emerald-600",
    glow: "",
    change: "+3%",
  },
  {
    label: "Inbound Replies",
    value: stats?.outreach?.totalResponses ?? 0,
    icon: MessageSquare,
    color: "from-accent-orange to-red-500",
    glow: "",
    change: "+5",
  },
  {
    label: "HIGH Priority Leads",
    value: s_highPri(stats),
    icon: Star,
    color: "from-amber-400 to-orange-500",
    glow: "",
    change: "",
  },
];

const PRIORITY_COLORS = ["#e17055", "#fdcb6e", "#00b894"];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:  { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } },
};

export default function DashboardPage() {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data } = await getStats();
      setStats(data.stats);
    } catch (e) {
      setError(`Could not reach ${BASE}. Please ensure the backend is running and accessible.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const cards = STAT_CARDS(stats);

  const priorityData = [
    { name: "HIGH",   value: s_highPri(stats) },
    { name: "MEDIUM", value: s_medPri(stats) },
    { name: "LOW",    value: s_lowPri(stats) },
  ];

  const areaData = [
    { name: "Scrape",   companies: s_companies(stats) },
    { name: "Enrich",   contacts:  s_contacts(stats) },
    { name: "Outreach", sent: stats?.outreach?.totalSent ?? 0, responses: stats?.outreach?.totalResponses ?? 0 },
    { name: "Score",    high: s_highPri(stats), medium: s_medPri(stats) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome back 👋
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time overview of your Leader Agent pipeline
          </p>
        </div>
        <button onClick={fetchStats} disabled={loading} className="btn-secondary gap-2">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Stat Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
      >
        {cards.map((card) => (
          <motion.div key={card.label} variants={itemVariants}>
            <div className={`glass-card p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ${card.glow}`}>
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-3 shadow-md`}>
                <card.icon size={17} className="text-white" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                <AnimatedNumber value={card.value} suffix={card.suffix} />
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{card.label}</p>
              {card.change && (
                <div className="flex items-center gap-1 mt-2">
                  <ArrowUpRight size={11} className="text-emerald-500" />
                  <span className="text-[10px] font-semibold text-emerald-500">{card.change}</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Priority Donut */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-5"
        >
          <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Lead Priority</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={priorityData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                {priorityData.map((_, i) => (
                  <Cell key={i} fill={PRIORITY_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.9)", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-300">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Activity Area Chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-5 lg:col-span-2"
        >
          <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Pipeline Funnel</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={areaData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="cgr1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6c5ce7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cgr2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00cec9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00cec9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.9)", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
              <Area type="monotone" dataKey="companies" stroke="#6c5ce7" fill="url(#cgr1)" strokeWidth={2} dot={false} name="Companies" />
              <Area type="monotone" dataKey="contacts"  stroke="#00cec9" fill="url(#cgr2)" strokeWidth={2} dot={false} name="Contacts" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Pipeline Phase Status */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-5"
      >
        <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Activity size={16} className="text-brand-500" />
          Pipeline Phase Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { phase: "Scrape",   val: s_companies(stats) || "—",  unit: "companies", color: "bg-brand-500" },
            { phase: "Enrich",   val: s_contacts(stats) || "—",   unit: "contacts",  color: "bg-accent-cyan" },
            { phase: "Qualify",  val: s_qualified(stats) || "—",  unit: "qualified", color: "bg-violet-500" },
            { phase: "Outreach", val: stats?.outreach?.totalSent ?? "—", unit: "sent", color: "bg-accent-green" },
            { phase: "Score",    val: s_highPri(stats) + s_medPri(stats) || "—", unit: "scored", color: "bg-amber-500" },
            { phase: "Report",   val: stats?.outreach?.totalResponses ?? "—", unit: "responses", color: "bg-accent-orange" },
          ].map(({ phase, val, unit, color }) => (
            <div key={phase} className="text-center p-3 rounded-xl bg-slate-50 dark:bg-gray-800/60">
              <div className={`w-2 h-2 rounded-full ${color} mx-auto mb-2`} />
              <p className="text-lg font-bold text-slate-900 dark:text-white">{val ?? "—"}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">{unit}</p>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">{phase}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
