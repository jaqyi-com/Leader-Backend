import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import {
  Users2, Building2, Mail, MapPin, Globe, TrendingUp,
  MessageSquare, Share2, Briefcase, CreditCard,
  Package, UserCog, Calculator, RefreshCw, AlertCircle,
  Activity, Target, Zap, CheckCircle2, ShieldCheck,
  ArrowUpRight, Lock,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const ADMIN_EMAIL = "akshatv00001@gmail.com";

// ── tiny helpers ─────────────────────────────────────────────────────────────
const fmt = (n) =>
  n == null ? "—" : n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}k`
    : String(n);

const currency = (n) =>
  n == null ? "—" :
  `₹${n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString("en-IN")}`;

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data = [], color = "#E23744", height = 36 }) {
  if (!data.length) return <div style={{ height }} />;
  const counts = data.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const min = Math.min(...counts, 0);
  const range = max - min || 1;
  const w = 120, h = height;
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
        <linearGradient id={`g${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#g${color.replace("#","")})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {counts.length > 0 && (
        <circle cx={pts[pts.length-1].split(",")[0]} cy={pts[pts.length-1].split(",")[1]} r="3" fill={color} />
      )}
    </svg>
  );
}

// ── Mini Bar ──────────────────────────────────────────────────────────────────
function MiniBar({ items = [], colorVar = "--accent" }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {items.slice(0, 6).map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className="w-20 truncate capitalize" style={{ color: "var(--text-3)" }}>{item.label}</span>
          <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--surface-3)" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.count / max) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: `var(${colorVar})` }}
            />
          </div>
          <span className="w-8 text-right font-semibold" style={{ color: "var(--text-2)" }}>{fmt(item.count)}</span>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs" style={{ color: "var(--text-3)" }}>No data yet.</p>}
    </div>
  );
}

// ── Donut ─────────────────────────────────────────────────────────────────────
function Donut({ segments = [], size = 90 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
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
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
      {arcs.map((arc, i) => (
        <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
          stroke={arc.color} strokeWidth="8"
          strokeDasharray={`${arc.dash} ${circ - arc.dash}`}
          strokeDashoffset={circ / 4 - arc.offset} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      ))}
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 13, fontWeight: 700, fill: "var(--text)", fontFamily: "Inter,sans-serif" }}>
        {fmt(total)}
      </text>
    </svg>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = "var(--accent)" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }} className="card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}18` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{label}</span>
      </div>
      <span className="text-2xl font-bold" style={{ color: "var(--text)" }}>{value}</span>
    </motion.div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, color = "var(--accent)" }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={14} style={{ color }} />
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

