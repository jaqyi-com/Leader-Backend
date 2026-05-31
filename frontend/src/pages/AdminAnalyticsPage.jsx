/**
 * Admin Analytics — /app/admin
 *
 * Two tabs:
 *  • Traffic  — website page-view analytics (matching screenshot design)
 *  • Platform — app-wide metrics (leads, CRM, outreach, etc.)
 *
 * Only accessible to ADMIN_EMAIL. Everyone else sees a lock screen.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import {
  Eye, TrendingUp, Activity, Users,
  Monitor, Smartphone, Tablet,
  Globe, RefreshCw, AlertCircle, Lock, ShieldCheck,
  Chrome, Layers,
  // platform tab
  Building2, Mail, Target, Briefcase, Share2,
  UserCog, Calculator, Package, Zap, MapPin,
} from "lucide-react";

const API_BASE   = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const ADMIN_EMAIL = "akshatv00001@gmail.com";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000)    return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000)return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

const DEVICE_ICON = {
  Desktop: Monitor,
  Mobile:  Smartphone,
  Tablet:  Tablet,
};

const COUNTRY_FLAG = (cc = "") => {
  // Convert ISO-2 to flag emoji
  if (!cc || cc.length !== 2) return "🌐";
  return cc.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
};

// ── Bar Chart (Last 24 Hours) ─────────────────────────────────────────────────
function HourBarChart({ data = [] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const labelIdxs = [0, 4, 8, 12, 16, 20]; // every 4 hours

  return (
    <div className="flex flex-col gap-2">
      {/* Bars */}
      <div className="flex items-end gap-px" style={{ height: 160 }}>
        {data.map((d, i) => {
          const pct = (d.count / max) * 100;
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(pct, d.count > 0 ? 2 : 0)}%` }}
              transition={{ duration: 0.5, delay: i * 0.01, ease: "easeOut" }}
              title={`${String(d.hour).padStart(2, "0")}:00 — ${d.count} view${d.count !== 1 ? "s" : ""}`}
              className="flex-1 rounded-sm cursor-pointer transition-opacity hover:opacity-80"
              style={{
                background: d.count > 0
                  ? "linear-gradient(to top, #6366f1, #818cf8)"
                  : "rgba(255,255,255,0.04)",
                minHeight: d.count > 0 ? 2 : 1,
              }}
            />
          );
        })}
      </div>

      {/* X-axis labels — show every 4th */}
      <div className="flex" style={{ height: 20 }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex justify-center">
            {labelIdxs.includes(i) ? (
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                {String(d.hour).padStart(2, "0")}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Progress Bar Row ──────────────────────────────────────────────────────────
function BarRow({ label, count, pct, icon: Icon, max }) {
  const barPct = max ? (count / max) * 100 : pct;
  return (
    <div className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {Icon && <Icon size={13} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />}
      <span className="text-sm flex-shrink-0" style={{ color: "rgba(255,255,255,0.7)", minWidth: 80 }}>
        {label}
      </span>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${barPct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg,#6366f1,#818cf8)" }}
        />
      </div>
      <span className="text-sm font-medium flex-shrink-0" style={{ color: "rgba(255,255,255,0.5)", minWidth: 36, textAlign: "right" }}>
        {pct != null ? `${pct}%` : count}
      </span>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, iconBg }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-5 flex items-center gap-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg }}>
        <Icon size={18} style={{ color: "#fff" }} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
          {label}
        </span>
        <span className="text-3xl font-bold" style={{ color: "#fff", lineHeight: 1.1 }}>
          {value}
        </span>
        {sub && <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{sub}</span>}
      </div>
    </motion.div>
  );
}

// ── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ title, children, className = "" }) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: "rgba(255,255,255,0.7)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Traffic Tab ───────────────────────────────────────────────────────────────
function TrafficTab({ token }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/analytics/traffic`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `${res.status}`);
      }
      setData(await res.json());
      setLastUpdate(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const k = data?.kpis ?? {};
  const topPages    = data?.topPages ?? [];
  const devices     = data?.devices  ?? [];
  const browsers    = data?.browsers ?? [];
  const countries   = data?.countries ?? [];
  const recentVisits= data?.recentVisits ?? [];
  const hourly      = data?.hourlyViews ?? [];

  const maxPage = Math.max(...topPages.map(p => p.count), 1);

  return (
    <div className="flex flex-col gap-0" style={{ background: "#0a0a0f", minHeight: "100%" }}>
      {/* ── Sub-header ── */}
      <div className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            {lastUpdate ? `Updated ${timeAgo(lastUpdate.toISOString())}` : "Loading…"}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: "#6366f1", color: "#fff", opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl flex items-center gap-2 text-xs"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className="p-6 flex flex-col gap-5">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Eye}        label="Total Page Views" value={fmt(k.totalViews)}     sub="All time"            iconBg="rgba(99,102,241,0.25)" />
          <KpiCard icon={TrendingUp} label="Today"            value={fmt(k.todayViews)}     sub="Last 24 hours"       iconBg="rgba(34,197,94,0.2)"  />
          <KpiCard icon={Activity}   label="This Week"        value={fmt(k.weekViews)}       sub="Last 7 days"         iconBg="rgba(245,158,11,0.2)" />
          <KpiCard icon={Users}      label="Unique Visitors"  value={fmt(k.uniqueVisitors)} sub="By session, 7 days"  iconBg="rgba(14,165,233,0.2)" />
        </div>

        {/* ── Chart Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Bar Chart */}
          <SectionCard title="Page Views — Last 24 Hours" className="lg:col-span-3">
            {hourly.length > 0
              ? <HourBarChart data={hourly} />
              : <div className="h-40 flex items-center justify-center text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>No data yet — visit some pages first.</div>
            }
          </SectionCard>

          {/* Top Pages */}
          <SectionCard title="Top Pages" className="lg:col-span-2">
            {topPages.length === 0 ? (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>No page visits recorded yet.</p>
            ) : topPages.map((p, i) => (
              <div key={p.path} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.25)", minWidth: 16 }}>#{i + 1}</span>
                <span className="text-sm flex-1 truncate font-mono" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>{p.path}</span>
                <div className="w-20 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(p.count / maxPage) * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg,#6366f1,#818cf8)" }}
                  />
                </div>
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: "rgba(255,255,255,0.5)", minWidth: 20, textAlign: "right" }}>{p.count}</span>
              </div>
            ))}
          </SectionCard>
        </div>

        {/* ── Devices + Countries ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Devices */}
          <SectionCard title="Devices" className="lg:col-span-3">
            {devices.length === 0 ? (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>No data yet.</p>
            ) : devices.map((d) => (
              <BarRow key={d.device} label={d.device} count={d.count} pct={d.pct}
                icon={DEVICE_ICON[d.device] || Monitor} />
            ))}
            {/* Browsers */}
            {browsers.length > 0 && (
              <>
                <p className="text-xs font-semibold mt-5 mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Browsers</p>
                {browsers.map((b) => (
                  <BarRow key={b.browser} label={b.browser} count={b.count} pct={b.pct}
                    icon={Chrome} />
                ))}
              </>
            )}
          </SectionCard>

          {/* Top Countries */}
          <SectionCard title="Top Countries" className="lg:col-span-2">
            {countries.length === 0 ? (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Geo data resolves async — check back shortly.</p>
            ) : countries.map((c) => (
              <div key={c.country} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="text-base flex-shrink-0" style={{ lineHeight: 1 }}>{COUNTRY_FLAG(c.country)}</span>
                <span className="text-sm flex-1" style={{ color: "rgba(255,255,255,0.65)" }}>{c.country}</span>
                <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>{c.count} views</span>
              </div>
            ))}
          </SectionCard>
        </div>

        {/* ── Recent Visits ── */}
        <SectionCard title="Recent Visits">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["PAGE", "DEVICE", "COUNTRY", "CITY", "REFERRER", "WHEN"].map(h => (
                    <th key={h} className="text-left py-2 pr-6 font-semibold tracking-wider"
                      style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentVisits.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center" style={{ color: "rgba(255,255,255,0.25)" }}>No visits recorded yet.</td></tr>
                ) : recentVisits.map((v, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td className="py-2.5 pr-6 font-mono" style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{v.path}</td>
                    <td className="py-2.5 pr-6" style={{ color: "rgba(255,255,255,0.55)" }}>{v.device}</td>
                    <td className="py-2.5 pr-6" style={{ color: "rgba(255,255,255,0.55)" }}>{v.country}</td>
                    <td className="py-2.5 pr-6" style={{ color: "rgba(255,255,255,0.4)" }}>{v.city || "—"}</td>
                    <td className="py-2.5 pr-6" style={{ color: v.referrer === "Direct" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.55)" }}>
                      {v.referrer}
                    </td>
                    <td className="py-2.5 whitespace-nowrap" style={{ color: "rgba(255,255,255,0.35)" }}>
                      🕐 {timeAgo(v.when)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ── Platform Tab (App Metrics) ────────────────────────────────────────────────
function PlatformTab({ token }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [days, setDays]       = useState(30);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/analytics?days=${days}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [days, token]);

  useEffect(() => { load(); }, [load]);

  const o   = data?.overview        ?? {};
  const lg  = data?.leadGeneration  ?? {};
  const ls  = data?.leadScoring     ?? {};
  const out = data?.outreach        ?? {};
  const crm = data?.crm             ?? {};
  const soc = data?.social          ?? {};

  const rows = [
    { icon: Building2, label: "Companies",      val: fmt(o.totalCompanies),        color: "#22d3ee" },
    { icon: Mail,      label: "Contacts",       val: fmt(o.totalContacts),         color: "#a78bfa" },
    { icon: Target,    label: "Gen. Leads",     val: fmt(o.totalGeneratedLeads),   color: "#f59e0b" },
    { icon: MapPin,    label: "Places",         val: fmt(o.totalPlaces),           color: "#10b981" },
    { icon: Mail,      label: "Outreach Sent",  val: fmt(out.sent),                color: "#22d3ee" },
    { icon: Activity,  label: "Reply Rate",     val: out.replyRate ?? "—",         color: "#E23744" },
    { icon: Briefcase, label: "Total Deals",    val: fmt(crm.deals?.total),        color: "#10b981" },
    { icon: Briefcase, label: "Won Deals",      val: fmt(crm.deals?.won),          color: "#10b981" },
    { icon: Share2,    label: "Social Posts",   val: fmt(soc.total),               color: "#a78bfa" },
    { icon: Share2,    label: "Published",      val: fmt(soc.published),           color: "#10b981" },
    { icon: UserCog,   label: "Employees",      val: fmt(data?.hr?.employees),     color: "#22d3ee" },
    { icon: Calculator,label: "Vouchers",       val: fmt(data?.accounting?.vouchers), color: "#f59e0b" },
    { icon: Package,   label: "Stock Items",    val: fmt(data?.inventory?.stockItems), color: "#10b981" },
    { icon: Package,   label: "Orders",         val: fmt(data?.inventory?.orders),    color: "#f59e0b" },
  ];

  return (
    <div className="p-6 flex flex-col gap-5" style={{ background: "#0a0a0f", minHeight: "100%" }}>
      {/* Window picker + refresh */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{ background: days === d ? "#6366f1" : "transparent", color: days === d ? "#fff" : "rgba(255,255,255,0.4)" }}>
              {d}d
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl flex items-center gap-2 text-xs"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {rows.map((r) => (
          <motion.div key={r.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-1.5">
              <r.icon size={12} style={{ color: r.color }} />
              <span className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>{r.label}</span>
            </div>
            <span className="text-xl font-bold" style={{ color: "#fff" }}>{r.val}</span>
          </motion.div>
        ))}
      </div>

      {/* Lead scoring */}
      <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-xs font-semibold mb-4 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Lead Scoring</p>
        <div className="flex gap-6">
          {[
            { label: "High",   val: ls.high,   color: "#f43f5e" },
            { label: "Medium", val: ls.medium, color: "#f59e0b" },
            { label: "Low",    val: ls.low,    color: "#10b981" },
          ].map(s => (
            <div key={s.label} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
              </div>
              <span className="text-2xl font-bold" style={{ color: s.color }}>{fmt(s.val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 403 Wall ──────────────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ background: "#0a0a0f" }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <Lock size={28} style={{ color: "#f87171" }} />
      </div>
      <h2 className="text-xl font-bold" style={{ color: "#fff" }}>Access Restricted</h2>
      <p className="text-sm text-center max-w-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
        This section is only accessible to the application owner.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminAnalyticsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
  const [tab, setTab] = useState("traffic");

  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="flex flex-col h-full" style={{ background: "#0a0a0f" }}>

      {/* ── Top header ── */}
      <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          <Activity size={18} style={{ color: "#6366f1" }} />
          <div>
            <h1 className="text-base font-bold" style={{ color: "#fff" }}>Analytics Dashboard</h1>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              Leader AI — Website traffic &amp; application activity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          {[
            { id: "traffic",  label: "Traffic" },
            { id: "platform", label: "Platform" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: tab === t.id ? "#6366f1" : "rgba(255,255,255,0.05)",
                color: tab === t.id ? "#fff" : "rgba(255,255,255,0.4)",
                border: "1px solid " + (tab === t.id ? "#6366f1" : "rgba(255,255,255,0.08)"),
              }}>
              {t.label}
            </button>
          ))}

          <div className="w-px h-5 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#818cf8" }}>
            <ShieldCheck size={11} /> Owner
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }} className="h-full">
            {tab === "traffic"
              ? <TrafficTab  token={token} />
              : <PlatformTab token={token} />
            }
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
