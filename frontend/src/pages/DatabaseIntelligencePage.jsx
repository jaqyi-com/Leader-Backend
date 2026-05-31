import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Map, BarChart3, Brain, Loader2, Sparkles, Target,
  Phone, Globe, Mail, Linkedin, TrendingUp, Building2,
  Users, DollarSign, Send, X, Zap, CheckCircle2
} from "lucide-react";
import { ibGetMap, ibGetMarketIntel, ibIdealCustomer, ibLaunchCampaign } from "../api";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

// ── State data ─────────────────────────────────────────────────────────
const STATE_ABBR = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",
  KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
  MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
  NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",
  NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
  OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
  DC:"Washington DC"
};

// [col, row] — 0-indexed on a 12×8 virtual grid
const TILE_GRID = {
  AK:[0,0],                                                                                              ME:[11,0],
  WA:[1,1], MT:[3,1], ND:[4,1], MN:[5,1],            MI:[7,1], NY:[8,1], VT:[9,1], NH:[10,1],
  OR:[1,2], ID:[2,2], WY:[3,2], SD:[4,2], WI:[5,2],  IN:[6,2], OH:[7,2], PA:[8,2], MA:[9,2],  RI:[10,2],
  CA:[1,3], NV:[2,3], CO:[3,3], NE:[4,3], IA:[5,3], IL:[6,3], KY:[7,3], WV:[8,3], VA:[9,3],  NJ:[10,3], CT:[11,3],
            AZ:[2,4], UT:[3,4], KS:[4,4], MO:[5,4], TN:[6,4], NC:[7,4], MD:[8,4], DE:[9,4],
            NM:[2,5],           OK:[4,5], AR:[5,5], MS:[6,5], AL:[7,5], GA:[8,5], SC:[9,5],
                                TX:[4,6], LA:[5,6],                     FL:[8,6],
  HI:[1,7],
};

// Color based on density 0→1
function tileColor(t) {
  if (t <= 0) return "rgba(99,102,241,0.07)";
  const r = Math.round(109 + (60  - 109) * t);
  const g = Math.round(40  + (20  - 40)  * t);
  const b = Math.round(217 + (200 - 217) * t);
  const a = 0.18 + t * 0.75;
  return `rgba(${r},${g},${b},${a})`;
}

