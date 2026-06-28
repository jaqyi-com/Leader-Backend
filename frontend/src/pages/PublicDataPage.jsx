import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database, Search, Filter, Download, RefreshCw,
  Phone, Mail, MapPin, ChevronDown, ChevronUp, X,
  Globe, User, Users, Building2,
} from "lucide-react";
import { pcGetDatabase, pcGetStats, pcGetColumns, pcRefresh } from "../api";
import toast from "react-hot-toast";

// ── Columns matching actual DB schema ──────────────────────
const PRIORITY_COLS = [
  { key: "first_name", label: "First Name" },
  { key: "middle_name", label: "Middle" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "address", label: "Address" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "industry", label: "Industry" },
  { key: "website", label: "Website" },
];

const BLANK = {
  search: "",
  name: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  zip: "",
  company: "",
  has_email: "",
  has_phone: "",
};

const US_STATES = [
  "", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
];

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "Washington DC",
};

export default function PublicDataPage() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showF, setShowF] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState("last_name");
  const [sortDir, setSortDir] = useState("asc");
  const [filters, setFilters] = useState(BLANK);

  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1); };

  // ── Load records ───────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await pcGetDatabase({
        page, limit,
        sort_by: sortBy, sort_dir: sortDir,
        ...filters,
      });
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error("Failed to load public contacts");
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortDir, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    pcGetStats().then(({ data }) => setStats(data)).catch(() => { });
  }, []);

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await pcRefresh();
      await Promise.all([
        load(),
        pcGetStats().then(({ data }) => setStats(data)),
      ]);
      toast.success("Cache refreshed!");
    } catch { toast.error("Refresh failed"); }
    finally { setRefreshing(false); }
  };

  const clearAll = () => { setFilters(BLANK); setPage(1); };

  const exportCSV = () => {
    const hdrs = PRIORITY_COLS.map(c => c.label);
    const rows = records.map(r => PRIORITY_COLS.map(c => r[c.key] || ""));
    const csv = [hdrs, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "public_contacts.csv";
    a.click();
  };

  const pages = Math.ceil(total / limit);
  const chips = Object.entries(filters).filter(([, v]) => v);
  const statRows = stats ? [
    { label: "Total Records", val: stats.total, icon: Database, color: "#E23744" },
    { label: "With Email", val: stats.with_email, icon: Mail, color: "#10b981" },
    { label: "With Phone", val: stats.with_phone, icon: Phone, color: "#22d3ee" },
  ] : [];

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <Users size={22} className="text-[var(--accent)]" />
            Public Data — 82M USA Contacts
          </h2>
          {/* <p className="text-sm text-[var(--text-3)] mt-0.5">
            {total.toLocaleString()} records {" "}
            <span className="font-mono text-[11px] opacity-60">usa_public_contacts_82m</span>
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

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowF(p => !p)} className="btn-ghost text-xs gap-1.5">
          <Filter size={12} />Filters {showF ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {chips.map(([k, v]) => (
          <span key={k} className="badge badge-purple text-[10px] flex items-center gap-1">
            {k === "has_email" ? (v === "true" ? "Has Email" : "No Email")
              : k === "has_phone" ? (v === "true" ? "Has Phone" : "No Phone")
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
                <input className="input pl-8 text-xs w-full" placeholder="Search name, email, phone, city…" value={filters.search} onChange={e => setF("search", e.target.value)} />
              </div>
              <input className="input text-xs" placeholder="Name…" value={filters.name} onChange={e => setF("name", e.target.value)} />
              <input className="input text-xs" placeholder="Email…" value={filters.email} onChange={e => setF("email", e.target.value)} />
              <input className="input text-xs" placeholder="Phone…" value={filters.phone} onChange={e => setF("phone", e.target.value)} />
              <input className="input text-xs" placeholder="City…" value={filters.city} onChange={e => setF("city", e.target.value)} />
              <input className="input text-xs" placeholder="Company…" value={filters.company} onChange={e => setF("company", e.target.value)} />
              <input className="input text-xs" placeholder="ZIP code…" value={filters.zip} onChange={e => setF("zip", e.target.value)} />
              <select className="input text-xs" value={filters.state} onChange={e => setF("state", e.target.value)}>
                <option value="">State: Any</option>
                {US_STATES.filter(Boolean).map(s => (
                  <option key={s} value={s}>{s} — {STATE_NAMES[s]}</option>
                ))}
              </select>
              <select className="input text-xs" value={filters.has_email} onChange={e => setF("has_email", e.target.value)}>
                <option value="">Email: Any</option>
                <option value="true">Has Email ✓</option>
                <option value="false">No Email</option>
              </select>
              <select className="input text-xs" value={filters.has_phone} onChange={e => setF("has_phone", e.target.value)}>
                <option value="">Phone: Any</option>
                <option value="true">Has Phone ✓</option>
                <option value="false">No Phone</option>
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
                {PRIORITY_COLS.map(c => (
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
                    {PRIORITY_COLS.map((_, ci) => (
                      <td key={ci} className="px-3 py-3">
                        <div className="h-4 bg-[var(--surface-2)] rounded" style={{ width: `${55 + (ci * 19) % 60}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={PRIORITY_COLS.length} className="py-16 text-center text-[var(--text-3)]">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    <p>No records match your filters.</p>
                    <p className="text-[10px] mt-1 opacity-60">Try adjusting or clearing the filters.</p>
                  </td>
                </tr>
              ) : records.map((r, i) => (
                <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                  {PRIORITY_COLS.map(c => {
                    const val = r[c.key];
                    if (c.key === "first_name" || c.key === "last_name" || c.key === "middle_name") return (
                      <td key={c.key} className="px-3 py-2.5">
                        <p className="font-semibold text-[var(--text)]">{val || "—"}</p>
                      </td>
                    );
                    if (c.key === "email") return (
                      <td key={c.key} className="px-3 py-2.5">
                        {val
                          ? <a href={`mailto:${val}`} className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline max-w-[200px] truncate" title={val}>
                            <Mail size={9} className="flex-shrink-0" />{val}
                          </a>
                          : <span className="text-[var(--text-3)]">—</span>}
                      </td>
                    );
                    if (c.key === "phone") return (
                      <td key={c.key} className="px-3 py-2.5">
                        {val
                          ? <p className="flex items-center gap-1 text-[var(--text-2)] text-[11px]">
                            <Phone size={9} className="text-green-400 flex-shrink-0" />
                            <span className="truncate max-w-[140px]" title={val}>{val}</span>
                          </p>
                          : <span className="text-[var(--text-3)]">—</span>}
                      </td>
                    );
                    if (c.key === "address") return (
                      <td key={c.key} className="px-3 py-2.5 text-[var(--text-3)] min-w-[140px]">
                        {val && <span className="flex items-start gap-1"><MapPin size={10} className="mt-0.5 flex-shrink-0" />{val}</span>}
                        {!val && "—"}
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
                    if (c.key === "company") return (
                      <td key={c.key} className="px-3 py-2.5">
                        {val
                          ? <span className="flex items-center gap-1 text-[var(--text-2)]">
                            <Building2 size={9} className="text-purple-400 flex-shrink-0" />
                            <span className="truncate max-w-[140px]" title={val}>{val}</span>
                          </span>
                          : "—"}
                      </td>
                    );
                    if (c.key === "industry" || c.key === "sub_industry") return (
                      <td key={c.key} className="px-3 py-2.5 text-[var(--text-2)] max-w-[140px] truncate">
                        {val || "—"}
                      </td>
                    );
                    return (
                      <td key={c.key} className="px-3 py-2.5 text-[var(--text-2)] max-w-[140px] truncate">
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
