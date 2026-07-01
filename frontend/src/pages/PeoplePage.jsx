// Build trigger: 2026-07-02-v2
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Search, Filter, Download, RefreshCw,
  Phone, Mail, MapPin, ChevronDown, ChevronUp, X,
  Globe, Building2, Database,
} from "lucide-react";
import { fpGetDatabase, fpGetStats, fpGetColumns, fpRefresh } from "../api";
import toast from "react-hot-toast";

export default function PeoplePage() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showF, setShowF] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [search, setSearch] = useState("");
  // Column-specific filters
  const [fCity,     setFCity]     = useState("");
  const [fState,    setFState]    = useState("");
  const [fPincode,  setFPincode]  = useState("");
  const [fJob,      setFJob]      = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fGeo,      setFGeo]      = useState("");
  const [fHasEmail, setFHasEmail] = useState("");
  const [fHasPhone, setFHasPhone] = useState("");

  // ── Column discovery (only sets column headers, never triggers re-fetch) ────
  const loadColumns = useCallback(async () => {
    try {
      const { data } = await fpGetColumns();
      if (data?.columns?.length) {
        const columns = data.columns.map(k => ({
          key: k,
          label: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        }));
        setCols(columns);
        // NOTE: do NOT call setSortBy here — that would trigger a second fetch
      }
    } catch {
      // fallback — empty header
    }
  }, []); // eslint-disable-line

  // ── Load records ──────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fpGetDatabase({
        page, limit,
        sort_by: sortBy, sort_dir: sortDir,
        search,
        ...(fCity     && { f_city:      fCity     }),
        ...(fState    && { f_state:     fState    }),
        ...(fPincode  && { f_pincode:   fPincode  }),
        ...(fJob      && { f_job_title: fJob      }),
        ...(fLocation && { f_location:  fLocation }),
        ...(fGeo      && { f_geo_source: fGeo     }),
        ...(fHasEmail && { f_has_email: fHasEmail }),
        ...(fHasPhone && { f_has_phone: fHasPhone }),
      });
      const recordsData = data.records || [];
      if (!sortBy) {
        recordsData.sort((a, b) => {
          const getScore = (r) => {
            let score = 0;
            if (r.full_name && String(r.full_name).trim() !== "") score += 2;
            if (r.emails) {
              if (Array.isArray(r.emails) && r.emails.length > 0) score += 3;
              else if (typeof r.emails === "string" && r.emails.trim() !== "") score += 3;
            }
            if (r.phones) {
              if (Array.isArray(r.phones) && r.phones.length > 0) score += 3;
              else if (typeof r.phones === "string" && r.phones.trim() !== "") score += 3;
            }
            if (r.job_title && String(r.job_title).trim() !== "") score += 2;
            if (r.linked_url && String(r.linked_url).trim() !== "") score += 1;
            if (r.city && String(r.city).trim() !== "") score += 1;
            return score;
          };
          return getScore(b) - getScore(a);
        });
      }
      setRecords(recordsData);
      setTotal(data.total || 0);
    } catch {
      toast.error("Failed to load People data");
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortDir, search, fCity, fState, fPincode, fJob, fLocation, fGeo, fHasEmail, fHasPhone]);

  useEffect(() => { loadColumns(); }, [loadColumns]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fpGetStats().then(({ data }) => setStats(data)).catch(() => { });
  }, []);

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fpRefresh();
      await Promise.all([
        loadColumns(),
        load(),
        fpGetStats().then(({ data }) => setStats(data)),
      ]);
      toast.success("Cache refreshed!");
    } catch { toast.error("Refresh failed"); }
    finally { setRefreshing(false); }
  };

  const clearAll = () => {
    setSearch(""); setFCity(""); setFState(""); setFPincode("");
    setFJob(""); setFLocation(""); setFGeo(""); setFHasEmail(""); setFHasPhone("");
    setPage(1);
  };

  const exportCSV = () => {
    if (!cols.length || !records.length) return;
    const hdrs = cols.map(c => c.label);
    const rows = records.map(r => cols.map(c => r[c.key] || ""));
    const csv = [hdrs, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "people_data.csv";
    a.click();
  };

  const pages = Math.ceil(total / limit);
  const statRows = stats ? [
    { label: "Total People", val: stats.total, icon: Users, color: "#E23744" },
  ] : [];

  // Hide columns where EVERY visible row is empty — avoids showing all-dash columns
  const visibleCols = cols.filter(c =>
    records.length === 0 || records.some(r => r[c.key] && r[c.key] !== "")
  );

  // ── Smart cell renderer ───────────────────────────────────
  const renderCell = (col, val) => {
    if (!val) return <span className="text-[var(--text-3)]">—</span>;
    const key = col.key.toLowerCase();

    if (key.includes("email")) return (
      <a href={`mailto:${val}`}
        className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline max-w-[200px] truncate"
        title={val}>
        <Mail size={9} className="flex-shrink-0" />{val}
      </a>
    );

    if (key.includes("phone") || key === "mobile" || key === "contact") return (
      <p className="flex items-center gap-1 text-[var(--text-2)] text-[11px]">
        <Phone size={9} className="text-green-400 flex-shrink-0" />
        <span className="truncate max-w-[140px]" title={val}>{val}</span>
      </p>
    );

    if (key.includes("website") || key === "url" || key === "web" || key.includes("linkedin")) return (
      <a href={val.startsWith("http") ? val : `https://${val}`} target="_blank" rel="noreferrer"
        className="text-[var(--text-3)] hover:text-blue-400 flex items-center gap-1">
        <Globe size={10} />Visit
      </a>
    );

    if (key.includes("address") || key === "location" || key === "city" || key === "state") return (
      <span className="flex items-start gap-1 text-[var(--text-3)]">
        <MapPin size={10} className="mt-0.5 flex-shrink-0" />{val}
      </span>
    );

    if (key.includes("company") || key === "organization" || key === "employer") return (
      <span className="flex items-center gap-1 text-[var(--text-2)]">
        <Building2 size={9} className="text-purple-400 flex-shrink-0" />
        <span className="truncate max-w-[140px]" title={val}>{val}</span>
      </span>
    );

    if (key.includes("name") || key === "first_name" || key === "last_name" || key === "full_name") return (
      <p className="font-semibold text-[var(--text)]">{val}</p>
    );

    if (key.includes("industry") || key.includes("category") || key.includes("sector") || key.includes("title") || key.includes("job")) return (
      <span className="text-[var(--text-2)] truncate max-w-[180px] block" title={val}>{val}</span>
    );

    return (
      <span className="text-[var(--text-2)] truncate max-w-[180px] block" title={val}>{val}</span>
    );
  };

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <Users size={22} className="text-[var(--accent)]" />
            People
          </h2>
          {/* <p className="text-sm text-[var(--text-3)] mt-0.5">
            {total.toLocaleString()} records {" "}
            <span className="font-mono text-[11px] opacity-60">final_people</span>
          </p> */}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCSV} disabled={!records.length} className="btn-ghost text-xs gap-1.5">
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

      {/* Filter Bar — active chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowF(p => !p)} className="btn-ghost text-xs gap-1.5">
          <Filter size={12} />Filters
          {[search,fCity,fState,fPincode,fJob,fLocation,fGeo,fHasEmail,fHasPhone].filter(Boolean).length > 0 &&
            <span className="ml-1 bg-[var(--accent)] text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">
              {[search,fCity,fState,fPincode,fJob,fLocation,fGeo,fHasEmail,fHasPhone].filter(Boolean).length}
            </span>
          }
          {showF ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {/* Active filter chips */}
        {search    && <span className="badge badge-purple text-[10px] flex items-center gap-1">name: {search}    <button onClick={() => { setSearch("");    setPage(1); }}><X size={9}/></button></span>}
        {fCity     && <span className="badge badge-purple text-[10px] flex items-center gap-1">city: {fCity}     <button onClick={() => { setFCity("");    setPage(1); }}><X size={9}/></button></span>}
        {fState    && <span className="badge badge-purple text-[10px] flex items-center gap-1">state: {fState}   <button onClick={() => { setFState("");   setPage(1); }}><X size={9}/></button></span>}
        {fPincode  && <span className="badge badge-purple text-[10px] flex items-center gap-1">pin: {fPincode}   <button onClick={() => { setFPincode(""); setPage(1); }}><X size={9}/></button></span>}
        {fJob      && <span className="badge badge-purple text-[10px] flex items-center gap-1">job: {fJob}       <button onClick={() => { setFJob("");      setPage(1); }}><X size={9}/></button></span>}
        {fLocation && <span className="badge badge-purple text-[10px] flex items-center gap-1">loc: {fLocation}  <button onClick={() => { setFLocation("");setPage(1); }}><X size={9}/></button></span>}
        {fGeo      && <span className="badge badge-purple text-[10px] flex items-center gap-1">geo: {fGeo}       <button onClick={() => { setFGeo("");      setPage(1); }}><X size={9}/></button></span>}
        {fHasEmail && <span className="badge badge-purple text-[10px] flex items-center gap-1">email: {fHasEmail}<button onClick={() => { setFHasEmail("");setPage(1); }}><X size={9}/></button></span>}
        {fHasPhone && <span className="badge badge-purple text-[10px] flex items-center gap-1">phone: {fHasPhone}<button onClick={() => { setFHasPhone("");setPage(1); }}><X size={9}/></button></span>}
        {[search,fCity,fState,fPincode,fJob,fLocation,fGeo,fHasEmail,fHasPhone].some(Boolean) && (
          <button onClick={clearAll} className="text-[10px] text-[var(--text-3)] hover:text-[var(--rose)] underline">Clear all</button>
        )}
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {showF && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="card p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">

              {/* Name search */}
              <div className="relative col-span-2 sm:col-span-1">
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">Name Search</label>
                <div className="relative">
                  <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                  <input className="input pl-7 text-xs w-full" placeholder="Full name…"
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
              </div>

              {/* City */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">City</label>
                <input className="input text-xs w-full" placeholder="e.g. Mumbai"
                  value={fCity} onChange={e => { setFCity(e.target.value); setPage(1); }} />
              </div>

              {/* State */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">State</label>
                <input className="input text-xs w-full" placeholder="e.g. Maharashtra"
                  value={fState} onChange={e => { setFState(e.target.value); setPage(1); }} />
              </div>

              {/* Pincode */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">Pincode</label>
                <input className="input text-xs w-full" placeholder="e.g. 400001"
                  value={fPincode} onChange={e => { setFPincode(e.target.value); setPage(1); }} />
              </div>

              {/* Job Title */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">Job Title</label>
                <input className="input text-xs w-full" placeholder="e.g. CEO, Manager"
                  value={fJob} onChange={e => { setFJob(e.target.value); setPage(1); }} />
              </div>

              {/* Location */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">Location</label>
                <input className="input text-xs w-full" placeholder="e.g. Delhi, India"
                  value={fLocation} onChange={e => { setFLocation(e.target.value); setPage(1); }} />
              </div>

              {/* Geo Source */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">Geo Source</label>
                <select className="input text-xs w-full" value={fGeo} onChange={e => { setFGeo(e.target.value); setPage(1); }}>
                  <option value="">Any</option>
                  <option value="us_city">us_city</option>
                  <option value="us_zip">us_zip</option>
                  <option value="us_state">us_state</option>
                  <option value="pincode">pincode</option>
                  <option value="city">city</option>
                  <option value="state">state</option>
                </select>
              </div>

              {/* Has Email */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block flex items-center gap-1"><Mail size={9}/>Has Email</label>
                <select className="input text-xs w-full" value={fHasEmail} onChange={e => { setFHasEmail(e.target.value); setPage(1); }}>
                  <option value="">Any</option>
                  <option value="true">✅ With Email</option>
                  <option value="false">❌ Without Email</option>
                </select>
              </div>

              {/* Has Phone */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block flex items-center gap-1"><Phone size={9}/>Has Phone</label>
                <select className="input text-xs w-full" value={fHasPhone} onChange={e => { setFHasPhone(e.target.value); setPage(1); }}>
                  <option value="">Any</option>
                  <option value="true">✅ With Phone</option>
                  <option value="false">❌ Without Phone</option>
                </select>
              </div>

              {/* Rows per page */}
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">Rows / Page</label>
                <select className="input text-xs w-full" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

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
                {visibleCols.map(c => (
                  <th key={c.key} onClick={() => handleSort(c.key)}
                    className="text-left px-3 py-3 text-[var(--text-3)] font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap cursor-pointer hover:text-[var(--text-2)] select-none">
                    {c.label}{sortBy === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} className="border-b border-[var(--border)] animate-pulse">
                    {(visibleCols.length > 0 ? visibleCols : Array.from({ length: 6 })).map((_, ci) => (
                      <td key={ci} className="px-3 py-3">
                        <div className="h-4 bg-[var(--surface-2)] rounded" style={{ width: `${55 + (ci * 19) % 60}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length || 1} className="py-16 text-center text-[var(--text-3)]">
                    <Database size={32} className="mx-auto mb-3 opacity-30" />
                    <p>No records found.</p>
                    <p className="text-[10px] mt-1 opacity-60">Try adjusting your search or clearing filters.</p>
                  </td>
                </tr>
              ) : records.map((r, i) => (
                <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                  {visibleCols.map(c => (
                    <td key={c.key} className="px-3 py-2.5">
                      {renderCell(c, r[c.key])}
                    </td>
                  ))}
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
    </div>
  );
}