// ── US Tile Grid Map ────────────────────────────────────────────────────
function USTileMap({ stateCount, maxCount, onHover }) {
  const COLS = 12, ROWS = 8;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${COLS}, 1fr)`,
      gridTemplateRows:    `repeat(${ROWS}, 44px)`,
      gap: "3px",
      width: "100%",
    }}>
      {Object.entries(TILE_GRID).map(([abbr, [col, row]]) => {
        const count = stateCount[abbr] || 0;
        const t = maxCount > 0 ? Math.min(count / maxCount, 1) : 0;
        const bg = tileColor(t);
        return (
          <motion.div
            key={abbr}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: (col + row * 0.3) * 0.015 }}
            style={{
              gridColumn: col + 1,
              gridRow:    row + 1,
              background: bg,
              border: `1px solid rgba(99,102,241,${0.15 + t * 0.3})`,
              borderRadius: 6,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            whileHover={{ scale: 1.12, zIndex: 10, boxShadow: "0 4px 20px rgba(99,102,241,0.35)" }}
            onMouseEnter={() => onHover({ abbr, name: STATE_ABBR[abbr] || abbr, count })}
            onMouseLeave={() => onHover(null)}
          >
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: t > 0.5 ? "#fff" : "rgba(180,180,255,0.9)",
              letterSpacing: "0.03em",
              lineHeight: 1,
            }}>{abbr}</span>
            {count > 0 && (
              <span style={{
                fontSize: 8,
                color: t > 0.5 ? "rgba(255,255,255,0.75)" : "rgba(140,140,200,0.7)",
                marginTop: 2,
                lineHeight: 1,
              }}>{count >= 1000 ? `${Math.round(count/1000)}k` : count}</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Horizontal bar chart ─────────────────────────────────────────────
function HBar({ label, value, max, color = "#6366f1" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-[var(--text-2)] flex-shrink-0" title={label}>{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full" style={{ background: color }} />
      </div>
      <span className="w-12 text-right font-mono text-[var(--text-3)]">{value.toLocaleString()}</span>
    </div>
  );
}

// ── Coverage ring ─────────────────────────────────────────────────────
function CoverageRing({ pct, label, icon: Icon, color }) {
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="6" />
        <motion.circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDashoffset={circ * 0.25}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 1, ease: "easeOut" }} />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize="13" fontWeight="bold">{pct}%</text>
      </svg>
      <div className="flex items-center gap-1 text-[10px] text-[var(--text-3)]">
        <Icon size={10} style={{ color }} />{label}
      </div>
    </div>
  );
}

// ── Similarity badge ──────────────────────────────────────────────────
function SimBadge({ score }) {
  const n = Math.round(score || 0);
  const c = n >= 80 ? "#10b981" : n >= 60 ? "#f59e0b" : "#6b7280";
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: `${c}22`, color: c }}>
      <Target size={8} />{n}%
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB 1: Smart Market Map
// ═══════════════════════════════════════════════════════════════════════
function MarketMapTab() {
  const [category, setCategory] = useState("");
  const [mapData,  setMapData]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [tooltip,  setTooltip]  = useState(null);

  const fetchMap = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await ibGetMap({ category: category.trim(), limit: 20 });
      setMapData(data);
    } catch (e) {
      toast.error("Map load failed: " + (e.response?.data?.error || e.message));
    } finally { setLoading(false); }
  }, [category]);

  // Build count lookup from DB results (handles both abbr and full-name formats)
  const NAME_TO_ABBR = Object.fromEntries(Object.entries(STATE_ABBR).map(([a,n]) => [n, a]));
  const stateCount = {};
  let maxCount = 1;
  if (mapData?.byState) {
    mapData.byState.forEach(({ state, count }) => {
      const abbr = state?.length === 2 ? state.toUpperCase() : (NAME_TO_ABBR[state] || "");
      if (abbr) stateCount[abbr] = (stateCount[abbr] || 0) + count;
    });
    maxCount = Math.max(1, ...Object.values(stateCount));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <div className="card p-4" style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(168,85,247,0.06))" }}>
        <p className="text-xs text-[var(--text-3)] mb-3 flex items-center gap-1">
          <Map size={12} className="text-indigo-400" />
          Enter a business category to visualize geographic distribution across the US
        </p>
        <div className="flex gap-2">
          <input className="input flex-1 text-sm"
            placeholder='e.g. "restaurants", "dentists", "law firms", "auto repair"…'
            value={category}
            onChange={e => setCategory(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchMap()} />
          <button onClick={fetchMap} disabled={loading}
            className="btn-primary text-xs gap-1.5 px-5 whitespace-nowrap">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Map size={13} />}
            {loading ? "Loading…" : "Show Map"}
          </button>
        </div>
      </div>

      {/* Map card */}
      <div className="card p-5" style={{ minHeight: 400 }}>
        {!mapData && !loading && (
          <div className="flex flex-col items-center justify-center h-80 text-[var(--text-3)]">
            <Map size={48} className="mb-3 opacity-20" />
            <p className="text-sm">Enter a category above and click "Show Map"</p>
            <p className="text-xs mt-1 opacity-60">Powered by 742,000+ US business records</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-80">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
          </div>
        )}
        {mapData && !loading && (
          <div className="flex flex-col gap-4">
            {/* Meta */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">
                  {category ? `"${category}"` : "All Categories"} — US Business Density
                </p>
                <p className="text-[10px] text-[var(--text-3)] mt-0.5">
                  {mapData.byState?.reduce((s,r) => s + r.count, 0).toLocaleString()} businesses · {mapData.byState?.length} states
                </p>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-3)]">
                <span>Low</span>
                {[0.05,0.25,0.5,0.75,0.95].map((t,i) => (
                  <div key={i} className="w-5 h-3 rounded-sm" style={{ background: tileColor(t) }} />
                ))}
                <span>High</span>
              </div>
            </div>

            {/* Tile map */}
            <div className="relative">
              <USTileMap stateCount={stateCount} maxCount={maxCount} onHover={setTooltip} />
              {/* Tooltip */}
              <AnimatePresence>
                {tooltip && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mt-[-8px] pointer-events-none z-20
                               px-3 py-2 rounded-lg text-xs shadow-xl border border-[var(--border)]"
                    style={{ background: "var(--surface)", whiteSpace: "nowrap" }}>
                    <span className="font-semibold text-[var(--text)]">{tooltip.name}</span>
                    <span className="text-[var(--text-3)] ml-2">{tooltip.count.toLocaleString()} businesses</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Top Cities */}
      {mapData?.topCities?.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3 flex items-center gap-1">
            <TrendingUp size={12} className="text-indigo-400" /> Top Cities
          </p>
          <div className="flex flex-col gap-2">
            {mapData.topCities.map((c, i) => (
              <HBar key={i} label={`${c.city}, ${c.state || ""}`}
                value={c.count} max={mapData.topCities[0].count}
                color={`hsl(${240 + i * 10},70%,${62 - i * 2}%)`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB 2: AI Ideal Customer Profiler
// ═══════════════════════════════════════════════════════════════════════
function IdealCustomerTab() {
  const [description, setDescription] = useState("");
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [launching,   setLaunching]   = useState(false);
  const [selected,    setSelected]    = useState(new Set());
  const [showCampaign,setShowCampaign]= useState(false);
  const [campName,    setCampName]    = useState("");
  const navigate = useNavigate();

  const run = useCallback(async () => {
    if (!description.trim()) return;
    setLoading(true); setResult(null); setSelected(new Set());
    try {
      const { data } = await ibIdealCustomer({ description: description.trim(), limit: 20 });
      setResult(data);
    } catch (e) {
      toast.error("Profiler failed: " + (e.response?.data?.error || e.message));
    } finally { setLoading(false); }
  }, [description]);

  const toggleSelect = (idx) => setSelected(prev => {
    const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next;
  });

  const launchCampaign = async () => {
    if (!campName.trim()) { toast.error("Campaign name is required"); return; }
    const leads = [...selected].map(i => result.leads[i]);
    setLaunching(true);
    try {
      const { data } = await ibLaunchCampaign({ leads, campaignName: campName, channels: ["email"] });
      toast.success(`Campaign created with ${data.contactCount} contacts!`);
      setShowCampaign(false); setSelected(new Set());
      navigate("/app/outreach");
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    } finally { setLaunching(false); }
  };

  const EXAMPLES = [
    "Small law firms in Texas with 5–20 employees and a website",
    "Family-owned restaurants in California with a phone number",
    "Auto repair shops in Florida without a website",
    "Healthcare clinics in New York with email and LinkedIn",
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-5" style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.08),rgba(99,102,241,0.06))" }}>
        <div className="flex items-center gap-2 mb-3">
          <Brain size={16} className="text-purple-400" />
          <span className="text-sm font-semibold text-[var(--text)]">AI Ideal Customer Profiler</span>
          <span className="text-[10px] text-[var(--text-3)]">GPT-4o + pgvector</span>
        </div>
        <textarea className="input w-full text-sm resize-none" rows={3}
          placeholder='Describe your ideal customer in plain English…'
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), run())} />
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <div className="flex gap-1 flex-wrap">
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setDescription(ex)}
                className="text-[10px] px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors">
                {ex.slice(0, 38)}…
              </button>
            ))}
          </div>
          <button onClick={run} disabled={loading || !description.trim()}
            className="btn-primary text-xs gap-1.5 px-5 whitespace-nowrap flex-shrink-0">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {loading ? "Profiling…" : "Find Matches"}
          </button>
        </div>
      </div>

      {result?.profile?.profileSummary && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="card p-4 border border-purple-500/20"
          style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.07),transparent)" }}>
          <div className="flex items-start gap-2">
            <Sparkles size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">AI Profile Summary</p>
              <p className="text-sm text-[var(--text-2)]">{result.profile.profileSummary}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {result.profile.category   && <span className="badge badge-purple text-[9px]">Category: {result.profile.category}</span>}
                {result.profile.state      && <span className="badge badge-purple text-[9px]">State: {result.profile.state}</span>}
                {result.profile.has_phone   === "true" && <span className="badge text-[9px] bg-green-500/15 text-green-400">Has Phone ✓</span>}
                {result.profile.has_website === "true" && <span className="badge text-[9px] bg-blue-500/15 text-blue-400">Has Website ✓</span>}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {result?.leads?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <p className="text-sm font-semibold text-[var(--text)]">
              {result.leads.length} Matches
              {selected.size > 0 && <span className="ml-2 text-[10px] text-purple-400">· {selected.size} selected</span>}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set(result.leads.map((_, i) => i)))}
                className="btn-ghost text-[10px] gap-1"><CheckCircle2 size={10} />All</button>
              {selected.size > 0 && (
                <button onClick={() => setShowCampaign(true)}
                  className="btn-primary text-[10px] gap-1 px-3">
                  <Send size={10} />Launch ({selected.size})
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox"
                      checked={selected.size === result.leads.length}
                      onChange={() => selected.size === result.leads.length ? setSelected(new Set()) : setSelected(new Set(result.leads.map((_, i) => i)))} />
                  </th>
                  {["Match","Business","Category","Location","Contact","AI Insight"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-[var(--text-3)] font-semibold text-[10px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.leads.map((lead, i) => (
                  <motion.tr key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`border-b border-[var(--border)] transition-colors cursor-pointer ${selected.has(i) ? "bg-purple-500/5" : "hover:bg-[var(--surface-2)]"}`}
                    onClick={() => toggleSelect(i)}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} onClick={e => e.stopPropagation()} />
                    </td>
                    <td className="px-3 py-2.5"><SimBadge score={lead.similarity} /></td>
                    <td className="px-3 py-2.5"><p className="font-semibold text-[var(--text)]">{lead.name || "—"}</p></td>
                    <td className="px-3 py-2.5">{lead.category && <span className="badge badge-purple text-[9px]">{lead.category}</span>}</td>
                    <td className="px-3 py-2.5 text-[var(--text-3)]">{lead.city_file || lead.state || "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {lead.phone  && <Phone size={10} className="text-green-400" />}
                        {(lead.email || lead.company_email) && <Mail size={10} className="text-blue-400" />}
                        {lead.website && <Globe size={10} className="text-cyan-400" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      {result.explanations?.[String(i)]
                        ? <span className="text-[10px] italic text-purple-300">✦ {result.explanations[String(i)]}</span>
                        : <span className="text-[var(--text-3)]">—</span>}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showCampaign && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCampaign(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative z-10 card p-6 w-full max-w-md" style={{ background: "var(--surface)" }}>
              <h3 className="text-base font-bold text-[var(--text)] mb-1">🚀 Launch Outreach Campaign</h3>
              <p className="text-xs text-[var(--text-3)] mb-4">{selected.size} leads selected</p>
              <label className="text-xs font-semibold text-[var(--text-2)] block mb-1">Campaign Name</label>
              <input className="input w-full text-sm mb-4" placeholder="e.g. DB Outreach May 2026"
                value={campName} onChange={e => setCampName(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setShowCampaign(false)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={launchCampaign} disabled={launching} className="btn-primary flex-1 gap-1.5">
                  {launching ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {launching ? "Creating…" : "Create Campaign"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB 3: Market Intelligence Dashboard
// ═══════════════════════════════════════════════════════════════════════
function MarketIntelTab() {
  const [category, setCategory] = useState("");
  const [state,    setState]    = useState("");
  const [intel,    setIntel]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const fetchIntel = useCallback(async () => {
    if (!category.trim()) { toast.error("Enter a category first"); return; }
    setLoading(true); setIntel(null);
    try {
      const { data } = await ibGetMarketIntel({ category: category.trim(), state: state.trim() });
      setIntel(data);
    } catch (e) {
      toast.error("Failed: " + (e.response?.data?.error || e.message));
    } finally { setLoading(false); }
  }, [category, state]);

  const US_STATES = ["","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND",
    "OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

  const PRESETS = ["restaurants","dentists","law firms","auto repair","real estate","plumbers","electricians","gyms"];

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-4" style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(99,102,241,0.06))" }}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} className="text-emerald-400" />
          <span className="text-sm font-semibold text-[var(--text)]">Market Intelligence Report</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className="input flex-1 text-sm min-w-[180px]"
            placeholder='Category, e.g. "dentists", "law firms"…'
            value={category} onChange={e => setCategory(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchIntel()} />
          <select className="input text-sm" value={state} onChange={e => setState(e.target.value)}>
            <option value="">All States</option>
            {US_STATES.filter(Boolean).map(s => (
              <option key={s} value={s}>{s} — {STATE_ABBR[s]}</option>
            ))}
          </select>
          <button onClick={fetchIntel} disabled={loading}
            className="btn-primary text-xs gap-1.5 px-5 whitespace-nowrap">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <BarChart3 size={13} />}
            {loading ? "Analyzing…" : "Generate Report"}
          </button>
        </div>
        <div className="flex gap-1 flex-wrap mt-2">
          {PRESETS.map(p => (
            <button key={p} onClick={() => setCategory(p)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-emerald-400 mx-auto mb-3" />
            <p className="text-sm text-[var(--text-3)]">Querying 742,000+ records…</p>
          </div>
        </div>
      )}

      {intel && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Businesses", val: intel.total?.toLocaleString(),                        icon: Building2, color: "#6366f1" },
              { label: "With Phone",       val: intel.coverage.phone.count?.toLocaleString(),         icon: Phone,    color: "#10b981" },
              { label: "With Website",     val: intel.coverage.website.count?.toLocaleString(),       icon: Globe,    color: "#22d3ee" },
              { label: "With Email",       val: intel.coverage.email.count?.toLocaleString(),         icon: Mail,     color: "#f59e0b" },
            ].map(s => (
              <div key={s.label} className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}22` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-xl font-bold text-[var(--text)]">{s.val ?? "—"}</p>
                  <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wide">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-4 flex items-center gap-1">
              <Target size={12} className="text-indigo-400" /> Contact Coverage
            </p>
            <div className="flex gap-8 justify-center flex-wrap">
              <CoverageRing pct={intel.coverage.phone.pct}    label="Phone"    icon={Phone}    color="#10b981" />
              <CoverageRing pct={intel.coverage.website.pct}  label="Website"  icon={Globe}    color="#22d3ee" />
              <CoverageRing pct={intel.coverage.email.pct}    label="Email"    icon={Mail}     color="#f59e0b" />
              <CoverageRing pct={intel.coverage.linkedin.pct} label="LinkedIn" icon={Linkedin} color="#0ea5e9" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {intel.byState?.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3 flex items-center gap-1">
                  <Map size={12} className="text-indigo-400" /> By State
                </p>
                <div className="flex flex-col gap-2">
                  {intel.byState.map((s, i) => (
                    <HBar key={i} label={STATE_ABBR[s.state] || s.state || "Unknown"}
                      value={s.count} max={intel.byState[0].count}
                      color={`hsl(${240 + i * 8},65%,${60 - i}%)`} />
                  ))}
                </div>
              </div>
            )}
            {intel.topCities?.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3 flex items-center gap-1">
                  <TrendingUp size={12} className="text-emerald-400" /> Top Cities
                </p>
                <div className="flex flex-col gap-2">
                  {intel.topCities.map((c, i) => (
                    <HBar key={i} label={c.city || "Unknown"} value={c.count} max={intel.topCities[0].count}
                      color={`hsl(${160 + i * 10},60%,${50 - i}%)`} />
                  ))}
                </div>
              </div>
            )}
            {intel.revenue?.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3 flex items-center gap-1">
                  <DollarSign size={12} className="text-amber-400" /> Revenue Range
                </p>
                <div className="flex flex-col gap-2">
                  {intel.revenue.map((r, i) => (
                    <HBar key={i} label={r.range || "Unknown"} value={r.count} max={intel.revenue[0].count}
                      color={`hsl(${40 + i * 12},70%,${55 - i}%)`} />
                  ))}
                </div>
              </div>
            )}
            {intel.employees?.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3 flex items-center gap-1">
                  <Users size={12} className="text-cyan-400" /> Team Size
                </p>
                <div className="flex flex-col gap-2">
                  {intel.employees.map((e, i) => (
                    <HBar key={i} label={e.size || "Unknown"} value={e.count} max={intel.employees[0].count}
                      color={`hsl(${180 + i * 12},60%,${55 - i}%)`} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card p-4 border border-indigo-500/20"
            style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.06),transparent)" }}>
            <div className="flex items-start gap-2">
              <Zap size={14} className="text-indigo-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">Market Snapshot</p>
                <p className="text-sm text-[var(--text-2)]">
                  There are <strong className="text-[var(--text)]">{intel.total?.toLocaleString()}</strong> "{intel.category}" businesses
                  {intel.state ? ` in ${STATE_ABBR[intel.state] || intel.state}` : " across the US"}.{" "}
                  <strong className="text-green-400">{intel.coverage.phone.pct}%</strong> have a phone,{" "}
                  <strong className="text-cyan-400">{intel.coverage.email.pct}%</strong> have email, and{" "}
                  <strong className="text-blue-400">{intel.coverage.website.pct}%</strong> have a website.
                  {intel.byState?.[0] && <> Top state: <strong className="text-[var(--text)]">{STATE_ABBR[intel.byState[0].state] || intel.byState[0].state}</strong> ({intel.byState[0].count?.toLocaleString()} businesses).</>}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════
const TABS = [
  { id: "map",   label: "Market Map",         icon: Map       },
  { id: "ai",    label: "AI Profiler",         icon: Brain     },
  { id: "intel", label: "Market Intelligence", icon: BarChart3 },
];

export default function DatabaseIntelligencePage() {
  const [tab, setTab] = useState("map");
  return (
    <div className="flex flex-col gap-5 h-full">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <TrendingUp size={22} className="text-indigo-400" />
          Database Intelligence
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">
          Deep insights from 742,000+ US businesses · Geographic analysis · AI-powered profiling
        </p>
      </div>
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--surface-2)] w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id
                ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            }`}>
            <t.icon size={12} />{t.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === "map"   && <MarketMapTab />}
          {tab === "ai"    && <IdealCustomerTab />}
          {tab === "intel" && <MarketIntelTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
