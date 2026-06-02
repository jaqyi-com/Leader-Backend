import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Database, Search, Filter, Download, RefreshCw, Loader2,
  Phone, Globe, MapPin, Sparkles, X, ChevronDown, ChevronUp,
  ExternalLink, Star, Zap, Target, AlertCircle, Send, CheckCircle2, Mail
} from "lucide-react";
import {
  ibGetDatabase, ibGetStats, ibAIFilter, ibGetColumns,
  ibRefreshCache, ibSemanticSearch, ibEmbedStatus, ibLaunchCampaign
} from "../api";
import toast from "react-hot-toast";

const PRIORITY_COLS = [
  { key: "name",          label: "Business Name" },
  { key: "category",      label: "Category"      },
  { key: "city_file",     label: "City/Region"   },
  { key: "rating",        label: "Rating"        },
  { key: "phone_number",  label: "Phone"         },
  { key: "email_address", label: "Email"         },
  { key: "website",       label: "Website"       },
  { key: "address",       label: "Address"       },
];

const HIDDEN_KEYS = new Set(["_id", "_row_hash", "unnamed_13", "url", "embedding"]);
const BLANK = {
  search: "",
  category: "",
  city_file: "",
  city: "",
  state: "",
  phone: "",
  query_filter: "",
  min_rating: "",
  max_rating: "",
  min_reviews: "",
  max_reviews: "",
  address: "",
  website: "",
  url: "",
  has_phone: "",
  has_website: ""
};

const US_STATES = [
  "", "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC"
];

const STATE_NAMES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",
  CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",
  IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",
  ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
  NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",
  ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",
  RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",
  UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",
  WI:"Wisconsin",WY:"Wyoming",DC:"Washington DC"
};

// Similarity score badge
function SimilarityBadge({ score }) {
  if (score == null) return null;
  const pct = Math.round(score);
  const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#6b7280";
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: `${color}22`, color }}>
      <Target size={8} />{pct}%
    </span>
  );
}

