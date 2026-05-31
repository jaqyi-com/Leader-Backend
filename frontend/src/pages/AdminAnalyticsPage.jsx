import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users2, Building2, Mail, MapPin, Globe, BarChart3,
  TrendingUp, MessageSquare, Share2, Briefcase, CreditCard,
  Package, UserCog, Calculator, RefreshCw, AlertCircle,
  Activity, Target, Zap, CheckCircle2, XCircle, Clock,
  ArrowUpRight, ShieldCheck, Database,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ── tiny helpers ─────────────────────────────────────────────────────────────
const fmt = (n) =>
  n == null ? "—" : n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}k`
    : String(n);

const currency = (n) =>
  n == null ? "—" : `₹${n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString("en-IN")}`;

function pct(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

// ── Mini Sparkline (SVG) ──────────────────────────────────────────────────────
function Sparkline({ data = [], color = "#E23744", height = 36 }) {
  if (!data.length) return <div style={{ height }} />;
  const counts = data.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const min = Math.min(...counts, 0);
  const range = max - min || 1;
  const w = 120;
  const h = height;
  const pts = counts.map((c, i) => {
    const x = (i / Math.max(counts.length - 1, 1)) * w;
    const y = h - ((c - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const area = `${pts[0].split(",")[0]},${h} ${polyline} ${pts[pts.length - 1].split(",")[0]},${h}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={area}
        fill={`url(#grad-${color.replace("#", "")})`}
      />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {counts.length > 0 && (
        <circle
          cx={pts[pts.length - 1].split(",")[0]}
          cy={pts[pts.length - 1].split(",")[1]}
          r="3"
          fill={color}
        />
      )}
    </svg>
  );
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
function MiniBar({ items = [], colorVar = "--accent" }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {items.slice(0, 6).map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className="w-20 truncate" style={{ color: "var(--text-3)" }}>
            {item.label}
          </span>
          <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--surface-3)" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.count / max) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: `var(${colorVar})` }}
            />
          </div>
          <span className="w-8 text-right font-semibold" style={{ color: "var(--text-2)" }}>
            {fmt(item.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function Donut({ segments = [], size = 90 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const dash = (seg.value / total) * circ;
    const arc = { ...seg, dash, offset };
    offset += dash;
    return arc;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth="8"
          strokeDasharray={`${arc.dash} ${circ - arc.dash}`}
          strokeDashoffset={circ / 4 - arc.offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      ))}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 13, fontWeight: 700, fill: "var(--text)", fontFamily: "Inter, sans-serif" }}>
        {fmt(total)}
      </text>
    </svg>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = "var(--accent)", trend }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="card p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}18` }}
          >
            <Icon size={15} style={{ color }} />
          </div>
          <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>
            {label}
          </span>
        </div>
        {trend && (
          <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "var(--emerald)" }}>
            <ArrowUpRight size={12} /> {trend}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold" style={{ color: "var(--text)" }}>
          {value}
        </span>
        {sub && (
          <span className="text-xs pb-0.5" style={{ color: "var(--text-3)" }}>
            {sub}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, color = "var(--accent)" }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={14} style={{ color }} />
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/analytics?days=${days}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // ── derived ──────────────────────────────────────────────────────────────
  const o = data?.overview ?? {};
  const lg = data?.leadGeneration ?? {};
  const ls = data?.leadScoring ?? {};
  const out = data?.outreach ?? {};
  const cr = data?.crawler ?? {};
  const soc = data?.social ?? {};
  const crm = data?.crm ?? {};
  const hr = data?.hr ?? {};
  const acc = data?.accounting ?? {};
  const inv = data?.inventory ?? {};
  const tr = data?.trends ?? {};

  const outreachStatus = (out.statusBreakdown ?? []).map((s) => ({ label: s.status, count: s.count }));
  const leadStatus = (lg.generatedLeadStatusBreakdown ?? []).map((s) => ({ label: s.status, count: s.count }));
  const dealStages = (crm.deals?.stageBreakdown ?? []).map((s) => ({ label: s.stage, count: s.count }));
  const socialPlatforms = (soc.platformBreakdown ?? []).map((p) => ({ label: p.platform, count: p.count }));

  const scoringSegments = [
    { color: "#e11d48", value: ls.high ?? 0, label: "High" },
    { color: "#f59e0b", value: ls.medium ?? 0, label: "Medium" },
    { color: "#10b981", value: ls.low ?? 0, label: "Low" },
  ];

  const dealSegments = [
    { color: "#10b981", value: crm.deals?.won ?? 0, label: "Won" },
    { color: "#E23744", value: crm.deals?.lost ?? 0, label: "Lost" },
    { color: "#22d3ee", value: crm.deals?.open ?? 0, label: "Open" },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "var(--bg)" }}>
      {/* ── Header ── */}
      <div
        className="sticky top-0 z-20 px-6 py-4 flex items-center justify-between"
        style={{
          background: "var(--topbar-bg)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,var(--accent),#f4576a)", boxShadow: "0 0 16px var(--accent-glow)" }}
          >
            <ShieldCheck size={15} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: "var(--text)" }}>Admin Analytics</h1>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Application-wide overview · {lastRefresh ? `Refreshed ${lastRefresh.toLocaleTimeString()}` : "Loading…"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Window picker */}
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: days === d ? "var(--accent)" : "transparent",
                  color: days === d ? "#fff" : "var(--text-3)",
                }}
              >
                {d}d
              </button>
            ))}
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary text-xs gap-1.5 flex items-center"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-6 mt-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
            style={{ background: "rgba(226,55,68,0.1)", border: "1px solid rgba(226,55,68,0.25)", color: "var(--rose)" }}
          >
            <AlertCircle size={15} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ── */}
      <div className="p-6 flex flex-col gap-8">

        {/* ── KPI Overview Strip ── */}
        <section>
          <SectionHeader icon={Zap} label="Overview" color="var(--accent)" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Users2}    label="Total Leads"    value={fmt(o.totalLeads)}       color="var(--accent)"  />
            <StatCard icon={Building2} label="Companies"      value={fmt(o.totalCompanies)}   color="var(--teal)"    />
            <StatCard icon={Mail}      label="Contacts"       value={fmt(o.totalContacts)}    color="var(--violet)"  />
            <StatCard icon={Target}    label="Gen. Leads"     value={fmt(o.totalGeneratedLeads)} color="var(--ember)" />
            <StatCard icon={MapPin}    label="Places"         value={fmt(o.totalPlaces)}      color="var(--emerald)" />
            <StatCard icon={Activity}  label="Reply Rate"     value={o.replyRate ?? "—"}      color="var(--rose)"    />
          </div>
        </section>

        {/* ── Lead Generation + Scoring ── */}
        <section>
          <SectionHeader icon={Target} label="Lead Generation & Scoring" color="var(--violet)" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Lead Gen stats */}
            <div className="card p-5 flex flex-col gap-4">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Lead Sources</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Companies",    val: lg.companies,      color: "var(--teal)" },
                  { label: "Contacts",     val: lg.contacts,       color: "var(--violet)" },
                  { label: "Gen. Leads",   val: lg.generatedLeads, color: "var(--ember)" },
                  { label: "Places",       val: lg.places,         color: "var(--emerald)" },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-0.5">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{item.label}</span>
                    <span className="text-lg font-bold" style={{ color: item.color }}>{fmt(item.val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lead status breakdown */}
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Lead Status Breakdown</p>
              <MiniBar items={leadStatus} colorVar="--violet" />
            </div>

            {/* Lead scoring donut */}
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Lead Priority Scores</p>
              <div className="flex items-center gap-4">
                <Donut segments={scoringSegments} size={90} />
                <div className="flex flex-col gap-2 text-xs">
                  {[
                    { label: "High",   val: ls.high,   color: "#e11d48" },
                    { label: "Medium", val: ls.medium, color: "#f59e0b" },
                    { label: "Low",    val: ls.low,    color: "#10b981" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span style={{ color: "var(--text-3)" }}>{s.label}</span>
                      <span className="ml-auto font-semibold" style={{ color: "var(--text)" }}>{fmt(s.val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Outreach ── */}
        <section>
          <SectionHeader icon={Mail} label="Outreach" color="var(--teal)" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* KPIs */}
            <div className="card p-5 flex flex-col gap-4">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Outreach Stats</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Sent",        val: fmt(out.sent),           icon: CheckCircle2, color: "var(--teal)" },
                  { label: "Replies",     val: fmt(out.replied),        icon: MessageSquare, color: "var(--emerald)" },
                  { label: "Responses",   val: fmt(out.totalResponses), icon: Activity, color: "var(--violet)" },
                  { label: "Reply Rate",  val: out.replyRate ?? "—",    icon: TrendingUp, color: "var(--accent)" },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <item.icon size={11} style={{ color: item.color }} />
                      <span className="text-xs" style={{ color: "var(--text-3)" }}>{item.label}</span>
                    </div>
                    <span className="text-lg font-bold" style={{ color: item.color }}>{item.val}</span>
                  </div>
                ))}
              </div>
              {/* Campaigns */}
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "var(--surface-2)" }}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs" style={{ color: "var(--text-3)" }}>Campaigns</span>
                  <span className="text-base font-bold" style={{ color: "var(--text)" }}>{fmt(out.campaigns?.total)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold"
                  style={{ background: "rgba(16,185,129,0.12)", color: "var(--emerald)" }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                  {fmt(out.campaigns?.active)} active
                </div>
              </div>
            </div>

            {/* Status breakdown */}
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Outreach Status</p>
              <MiniBar items={outreachStatus} colorVar="--teal" />
            </div>

            {/* Response intents */}
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Response Intents</p>
              <MiniBar
                items={(out.responseIntents ?? []).map((r) => ({ label: r.intent, count: r.count }))}
                colorVar="--emerald"
              />
            </div>
          </div>
        </section>

        {/* ── CRM & Revenue ── */}
        <section>
          <SectionHeader icon={Briefcase} label="CRM & Revenue" color="var(--emerald)" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Deal donut */}
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Deal Outcomes</p>
              <div className="flex items-center gap-4">
                <Donut segments={dealSegments} size={90} />
                <div className="flex flex-col gap-2 text-xs">
                  {[
                    { label: "Won",  val: crm.deals?.won,  color: "#10b981" },
                    { label: "Lost", val: crm.deals?.lost, color: "#E23744" },
                    { label: "Open", val: crm.deals?.open, color: "#22d3ee" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span style={{ color: "var(--text-3)" }}>{s.label}</span>
                      <span className="ml-auto font-semibold" style={{ color: "var(--text)" }}>{fmt(s.val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Deal stage bar */}
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Pipeline Stages</p>
              <MiniBar items={dealStages} colorVar="--emerald" />
            </div>

            {/* Revenue & CRM KPIs */}
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Financial KPIs</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Revenue",    val: currency(crm.revenue),  color: "var(--emerald)" },
                  { label: "Invoices",   val: fmt(crm.invoices),      color: "var(--teal)" },
                  { label: "Payments",   val: fmt(crm.payments),      color: "var(--violet)" },
                  { label: "Activities", val: fmt(crm.activities),    color: "var(--ember)" },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-0.5">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{item.label}</span>
                    <span className="text-lg font-bold" style={{ color: item.color }}>{item.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Crawler · Social · HR · Accounting · Inventory ── */}
        <section>
          <SectionHeader icon={Globe} label="Infrastructure & Operations" color="var(--ember)" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Crawler */}
            <div className="card p-4 flex flex-col gap-3 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2">
                <Globe size={13} style={{ color: "var(--ember)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Crawler</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: "Websites",     val: cr.totalWebsites },
                  { label: "Crawl Runs",   val: cr.crawlRuns?.total },
                  { label: "Completed",    val: cr.crawlRuns?.completed },
                  { label: "Auto Scraper", val: cr.autoScraperSessions },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-xs">
                    <span style={{ color: "var(--text-3)" }}>{r.label}</span>
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{fmt(r.val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Social */}
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Share2 size={13} style={{ color: "var(--violet)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Social</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: "Total Posts",  val: soc.total },
                  { label: "Published",    val: soc.published },
                  { label: "Pending",      val: soc.pendingApproval },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-xs">
                    <span style={{ color: "var(--text-3)" }}>{r.label}</span>
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{fmt(r.val)}</span>
                  </div>
                ))}
                {socialPlatforms.slice(0, 2).map((p) => (
                  <div key={p.label} className="flex justify-between text-xs">
                    <span className="capitalize" style={{ color: "var(--text-3)" }}>{p.label}</span>
                    <span className="font-semibold" style={{ color: "var(--violet)" }}>{fmt(p.count)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* HR */}
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <UserCog size={13} style={{ color: "var(--teal)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>HR / Payroll</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: "Employees", val: hr.employees },
                  { label: "Payslips",  val: hr.payslips },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-xs">
                    <span style={{ color: "var(--text-3)" }}>{r.label}</span>
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{fmt(r.val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Accounting */}
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Calculator size={13} style={{ color: "var(--accent)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Accounting</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--text-3)" }}>Vouchers</span>
                  <span className="font-semibold" style={{ color: "var(--text)" }}>{fmt(acc.vouchers)}</span>
                </div>
              </div>
            </div>

            {/* Inventory */}
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Package size={13} style={{ color: "var(--emerald)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Inventory</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: "Stock Items", val: inv.stockItems },
                  { label: "Orders",      val: inv.orders },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-xs">
                    <span style={{ color: "var(--text-3)" }}>{r.label}</span>
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{fmt(r.val)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Trend Charts ── */}
        <section>
          <SectionHeader icon={TrendingUp} label={`Growth Trends — Last ${days} Days`} color="var(--teal)" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "Contacts",    data: tr.contacts,       color: "#a78bfa" },
              { label: "Gen. Leads",  data: tr.generatedLeads, color: "#f59e0b" },
              { label: "Outreach",    data: tr.outreach,       color: "#22d3ee" },
              { label: "Crawl Runs",  data: tr.crawlRuns,      color: "#E23744" },
              { label: "Deals",       data: tr.deals,          color: "#10b981" },
            ].map((t) => {
              const total = (t.data ?? []).reduce((s, d) => s + d.count, 0);
              return (
                <div key={t.label} className="card p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{t.label}</span>
                    <span className="text-xs font-bold" style={{ color: t.color }}>{fmt(total)} total</span>
                  </div>
                  <Sparkline data={t.data ?? []} color={t.color} height={36} />
                  <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-3)" }}>
                    <span>{t.data?.[0]?.date?.slice(5) ?? "—"}</span>
                    <span>{t.data?.[t.data.length - 1]?.date?.slice(5) ?? "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Footer ── */}
        <div className="py-4 text-center text-xs" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
          Admin-only view · Data window: last {days} days · {data ? `${Object.keys(data).length} sections loaded` : "Awaiting data…"}
        </div>
      </div>
    </div>
  );
}
