/**
 * Admin Analytics — /app/admin
 *
 * TRAFFIC tab features:
 *  🟢 Live visitors counter (auto-refresh every 30s)
 *  📊 8 KPI cards incl. bounce rate, pages/session, avg duration
 *  📈 30-day smooth area trend chart
 *  🔥 Traffic heatmap (day × hour GitHub-style)
 *  📄 Top pages | 🔗 Top referrers | 🚪 Entry pages
 *  🌍 Countries | 💻 Devices + Browsers | 🏷️ UTM campaigns
 *  📋 Recent visits table with duration + entry badge
 *
 * PLATFORM tab — app-level metrics.
 * Locked to ADMIN_EMAIL — everyone else gets a lock screen.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import {
  Eye, TrendingUp, Activity, Users, RefreshCw, AlertCircle,
  Lock, ShieldCheck, Monitor, Smartphone, Tablet, Globe,
  Chrome, Share2, ExternalLink, ArrowRight,
  Building2, Mail, Target, Briefcase, UserCog, Calculator, Package, MapPin,
} from "lucide-react";

const API_BASE    = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const ADMIN_EMAIL = "akshatv00001@gmail.com";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function pct(n) { return `${n ?? 0}%`; }
function duration(s) {
  if (!s) return "0s";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60_000)     return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000)  return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}
function countryFlag(cc = "") {
  if (!cc || cc.length !== 2) return "🌐";
  return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}
const DEVICE_ICON = { Desktop: Monitor, Mobile: Smartphone, Tablet };

// ─────────────────────────────────────────────────────────────────────────────
// 30-day smooth area chart
// ─────────────────────────────────────────────────────────────────────────────
function AreaChart({ data = [] }) {
  if (!data.length) return <div style={{ height: 100 }} />;
  const W = 600, H = 90;
  const counts = data.map(d => d.count);
  const max = Math.max(...counts, 1);

  const pts = counts.map((c, i) => ({
    x: (i / Math.max(counts.length - 1, 1)) * W,
    y: H - (c / max) * (H - 8) - 4,
  }));

  // Smooth cubic bezier path
  const linePath = pts.reduce((p, pt, i) => {
    if (i === 0) return `M${pt.x},${pt.y}`;
    const prev = pts[i - 1];
    const cx = prev.x + (pt.x - prev.x) / 2;
    return `${p} C${cx},${prev.y} ${cx},${pt.y} ${pt.x},${pt.y}`;
  }, "");

  const areaPath = `${linePath} L${W},${H} L0,${H}Z`;

  // Label every 5th day
  const labelIdx = [0, 4, 9, 14, 19, 24, 29].filter(i => i < data.length);

  return (
    <div className="w-full">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaG)" />
        <path d={linePath} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
        {pts.map((pt, i) => counts[i] > 0 && (
          <circle key={i} cx={pt.x} cy={pt.y} r="2.5" fill="#818cf8" opacity="0.7" />
        ))}
      </svg>
      {/* X labels */}
      <div className="relative" style={{ height: 16 }}>
        {labelIdx.map(i => {
          const left = (i / Math.max(data.length - 1, 1)) * 100;
          return (
            <span key={i} className="absolute text-[10px] -translate-x-1/2"
              style={{ left: `${left}%`, color: "rgba(255,255,255,0.3)" }}>
              {data[i].date.slice(5)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 24-hour bar chart
// ─────────────────────────────────────────────────────────────────────────────
function HourBarChart({ data = [] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const labelAt = [0, 4, 8, 12, 16, 20];
  return (
    <div>
      <div className="flex items-end gap-px" style={{ height: 120 }}>
        {data.map((d, i) => (
          <motion.div key={i} initial={{ height: 0 }}
            animate={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 2 : 0)}%` }}
            transition={{ duration: 0.5, delay: i * 0.008, ease: "easeOut" }}
            title={`${String(d.hour).padStart(2, "0")}:00 — ${d.count} views`}
            className="flex-1 rounded-sm cursor-default"
            style={{
              background: d.count > 0 ? "linear-gradient(to top,#6366f1,#a5b4fc)" : "rgba(255,255,255,0.04)",
              minHeight: d.count > 0 ? 2 : 1,
            }}
          />
        ))}
      </div>
      <div className="flex mt-1" style={{ height: 16 }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex justify-center">
            {labelAt.includes(i) && (
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                {String(d.hour).padStart(2, "0")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Traffic heatmap  (7 days × 24 hours)
// ─────────────────────────────────────────────────────────────────────────────
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TrafficHeatmap({ data = [] }) {
  // data: 7-row × 24-col 2D array
  const all = data.flat();
  const max = Math.max(...all, 1);

  return (
    <div>
      <div className="flex gap-2">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 flex-shrink-0 justify-around" style={{ paddingTop: 2, paddingBottom: 2 }}>
          {DAY_LABELS.map(d => (
            <span key={d} className="text-[10px] text-right" style={{ color: "rgba(255,255,255,0.3)", lineHeight: "14px" }}>
              {d}
            </span>
          ))}
        </div>
        {/* Grid */}
        <div className="flex-1 flex flex-col gap-0.5">
          {data.map((row, day) => (
            <div key={day} className="flex gap-0.5">
              {row.map((count, hour) => {
                const intensity = count > 0 ? 0.12 + (count / max) * 0.88 : 0;
                return (
                  <div key={hour}
                    title={`${DAY_LABELS[day]} ${String(hour).padStart(2,"0")}:00 — ${count} view${count !== 1 ? "s" : ""}`}
                    className="flex-1 cursor-default rounded-[2px] transition-opacity hover:opacity-80"
                    style={{
                      height: 14,
                      background: count > 0
                        ? `rgba(99,102,241,${intensity})`
                        : "rgba(255,255,255,0.03)",
                    }}
                  />
                );
              })}
            </div>
          ))}
          {/* Hour labels */}
          <div className="flex gap-0.5 mt-1">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 flex justify-center">
                {h % 6 === 0 && (
                  <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {String(h).padStart(2, "0")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>Less</span>
        {[0.05, 0.2, 0.4, 0.65, 0.9].map(op => (
          <div key={op} className="w-3 h-3 rounded-sm" style={{ background: `rgba(99,102,241,${op})` }} />
        ))}
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>More</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar row
// ─────────────────────────────────────────────────────────────────────────────
function BarRow({ label, count, maxVal, sub, icon: Icon }) {
  const barPct = maxVal > 0 ? (count / maxVal) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {Icon && <Icon size={12} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />}
      <span className="text-[13px] truncate" style={{ color: "rgba(255,255,255,0.7)", minWidth: 60, maxWidth: 120 }}>
        {label}
      </span>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${barPct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#6366f1,#a5b4fc)" }} />
      </div>
      <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: "rgba(255,255,255,0.45)", minWidth: 28, textAlign: "right" }}>
        {sub ?? count}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, iconBg, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-4 flex items-center gap-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg }}>
        <Icon size={16} style={{ color: "#fff" }} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest font-semibold"
          style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
        <p className="text-2xl font-bold leading-tight" style={{ color: "#fff" }}>{value}</p>
        {sub && <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section card
// ─────────────────────────────────────────────────────────────────────────────
function Card({ title, titleRight, children, className = "" }) {
  return (
    <div className={`rounded-xl p-5 ${className}`}
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>{title}</h3>
        {titleRight && <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{titleRight}</span>}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live badge (auto-polls /analytics/live every 30s)
// ─────────────────────────────────────────────────────────────────────────────
function LiveBadge({ token }) {
  const [live, setLive] = useState(null);
  const timerRef = useRef(null);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/analytics/live`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const d = await res.json();
        setLive(d.live);
      }
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => {
    fetchLive();
    timerRef.current = setInterval(fetchLive, 30_000);
    return () => clearInterval(timerRef.current);
  }, [fetchLive]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
      style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ background: "#22c55e" }} />
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#22c55e" }} />
      </span>
      <span className="text-[12px] font-semibold" style={{ color: "#4ade80" }}>
        {live == null ? "—" : live} live now
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Traffic Tab
// ─────────────────────────────────────────────────────────────────────────────
function TrafficTab({ token }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [chartMode, setChartMode]   = useState("30d"); // "24h" | "30d"

  const load = useCallback(async () => {
    setLoading(true); setError(null);
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
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const k            = data?.kpis          ?? {};
  const hourly       = data?.hourlyViews   ?? [];
  const daily30      = data?.daily30        ?? [];
  const heatmap      = data?.heatmap        ?? Array.from({ length: 7 }, () => Array(24).fill(0));
  const topPages     = data?.topPages       ?? [];
  const topReferrers = data?.topReferrers   ?? [];
  const entryPages   = data?.entryPages     ?? [];
  const utmCampaigns = data?.utmCampaigns   ?? [];
  const devices      = data?.devices        ?? [];
  const browsers     = data?.browsers       ?? [];
  const countries    = data?.countries      ?? [];
  const recentVisits = data?.recentVisits   ?? [];

  const maxPage    = Math.max(...topPages.map(p => p.count), 1);
  const maxRef     = Math.max(...topReferrers.map(r => r.count), 1);
  const maxEntry   = Math.max(...entryPages.map(e => e.count), 1);
  const maxCountry = Math.max(...countries.map(c => c.count), 1);

  return (
    <div style={{ background: "#080810", minHeight: "100%" }}>
      {/* Sub-bar */}
      <div className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <LiveBadge token={token} />
          {lastUpdate && (
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              Updated {timeAgo(lastUpdate.toISOString())}
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: "#6366f1", color: "#fff", opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl flex items-center gap-2 text-xs"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className="p-6 flex flex-col gap-5">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard delay={0}    icon={Eye}        label="Total Page Views"   value={fmt(k.totalViews)}         sub="All time"             iconBg="rgba(99,102,241,0.22)" />
          <KpiCard delay={0.04} icon={TrendingUp} label="Today"              value={fmt(k.todayViews)}         sub="Last 24 hours"        iconBg="rgba(34,197,94,0.18)"  />
          <KpiCard delay={0.08} icon={Activity}   label="This Week"          value={fmt(k.weekViews)}           sub="Last 7 days"          iconBg="rgba(245,158,11,0.18)" />
          <KpiCard delay={0.12} icon={Users}      label="Unique Visitors"    value={fmt(k.uniqueVisitors)}     sub="By session, 7 days"   iconBg="rgba(14,165,233,0.18)" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard delay={0.16} icon={ArrowRight} label="Bounce Rate"        value={pct(k.bounceRate)}         sub="Single-page sessions" iconBg="rgba(239,68,68,0.18)"  />
          <KpiCard delay={0.20} icon={Globe}      label="Pages / Session"    value={`${k.avgPagesPerSession ?? 0}` }  sub="Avg depth"      iconBg="rgba(139,92,246,0.2)"  />
          <KpiCard delay={0.24} icon={Activity}   label="Avg. Duration"      value={duration(k.avgDurationSecs)} sub="Per page"           iconBg="rgba(20,184,166,0.2)"  />
          <KpiCard delay={0.28} icon={Users}      label="Sessions"           value={fmt(k.uniqueVisitors)}     sub="7-day window"         iconBg="rgba(99,102,241,0.14)" />
        </div>

        {/* ── Main chart + top pages ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3" title={chartMode === "30d" ? "Page Views — Last 30 Days" : "Page Views — Last 24 Hours"}
            titleRight={
              <div className="flex gap-1">
                {["30d","24h"].map(m => (
                  <button key={m} onClick={() => setChartMode(m)}
                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: chartMode === m ? "#6366f1" : "rgba(255,255,255,0.06)", color: chartMode === m ? "#fff" : "rgba(255,255,255,0.4)" }}>
                    {m}
                  </button>
                ))}
              </div>
            }>
            {chartMode === "30d"
              ? <AreaChart data={daily30} />
              : <HourBarChart data={hourly} />
            }
          </Card>

          <Card className="lg:col-span-2" title="Top Pages" titleRight="7 days">
            {topPages.length === 0
              ? <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>No data yet.</p>
              : topPages.map((p, i) => (
                <div key={p.path} className="flex items-center gap-2 py-2"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span className="text-[11px] font-bold w-4 flex-shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>
                    #{i + 1}
                  </span>
                  <span className="text-[12px] flex-1 truncate font-mono" style={{ color: "rgba(255,255,255,0.65)" }}>
                    {p.path}
                  </span>
                  <div className="w-16 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(p.count / maxPage) * 100}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#6366f1,#a5b4fc)" }} />
                  </div>
                  <span className="text-[11px] font-semibold w-5 text-right flex-shrink-0"
                    style={{ color: "rgba(255,255,255,0.4)" }}>{p.count}</span>
                </div>
              ))}
          </Card>
        </div>

        {/* ── Traffic Heatmap ── */}
        <Card title="Traffic Heatmap" titleRight="Day × Hour — Last 30 Days">
          <TrafficHeatmap data={heatmap.length ? heatmap : Array.from({ length: 7 }, () => Array(24).fill(0))} />
        </Card>

        {/* ── Referrers + Entry Pages + UTM ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Top Referrers" titleRight="7 days">
            {topReferrers.length === 0
              ? <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>No referral traffic yet.</p>
              : topReferrers.map(r => (
                <BarRow key={r.referrer} label={r.referrer} count={r.count} maxVal={maxRef}
                  icon={ExternalLink} />
              ))}
          </Card>

          <Card title="Entry Pages" titleRight="Landing pages">
            {entryPages.length === 0
              ? <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>No entry data yet.</p>
              : entryPages.map(e => (
                <BarRow key={e.path} label={e.path} count={e.count} maxVal={maxEntry} icon={Globe} />
              ))}
          </Card>

          <Card title="UTM Campaigns" titleRight="Source / Campaign">
            {utmCampaigns.length === 0 ? (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                No UTM data. Add <code className="text-[11px]">?utm_campaign=</code> to your links.
              </p>
            ) : utmCampaigns.map((u, i) => (
              <div key={i} className="py-2 flex flex-col gap-0.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {u.campaign}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {u.source} · {u.medium}
                  </span>
                  <span className="ml-auto text-[11px] font-semibold" style={{ color: "#818cf8" }}>{u.count}</span>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* ── Devices + Countries ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3" title="Devices & Browsers">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Device</p>
                {devices.map(d => (
                  <BarRow key={d.device} label={d.device} count={d.count}
                    maxVal={Math.max(...devices.map(x => x.count), 1)}
                    sub={`${d.pct}%`} icon={DEVICE_ICON[d.device] || Monitor} />
                ))}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Browser</p>
                {browsers.map(b => (
                  <BarRow key={b.browser} label={b.browser} count={b.count}
                    maxVal={Math.max(...browsers.map(x => x.count), 1)}
                    sub={`${b.pct}%`} icon={Chrome} />
                ))}
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2" title="Top Countries" titleRight="7 days">
            {countries.length === 0
              ? <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>Geo resolves async — check back shortly.</p>
              : countries.map(c => (
                <div key={c.country} className="flex items-center gap-3 py-2.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span className="text-[16px] flex-shrink-0">{countryFlag(c.country)}</span>
                  <span className="text-[13px] flex-1" style={{ color: "rgba(255,255,255,0.65)" }}>{c.country}</span>
                  <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(c.count / maxCountry) * 100}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full" style={{ background: "#6366f1" }} />
                  </div>
                  <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {c.count}
                  </span>
                </div>
              ))}
          </Card>
        </div>

        {/* ── Recent Visits ── */}
        <Card title="Recent Visits" titleRight="Last 25">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["PAGE","DEVICE","COUNTRY","CITY","REFERRER","DURATION","WHEN"].map(h => (
                    <th key={h} className="text-left py-2 pr-5 font-semibold tracking-wider"
                      style={{ color: "rgba(255,255,255,0.28)", fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentVisits.length === 0 ? (
                  <tr><td colSpan={7} className="py-6 text-center text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                    No visits yet.
                  </td></tr>
                ) : recentVisits.map((v, i) => (
                  <tr key={i} className="transition-colors hover:bg-white/[0.02]"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td className="py-2.5 pr-5">
                      <div className="flex items-center gap-1.5">
                        {v.isEntry && (
                          <span className="text-[8px] px-1 rounded font-bold uppercase"
                            style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}>entry</span>
                        )}
                        <span className="font-mono truncate max-w-[120px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                          {v.path}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-5" style={{ color: "rgba(255,255,255,0.5)" }}>{v.device}</td>
                    <td className="py-2.5 pr-5" style={{ color: "rgba(255,255,255,0.5)" }}>{v.country}</td>
                    <td className="py-2.5 pr-5" style={{ color: "rgba(255,255,255,0.35)" }}>{v.city || "—"}</td>
                    <td className="py-2.5 pr-5"
                      style={{ color: v.referrer === "Direct" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.5)" }}>
                      {v.referrer}
                    </td>
                    <td className="py-2.5 pr-5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {v.duration ? duration(v.duration) : "—"}
                    </td>
                    <td className="py-2.5 whitespace-nowrap" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {timeAgo(v.when)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Tab
// ─────────────────────────────────────────────────────────────────────────────
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

  const o   = data?.overview       ?? {};
  const ls  = data?.leadScoring    ?? {};
  const out = data?.outreach       ?? {};
  const crm = data?.crm            ?? {};
  const soc = data?.social         ?? {};

  const kpis = [
    { icon: Building2,  label: "Companies",     val: fmt(o.totalCompanies),       color: "#22d3ee" },
    { icon: Mail,       label: "Contacts",      val: fmt(o.totalContacts),        color: "#a78bfa" },
    { icon: Target,     label: "Gen. Leads",    val: fmt(o.totalGeneratedLeads),  color: "#f59e0b" },
    { icon: MapPin,     label: "Places",        val: fmt(o.totalPlaces),          color: "#10b981" },
    { icon: Mail,       label: "Sent",          val: fmt(out.sent),               color: "#22d3ee" },
    { icon: Activity,   label: "Reply Rate",    val: out.replyRate ?? "—",        color: "#E23744" },
    { icon: Briefcase,  label: "Deals Won",     val: fmt(crm.deals?.won),         color: "#10b981" },
    { icon: Share2,     label: "Published",     val: fmt(soc.published),          color: "#a78bfa" },
    { icon: UserCog,    label: "Employees",     val: fmt(data?.hr?.employees),    color: "#22d3ee" },
    { icon: Calculator, label: "Vouchers",      val: fmt(data?.accounting?.vouchers), color: "#f59e0b" },
    { icon: Package,    label: "Stock Items",   val: fmt(data?.inventory?.stockItems), color: "#10b981" },
    { icon: Package,    label: "Orders",        val: fmt(data?.inventory?.orders), color: "#f59e0b" },
  ];

  return (
    <div className="p-6 flex flex-col gap-5" style={{ background: "#080810", minHeight: "100%" }}>
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {[7,14,30,90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{ background: days === d ? "#6366f1" : "transparent", color: days === d ? "#fff" : "rgba(255,255,255,0.4)" }}>
              {d}d
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl flex items-center gap-2 text-xs"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-1.5">
              <k.icon size={11} style={{ color: k.color }} />
              <span className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.32)" }}>{k.label}</span>
            </div>
            <span className="text-xl font-bold" style={{ color: k.color }}>{k.val}</span>
          </motion.div>
        ))}
      </div>

      {/* Lead scoring */}
      <Card title="Lead Priority Distribution">
        <div className="flex gap-8">
          {[
            { label: "High Priority",   val: ls.high,   color: "#f43f5e", bg: "rgba(244,63,94,0.12)"  },
            { label: "Medium Priority", val: ls.medium, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
            { label: "Low Priority",    val: ls.low,    color: "#10b981", bg: "rgba(16,185,129,0.12)" },
          ].map(s => (
            <div key={s.label} className="flex flex-col gap-2 flex-1 rounded-xl p-4"
              style={{ background: s.bg, border: `1px solid ${s.color}25` }}>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
              <span className="text-3xl font-bold" style={{ color: s.color }}>{fmt(s.val)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 403 wall
// ─────────────────────────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ background: "#080810" }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.18)" }}>
        <Lock size={28} style={{ color: "#f87171" }} />
      </div>
      <h2 className="text-xl font-bold" style={{ color: "#fff" }}>Access Restricted</h2>
      <p className="text-sm text-center max-w-xs" style={{ color: "rgba(255,255,255,0.38)" }}>
        This section is only accessible to the application owner.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminAnalyticsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
  const [tab, setTab] = useState("traffic");

  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#080810" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          <Activity size={16} style={{ color: "#818cf8" }} />
          <div>
            <h1 className="text-[15px] font-bold" style={{ color: "#fff" }}>Analytics Dashboard</h1>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.32)" }}>
              Doott AI — Website traffic &amp; application metrics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[{ id:"traffic", label:"Traffic" }, { id:"platform", label:"Platform" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: tab === t.id ? "#6366f1" : "rgba(255,255,255,0.05)",
                color:      tab === t.id ? "#fff"    : "rgba(255,255,255,0.4)",
                border:     `1px solid ${tab === t.id ? "#6366f1" : "rgba(255,255,255,0.08)"}`,
              }}>
              {t.label}
            </button>
          ))}
          <div className="w-px h-5 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px]"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.22)", color: "#818cf8" }}>
            <ShieldCheck size={10} /> Owner
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}>
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