// ── Org Card ──────────────────────────────────────────────────────────────────
function OrgCard({ org, idx }) {
  const colors = ["var(--accent)", "var(--teal)", "var(--emerald)", "var(--violet)", "var(--ember)"];
  const c = colors[idx % colors.length];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }} className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: c }}>
            {(org.name || "?")[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text)" }}>{org.name}</p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>{org.slug}</p>
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${c}18`, color: c }}>
          {fmt(org.memberCount)} member{org.memberCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Leads", val: org.leads },
          { label: "Outreach", val: org.outreach },
          { label: "Deals", val: org.deals },
        ].map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5">
            <span className="text-xs" style={{ color: "var(--text-3)" }}>{r.label}</span>
            <span className="text-base font-bold" style={{ color: c }}>{fmt(r.val)}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
        Created {new Date(org.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
      </p>
    </motion.div>
  );
}

// ── 403 Wall ──────────────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(226,55,68,0.12)", border: "1px solid rgba(226,55,68,0.25)" }}>
        <Lock size={28} style={{ color: "var(--rose)" }} />
      </div>
      <h2 className="text-xl font-bold text-center" style={{ color: "var(--text)" }}>Access Restricted</h2>
      <p className="text-sm text-center max-w-xs" style={{ color: "var(--text-3)" }}>
        This section is only accessible to the application owner. If you believe this is a mistake, contact your administrator.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminAnalyticsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;

  const [data, setData] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [analyticsRes, orgsRes] = await Promise.all([
        fetch(`${API_BASE}/analytics?days=${days}`, { headers }),
        fetch(`${API_BASE}/org/all`, { headers }),
      ]);
      if (!analyticsRes.ok) {
        const e = await analyticsRes.json().catch(() => ({}));
        throw new Error(e.error || `Server ${analyticsRes.status}`);
      }
      const analyticsJson = await analyticsRes.json();
      setData(analyticsJson);

      // org list is best-effort
      if (orgsRes.ok) {
        const orgJson = await orgsRes.json().catch(() => []);
        setOrgs(Array.isArray(orgJson) ? orgJson : orgJson.orgs ?? []);
      }

      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days, isAdmin, token]);

  useEffect(() => { load(); }, [load]);

  // ── guard ──────────────────────────────────────────────────────────────────
  if (!isAdmin) return <AccessDenied />;

  // ── derived ────────────────────────────────────────────────────────────────
  const o   = data?.overview        ?? {};
  const lg  = data?.leadGeneration  ?? {};
  const ls  = data?.leadScoring     ?? {};
  const out = data?.outreach        ?? {};
  const cr  = data?.crawler         ?? {};
  const soc = data?.social          ?? {};
  const crm = data?.crm             ?? {};
  const hr  = data?.hr              ?? {};
  const acc = data?.accounting      ?? {};
  const inv = data?.inventory       ?? {};
  const tr  = data?.trends          ?? {};

  const outreachStatus  = (out.statusBreakdown              ?? []).map((s) => ({ label: s.status,   count: s.count }));
  const leadStatus      = (lg.generatedLeadStatusBreakdown  ?? []).map((s) => ({ label: s.status,   count: s.count }));
  const dealStages      = (crm.deals?.stageBreakdown        ?? []).map((s) => ({ label: s.stage,    count: s.count }));
  const socialPlatforms = (soc.platformBreakdown            ?? []).map((p) => ({ label: p.platform, count: p.count }));
  const responseIntents = (out.responseIntents              ?? []).map((r) => ({ label: r.intent,   count: r.count }));

  const scoringSegments = [
    { color: "#e11d48", value: ls.high   ?? 0 },
    { color: "#f59e0b", value: ls.medium ?? 0 },
    { color: "#10b981", value: ls.low    ?? 0 },
  ];
  const dealSegments = [
    { color: "#10b981", value: crm.deals?.won  ?? 0 },
    { color: "#E23744", value: crm.deals?.lost ?? 0 },
    { color: "#22d3ee", value: crm.deals?.open ?? 0 },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "var(--bg)" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 px-6 py-4 flex items-center justify-between"
        style={{ background: "var(--topbar-bg)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,var(--accent),#f4576a)", boxShadow: "0 0 16px var(--accent-glow)" }}>
            <ShieldCheck size={15} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
              Admin Analytics
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: "rgba(226,55,68,0.15)", color: "var(--accent)" }}>OWNER ONLY</span>
            </h1>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {lastRefresh ? `Last refreshed ${lastRefresh.toLocaleTimeString()}` : "Loading…"} · {user?.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl p-1"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            {[7, 14, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background: days === d ? "var(--accent)" : "transparent", color: days === d ? "#fff" : "var(--text-3)" }}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="btn-secondary text-xs gap-1.5 flex items-center">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-6 mt-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
            style={{ background: "rgba(226,55,68,0.1)", border: "1px solid rgba(226,55,68,0.25)", color: "var(--rose)" }}>
            <AlertCircle size={15} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6 flex flex-col gap-8">

        {/* ── KPI Strip ── */}
        <section>
          <SectionHeader icon={Zap} label="Platform Overview" color="var(--accent)" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Users2}    label="Total Leads"    value={fmt(o.totalLeads)}          color="var(--accent)"  />
            <StatCard icon={Building2} label="Companies"      value={fmt(o.totalCompanies)}       color="var(--teal)"    />
            <StatCard icon={Mail}      label="Contacts"       value={fmt(o.totalContacts)}        color="var(--violet)"  />
            <StatCard icon={Target}    label="Gen. Leads"     value={fmt(o.totalGeneratedLeads)}  color="var(--ember)"   />
            <StatCard icon={MapPin}    label="Places"         value={fmt(o.totalPlaces)}          color="var(--emerald)" />
            <StatCard icon={Activity}  label="Reply Rate"     value={o.replyRate ?? "—"}          color="var(--rose)"    />
          </div>
        </section>

        {/* ── Organisations ── */}
        {orgs.length > 0 && (
          <section>
            <SectionHeader icon={Building2} label={`Organisations (${orgs.length})`} color="var(--teal)" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {orgs.map((org, i) => <OrgCard key={org._id} org={org} idx={i} />)}
            </div>
          </section>
        )}

        {/* ── Lead Generation + Scoring ── */}
        <section>
          <SectionHeader icon={Target} label="Lead Generation & Scoring" color="var(--violet)" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-5 flex flex-col gap-4">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Lead Sources</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Companies",  val: lg.companies,      color: "var(--teal)"    },
                  { label: "Contacts",   val: lg.contacts,       color: "var(--violet)"  },
                  { label: "Gen. Leads", val: lg.generatedLeads, color: "var(--ember)"   },
                  { label: "Places",     val: lg.places,         color: "var(--emerald)" },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-0.5">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{item.label}</span>
                    <span className="text-lg font-bold" style={{ color: item.color }}>{fmt(item.val)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Lead Status</p>
              <MiniBar items={leadStatus} colorVar="--violet" />
            </div>
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Priority Scoring</p>
              <div className="flex items-center gap-4">
                <Donut segments={scoringSegments} size={90} />
                <div className="flex flex-col gap-2 text-xs">
                  {[
                    { label: "High",   val: ls.high,   color: "#e11d48" },
                    { label: "Medium", val: ls.medium, color: "#f59e0b" },
                    { label: "Low",    val: ls.low,    color: "#10b981" },
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
          </div>
        </section>

        {/* ── Outreach ── */}
        <section>
          <SectionHeader icon={Mail} label="Outreach" color="var(--teal)" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-5 flex flex-col gap-4">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Outreach KPIs</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total Sent",   val: fmt(out.sent),            color: "var(--teal)"    },
                  { label: "Replies",      val: fmt(out.replied),         color: "var(--emerald)" },
                  { label: "Responses",    val: fmt(out.totalResponses),  color: "var(--violet)"  },
                  { label: "Reply Rate",   val: out.replyRate ?? "—",     color: "var(--accent)"  },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-0.5">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{item.label}</span>
                    <span className="text-lg font-bold" style={{ color: item.color }}>{item.val}</span>
                  </div>
                ))}
              </div>
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
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Outreach Status</p>
              <MiniBar items={outreachStatus} colorVar="--teal" />
            </div>
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Response Intents</p>
              <MiniBar items={responseIntents} colorVar="--emerald" />
            </div>
          </div>
        </section>

        {/* ── CRM ── */}
        <section>
          <SectionHeader icon={Briefcase} label="CRM & Revenue" color="var(--emerald)" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Pipeline Stages</p>
              <MiniBar items={dealStages} colorVar="--emerald" />
            </div>
            <div className="card p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Financials</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Revenue",    val: currency(crm.revenue), color: "var(--emerald)" },
                  { label: "Invoices",   val: fmt(crm.invoices),     color: "var(--teal)"    },
                  { label: "Payments",   val: fmt(crm.payments),     color: "var(--violet)"  },
                  { label: "Activities", val: fmt(crm.activities),   color: "var(--ember)"   },
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

        {/* ── Infrastructure ── */}
        <section>
          <SectionHeader icon={Globe} label="Infrastructure & Ops" color="var(--ember)" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              {
                label: "Crawler", icon: Globe, color: "var(--ember)",
                rows: [
                  { label: "Websites",     val: cr.totalWebsites },
                  { label: "Crawl Runs",   val: cr.crawlRuns?.total },
                  { label: "Completed",    val: cr.crawlRuns?.completed },
                  { label: "Auto Sessions",val: cr.autoScraperSessions },
                ],
              },
              {
                label: "Social", icon: Share2, color: "var(--violet)",
                rows: [
                  { label: "Total Posts",  val: soc.total },
                  { label: "Published",    val: soc.published },
                  { label: "Pending",      val: soc.pendingApproval },
                  ...socialPlatforms.slice(0, 2).map((p) => ({ label: p.label, val: p.count })),
                ],
              },
              {
                label: "HR / Payroll", icon: UserCog, color: "var(--teal)",
                rows: [
                  { label: "Employees", val: hr.employees },
                  { label: "Payslips",  val: hr.payslips },
                ],
              },
              {
                label: "Accounting", icon: Calculator, color: "var(--accent)",
                rows: [
                  { label: "Vouchers", val: acc.vouchers },
                ],
              },
              {
                label: "Inventory", icon: Package, color: "var(--emerald)",
                rows: [
                  { label: "Stock Items", val: inv.stockItems },
                  { label: "Orders",      val: inv.orders },
                ],
              },
            ].map(({ label, icon: Icon, color, rows }) => (
              <div key={label} className="card p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Icon size={13} style={{ color }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>{label}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {rows.map((r) => (
                    <div key={r.label} className="flex justify-between text-xs">
                      <span className="capitalize" style={{ color: "var(--text-3)" }}>{r.label}</span>
                      <span className="font-semibold" style={{ color: "var(--text)" }}>{fmt(r.val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trends ── */}
        <section>
          <SectionHeader icon={TrendingUp} label={`Growth — Last ${days} Days`} color="var(--teal)" />
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
                    <span className="text-xs font-bold" style={{ color: t.color }}>{fmt(total)}</span>
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

        <div className="py-4 text-center text-xs" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
          Owner-only admin view · {orgs.length} org{orgs.length !== 1 ? "s" : ""} · Window: {days}d · {data ? "All sections loaded" : "Awaiting data"}
        </div>
      </div>
    </div>
  );
}