export default function InBuildDatabasePage() {
  const navigate = useNavigate();
  const [leads,         setLeads]         = useState([]);
  const [total,         setTotal]         = useState(0);
  const [stats,         setStats]         = useState(null);
  const [cols,          setCols]          = useState(PRIORITY_COLS);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiQuery,       setAiQuery]       = useState("");
  const [aiSummary,     setAiSummary]     = useState("");
  const [semanticMode,  setSemanticMode]  = useState(false);
  const [embedStatus,   setEmbedStatus]   = useState(null);
  const [showF,         setShowF]         = useState(false);
  const [page,          setPage]          = useState(1);
  const [limit,         setLimit]         = useState(50);
  const [sortBy,        setSortBy]        = useState("name");
  const [sortDir,       setSortDir]       = useState("asc");
  const [filters,       setFilters]       = useState(BLANK);
  // ── Campaign builder state ───────────────────────────────────
  const [selected,      setSelected]      = useState(new Set());  // indices of selected rows
  const [showCampModal, setShowCampModal] = useState(false);
  const [campName,      setCampName]      = useState("");
  const [launching,     setLaunching]     = useState(false);
  const embedPollRef = useRef(null);

  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1); };

  // ── Column discovery ────────────────────────────────────────
  const loadColumns = useCallback(async () => {
    try {
      const { data } = await ibGetColumns();
      if (data?.columns?.length) {
        const priorityKeys = new Set(PRIORITY_COLS.map(c => c.key));
        const extraKeys    = data.columns.filter(k => !priorityKeys.has(k) && !HIDDEN_KEYS.has(k));
        const extra        = extraKeys.map(k => ({
          key: k,
          label: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        }));
        const present = PRIORITY_COLS.filter(c => data.columns.includes(c.key));
        setCols([...present, ...extra]);
      }
    } catch { /* keep default */ }
  }, []);

  // ── Regular paginated load ───────────────────────────────────
  const load = useCallback(async () => {
    if (semanticMode) return; // semantic mode uses handleSemanticSearch
    setLoading(true);
    try {
      const { data } = await ibGetDatabase({ page, limit, sort_by: sortBy, sort_dir: sortDir, ...filters });
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch { toast.error("Failed to load database"); }
    finally { setLoading(false); }
  }, [page, limit, sortBy, sortDir, filters, semanticMode]);

  // ── Semantic search ──────────────────────────────────────────
  const handleSemanticSearch = useCallback(async (q = aiQuery, pg = page) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const { data } = await ibSemanticSearch({
        query: q, page: pg, limit,
        category: filters.category,
        city_file: filters.city_file,
        city:     filters.city,
        state:    filters.state,
        phone:    filters.phone,
        query_filter: filters.query_filter,
        min_rating: filters.min_rating,
        max_rating: filters.max_rating,
        min_reviews: filters.min_reviews,
        max_reviews: filters.max_reviews,
        address:  filters.address,
        website:  filters.website,
        url:      filters.url,
        has_phone:   filters.has_phone,
        has_website: filters.has_website,
      });
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error("Semantic search failed: " + (e.response?.data?.error || e.message));
    } finally { setLoading(false); }
  }, [aiQuery, page, limit, filters]);

  // ── Embedding status polling ─────────────────────────────────
  const checkEmbedStatus = useCallback(async () => {
    try {
      const { data } = await ibEmbedStatus();
      setEmbedStatus(data);
      // If not fully ready, poll every 10s
      if (!data.ready || data.percent < 100) {
        embedPollRef.current = setTimeout(checkEmbedStatus, 10000);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadColumns(); checkEmbedStatus(); return () => clearTimeout(embedPollRef.current); }, [loadColumns, checkEmbedStatus]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { ibGetStats().then(({ data }) => setStats(data)).catch(() => {}); }, []);

  // Re-run semantic search when page changes in semantic mode
  useEffect(() => {
    if (semanticMode && aiQuery.trim()) handleSemanticSearch(aiQuery, page);
  }, [page]); // eslint-disable-line

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  // ── AI Filter (extracts structured params) ───────────────────
  const handleAI = async () => {
    if (!aiQuery.trim()) return;

    // If embeddings ready → use semantic search
    if (embedStatus?.ready) {
      setSemanticMode(true);
      setPage(1);
      await handleSemanticSearch(aiQuery, 1);
      setAiSummary(`Semantic search: "${aiQuery}"`);
      return;
    }

    // Fallback: extract structured filters via OpenAI
    setAiLoading(true);
    try {
      const { data } = await ibAIFilter(aiQuery);
      const { summary, ...rest } = data.filters || {};
      setFilters(p => ({ ...p, ...rest }));
      setAiSummary(summary || "");
      setSemanticMode(false);
      setPage(1);
      toast.success("Filters applied!");
    } catch { toast.error("AI filter failed"); }
    finally { setAiLoading(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await ibRefreshCache();
      await Promise.all([load(), loadColumns(), ibGetStats().then(({ data }) => setStats(data))]);
      toast.success("Stats refreshed!");
    } catch { toast.error("Refresh failed"); }
    finally { setRefreshing(false); }
  };

  const clearAll = () => {
    setFilters(BLANK); setAiQuery(""); setAiSummary("");
    setSemanticMode(false); setPage(1);
    setSelected(new Set());
  };

  // ── Campaign builder ──────────────────────────────────────────
  const toggleSelect = (idx) => setSelected(prev => {
    const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next;
  });

  const launchCampaign = async () => {
    if (!campName.trim()) { toast.error("Campaign name is required"); return; }
    const chosenLeads = [...selected].map(i => leads[i]);
    setLaunching(true);
    try {
      const { data } = await ibLaunchCampaign({ leads: chosenLeads, campaignName: campName, channels: ["email"] });
      toast.success(`✅ Campaign created with ${data.contactCount} contacts!`);
      setShowCampModal(false); setSelected(new Set()); setCampName("");
      navigate("/app/outreach");
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    } finally { setLaunching(false); }
  };

  const exportCSV = () => {
    const hdrs = cols.map(c => c.label);
    const rows = leads.map(l => cols.map(c => l[c.key] || ""));
    const csv  = [hdrs, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "business_data.csv"; a.click();
  };

  const pages    = Math.ceil(total / limit);
  const chips    = Object.entries(filters).filter(([, v]) => v);
  const statRows = stats ? [
    { label: "Total Records",  val: stats.total,        icon: Database, color: "#E23744" },
    { label: "With Phone",     val: stats.with_phone,   icon: Phone,    color: "#10b981" },
    { label: "With Website",   val: stats.with_website, icon: Globe,    color: "#22d3ee" },
  ] : [];

  const embedReady   = embedStatus?.ready === true;
  const embedPercent = embedStatus?.percent ?? 0;

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <Database size={22} className="text-[var(--accent)]" />
            In Build - Database
            {semanticMode && (
              <span className="text-[11px] font-normal bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Zap size={9} />Semantic Mode
              </span>
            )}
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            {total.toLocaleString()} records · {semanticMode ? "Semantic Search" : "Live Database"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              onClick={() => setShowCampModal(true)}
              className="btn-primary text-xs gap-1.5">
              <Send size={12} />Launch Campaign ({selected.size})
            </motion.button>
          )}
          <button onClick={exportCSV} disabled={!leads.length} className="btn-ghost text-xs gap-1.5">
            <Download size={13} />Export CSV
          </button>
          <button onClick={handleRefresh} disabled={refreshing || loading} className="btn-ghost text-xs gap-1.5">
            <RefreshCw size={13} className={refreshing || loading ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Stats */}
      {statRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statRows.map(s => (
            <div key={s.label} className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${s.color}22` }}>
                <s.icon size={16} style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-xl font-bold text-[var(--text)]">{s.val?.toLocaleString() ?? "—"}</p>
                <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wide">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Embedding status bar */}
      {embedStatus && !embedReady && (
        <div className="card p-3 flex items-center gap-3"
          style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.07),rgba(34,211,238,0.05))" }}>
          <AlertCircle size={14} className="text-purple-400 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--text-2)] font-medium">
                ⚡ Generating semantic embeddings…
              </span>
              <span className="text-[10px] text-[var(--text-3)]">
                {embedStatus.embedded?.toLocaleString()} / {embedStatus.total?.toLocaleString()} ({embedPercent}%)
              </span>
            </div>
            <div className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full transition-all duration-1000"
                style={{ width: `${embedPercent}%` }} />
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-3)] whitespace-nowrap">
            AI search available at 100%
          </span>
        </div>
      )}

      {/* AI / Semantic Search */}
      <div className="card p-4" style={{ background: "linear-gradient(135deg,rgba(226,55,68,0.07),rgba(168,85,247,0.06))" }}>
        <div className="flex items-center gap-2 mb-2.5">
          {embedReady ? <Zap size={13} className="text-purple-400" /> : <Sparkles size={13} className="text-[var(--accent)]" />}
          <span className={`text-xs font-semibold uppercase tracking-wider ${embedReady ? "text-purple-400" : "text-[var(--accent)]"}`}>
            {embedReady ? "Semantic Search" : "AI Smart Filter"}
          </span>
          <span className="text-[10px] text-[var(--text-3)]">
            {embedReady
              ? "describe what you need — powered by pgvector"
              : "describe what you need in plain English"}
          </span>
          {embedReady && (
            <span className="ml-auto text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">
              ✓ READY
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder={embedReady
              ? 'e.g. "Electricians in Houston Texas with a phone number"'
              : 'e.g. "Legal services in San Antonio with a phone number"'}
            value={aiQuery}
            onChange={e => setAiQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAI()}
          />
          <button onClick={handleAI} disabled={aiLoading || loading || !aiQuery.trim()}
            className={`text-xs gap-1.5 whitespace-nowrap px-4 py-2 rounded-lg font-semibold transition-all ${
              embedReady
                ? "bg-purple-600 hover:bg-purple-500 text-white"
                : "btn-primary"
            }`}>
            {embedReady ? <Zap size={12} /> : <Sparkles size={12} />}
            {aiLoading || (loading && semanticMode) ? "Searching…" : embedReady ? "Search" : "Apply Filter"}
          </button>
          {semanticMode && (
            <button onClick={clearAll} className="btn-ghost text-xs px-3" title="Exit semantic mode">
              <X size={13} />
            </button>
          )}
        </div>
        {aiSummary && (
          <p className="text-xs text-purple-400 mt-2 flex items-center gap-1">
            {embedReady ? <Zap size={10} /> : <Sparkles size={10} />}{aiSummary}
          </p>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowF(p => !p)} className="btn-ghost text-xs gap-1.5">
          <Filter size={12} />Filters {showF ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {chips.map(([k, v]) => (
          <span key={k} className="badge badge-purple text-[10px] flex items-center gap-1">
            {k === "has_phone" ? (v === "true" ? "Has Phone" : "No Phone")
             : k === "has_website" ? (v === "true" ? "Has Website" : "No Website")
             : k === "state" ? `State: ${v}`
             : k === "city_file" ? `City/Region: ${v}`
             : k === "query_filter" ? `Query: ${v}`
             : k === "min_rating" ? `Min Rating: ${v}`
             : k === "min_reviews" ? `Min Reviews: ${v}`
             : `${k.replace(/_/g, " ")}: ${v}`}
            <button onClick={() => setF(k, "")} className="hover:text-[var(--rose)] ml-0.5"><X size={9} /></button>
          </span>
        ))}
        {chips.length > 0 && (
          <button onClick={clearAll} className="text-[10px] text-[var(--text-3)] hover:text-[var(--rose)] underline">Clear all</button>
        )}
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {showF && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="card p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="relative col-span-2">
                <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                <input className="input pl-8 text-xs w-full" placeholder="Search across all columns…" value={filters.search} onChange={e => setF("search", e.target.value)} />
              </div>
              <input className="input text-xs" placeholder="Category…" value={filters.category} onChange={e => setF("category", e.target.value)} />
              <input className="input text-xs" placeholder="City/Region (e.g. Austin)…" value={filters.city_file} onChange={e => setF("city_file", e.target.value)} />
              <input className="input text-xs" placeholder="Phone number search…" value={filters.phone} onChange={e => setF("phone", e.target.value)} />
              <input className="input text-xs" placeholder="Scraped Query…" value={filters.query_filter} onChange={e => setF("query_filter", e.target.value)} />
              <input className="input text-xs" type="number" step="0.1" min="0" max="5" placeholder="Min Rating (e.g. 4.0)…" value={filters.min_rating} onChange={e => setF("min_rating", e.target.value)} />
              <input className="input text-xs" type="number" min="0" placeholder="Min Reviews (e.g. 10)…" value={filters.min_reviews} onChange={e => setF("min_reviews", e.target.value)} />
              <input className="input text-xs" placeholder="Address…" value={filters.address} onChange={e => setF("address", e.target.value)} />
              <input className="input text-xs" placeholder="Website…" value={filters.website} onChange={e => setF("website", e.target.value)} />
              <input className="input text-xs" placeholder="Google Maps URL…" value={filters.url} onChange={e => setF("url", e.target.value)} />
              
              <select className="input text-xs" value={filters.state} onChange={e => setF("state", e.target.value)}>
                <option value="">State: Any</option>
                {US_STATES.filter(Boolean).map(s => (
                  <option key={s} value={s}>{s} — {STATE_NAMES[s]}</option>
                ))}
              </select>
              <select className="input text-xs" value={filters.has_phone} onChange={e => setF("has_phone", e.target.value)}>
                <option value="">Phone: Any</option>
                <option value="true">Has Phone ✓</option>
                <option value="false">No Phone</option>
              </select>
              <select className="input text-xs" value={filters.has_website} onChange={e => setF("has_website", e.target.value)}>
                <option value="">Website: Any</option>
                <option value="true">Has Website ✓</option>
                <option value="false">No Website</option>
              </select>
              <select className="input text-xs" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="card overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox"
                    checked={leads.length > 0 && selected.size === leads.length}
                    onChange={() => selected.size === leads.length
                      ? setSelected(new Set())
                      : setSelected(new Set(leads.map((_, i) => i)))}
                  />
                </th>
                {semanticMode && (
                  <th className="text-left px-3 py-3 text-[var(--text-3)] font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                    Match
                  </th>
                )}
                {cols.map(c => (
                  <th key={c.key} onClick={() => !semanticMode && handleSort(c.key)}
                    className={`text-left px-3 py-3 text-[var(--text-3)] font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap ${!semanticMode ? "cursor-pointer hover:text-[var(--text-2)] select-none" : ""}`}>
                    {c.label}{!semanticMode && sortBy === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} className="border-b border-[var(--border)] animate-pulse">
                    <td className="px-3 py-3 w-8"><div className="h-4 w-4 bg-[var(--surface-2)] rounded" /></td>
                    {(semanticMode ? ["sim", ...cols.map(c=>c.key)] : cols.map(c=>c.key)).map((_, ci) => (
                      <td key={ci} className="px-3 py-3">
                        <div className="h-4 bg-[var(--surface-2)] rounded" style={{ width: `${60 + (ci * 17) % 60}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={cols.length + (semanticMode ? 2 : 1)} className="py-16 text-center text-[var(--text-3)]">
                    <Database size={32} className="mx-auto mb-3 opacity-30" />
                    <p>No records match your {semanticMode ? "semantic query" : "filters"}.</p>
                    <p className="text-[10px] mt-1 opacity-60">
                      {semanticMode ? "Try a different query or clear filters." : "Try adjusting your search or clearing the filters."}
                    </p>
                  </td>
                </tr>
              ) : leads.map((l, i) => (
                <tr key={l._id || i}
                  className={`border-b border-[var(--border)] transition-colors ${
                    selected.has(i) ? "bg-indigo-500/5" : "hover:bg-[var(--surface-2)]"
                  }`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(i)}
                      onChange={() => toggleSelect(i)}
                      onClick={e => e.stopPropagation()} />
                  </td>
                  {semanticMode && (
                    <td className="px-3 py-2.5">
                      <SimilarityBadge score={l.similarity} />
                    </td>
                  )}
                  {cols.map(c => {
                    const val = l[c.key];
                    if (c.key === "name") return (
                      <td key={c.key} className="px-3 py-2.5">
                        <p className="font-semibold text-[var(--text)]">{val || "—"}</p>
                        {l.url && (
                          <a href={l.url} target="_blank" rel="noreferrer"
                            className="text-blue-400 flex items-center gap-0.5 mt-0.5 text-[10px] hover:underline">
                            <ExternalLink size={8} />Maps Link
                          </a>
                        )}
                      </td>
                    );
                    if (c.key === "category") return (
                      <td key={c.key} className="px-3 py-2.5">
                        {val ? <span className="badge badge-purple text-[9px]">{val}</span> : "—"}
                      </td>
                    );
                    if (c.key === "city_file") return (
                      <td key={c.key} className="px-3 py-2.5 text-[var(--text-2)]">
                        {val ? val.replace(/_/g, " ") : "—"}
                      </td>
                    );
                    if (c.key === "rating") return (
                      <td key={c.key} className="px-3 py-2.5">
                        {val
                          ? <span className="flex items-center gap-1 text-[var(--text-2)]"><Star size={10} className="text-yellow-500" />{val}</span>
                          : "—"}
                      </td>
                    );
                    if (c.key === "phone_number" || c.key === "phone") return (
                      <td key={c.key} className="px-3 py-2.5">
                        {val
                          ? <p className="flex items-center gap-1 text-[var(--text-2)] text-[11px]">
                              <Phone size={9} className="text-green-400 flex-shrink-0" />
                              <span className="truncate max-w-[160px]" title={val}>{val}</span>
                            </p>
                          : <span className="text-[var(--text-3)]">—</span>}
                      </td>
                    );
                    if (c.key === "email_address" || c.key === "email") return (
                      <td key={c.key} className="px-3 py-2.5">
                        {val
                          ? <div className="flex flex-col gap-0.5">
                              {val.split(", ").slice(0, 2).map((em, i) => (
                                <a key={i} href={`mailto:${em.trim()}`}
                                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline max-w-[200px] truncate"
                                  title={em.trim()}>
                                  <Mail size={9} className="flex-shrink-0" />{em.trim()}
                                </a>
                              ))}
                              {val.split(", ").length > 2 && (
                                <span className="text-[9px] text-[var(--text-3)]">
                                  +{val.split(", ").length - 2} more
                                </span>
                              )}
                            </div>
                          : <span className="text-[var(--text-3)]">—</span>}
                      </td>
                    );
                    if (c.key === "address") return (
                      <td key={c.key} className="px-3 py-2.5 text-[var(--text-3)] min-w-[150px]">
                        {val && <span className="flex items-start gap-1"><MapPin size={10} className="mt-0.5 flex-shrink-0" />{val}</span>}
                      </td>
                    );
                    if (c.key === "website") return (
                      <td key={c.key} className="px-3 py-2.5">
                        {val
                          ? <a href={val.startsWith("http") ? val : `https://${val}`} target="_blank" rel="noreferrer"
                              className="text-[var(--text-3)] hover:text-blue-400 flex items-center gap-1">
                              <Globe size={10} />Visit
                            </a>
                          : "—"}
                      </td>
                    );
                    return (
                      <td key={c.key} className="px-3 py-2.5 text-[var(--text-2)] max-w-[180px] truncate">
                        {val || "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--text-3)]">
              Page {page} of {pages} · {total.toLocaleString()} total records
              {semanticMode && <span className="text-purple-400 ml-2">· Semantic Results</span>}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">‹ Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">Next ›</button>
              <button onClick={() => setPage(pages)} disabled={page === pages} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">»</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Campaign Launch Modal ─────────────────────────────── */}
      <AnimatePresence>
        {showCampModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCampModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative z-10 card p-6 w-full max-w-md"
              style={{ background: "var(--surface)" }}>
              <h3 className="text-base font-bold text-[var(--text)] mb-1">🚀 Launch Outreach Campaign</h3>
              <p className="text-xs text-[var(--text-3)] mb-4">
                {selected.size} leads selected · will be added to a new draft campaign
              </p>
              <label className="text-xs font-semibold text-[var(--text-2)] block mb-1">Campaign Name</label>
              <input className="input w-full text-sm mb-4" placeholder="e.g. DB Outreach May 2026"
                value={campName} onChange={e => setCampName(e.target.value)} autoFocus
                onKeyDown={e => e.key === "Enter" && launchCampaign()} />
              <p className="text-[10px] text-[var(--text-3)] mb-4">
                ⚠️ Only leads with an email or phone number will be included in the campaign.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowCampModal(false)} className="btn-ghost flex-1">Cancel</button>
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
