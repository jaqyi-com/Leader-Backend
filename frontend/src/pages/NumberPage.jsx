import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Search, Download, RefreshCw, Filter, X,
  Mail, MapPin, Globe, Building2, Database, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  fpnGetDatabase, fpnGetColumns, fpnRefresh,
  fcGetDatabase,  fcGetColumns,  fcRefresh,
} from "../api";
import toast from "react-hot-toast";
import QueryBuilder, { qbFiltersToParams } from "../components/QueryBuilder";

/* ──────────────────────────────────────────────────
   Smart cell renderer
────────────────────────────────────────────────── */
function renderCell(col, val) {
  if (!val) return <span className="text-[var(--text-3)]">—</span>;
  const key = col.key.toLowerCase();
  if (key.includes("phone") || key === "mobile") return (
    <a href={`tel:${val}`} className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline max-w-[200px] truncate" title={val}>
      <Phone size={9} className="flex-shrink-0" />{val}
    </a>
  );
  if (key.includes("email")) return (
    <a href={`mailto:${val}`} className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline max-w-[200px] truncate" title={val}>
      <Mail size={9} className="flex-shrink-0" />{val}
    </a>
  );
  if (key.includes("website") || key === "url" || key.includes("linkedin")) return (
    <a href={val.startsWith("http") ? val : `https://${val}`} target="_blank" rel="noreferrer"
      className="text-[var(--text-3)] hover:text-[var(--accent)] flex items-center gap-1">
      <Globe size={10} />Visit
    </a>
  );
  if (key.includes("address") || key === "location" || key === "city" || key === "state") return (
    <span className="flex items-start gap-1 text-[var(--text-3)]">
      <MapPin size={10} className="mt-0.5 flex-shrink-0" />{val}
    </span>
  );
  if (key.includes("company") || key === "organization" || key.includes("business")) return (
    <span className="flex items-center gap-1 text-[var(--text-2)]">
      <Building2 size={9} className="flex-shrink-0" />
      <span className="truncate max-w-[140px]" title={val}>{val}</span>
    </span>
  );
  if (key.includes("name") || key === "first_name" || key === "last_name" || key === "full_name") return (
    <p className="font-semibold text-[var(--text)]">{val}</p>
  );
  return <span className="text-[var(--text-2)] truncate max-w-[180px] block" title={val}>{val}</span>;
}

/* ──────────────────────────────────────────────────
   TablePanel — mounts fresh for each mode
────────────────────────────────────────────────── */
function TablePanel({ mode }) {
  const isPeople = mode === "people";

  const [records,    setRecords]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [cols,       setCols]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showF,      setShowF]      = useState(false);
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(50);
  const [sortBy,     setSortBy]     = useState("");
  const [sortDir,    setSortDir]    = useState("asc");
  // Shared filter
  const [search,     setSearch]     = useState("");
  // Dynamic QueryBuilder Filters
  const [filters,    setFilters]    = useState([]);

  // ── Column discovery ────────────────────────────────────────
  const loadColumns = useCallback(async () => {
    try {
      const fn = isPeople ? fpnGetColumns : fcGetColumns;
      const { data } = await fn();
      if (data?.columns?.length) {
        setCols(data.columns.map(k => ({
          key: k,
          label: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          type: k === "has_email" || k === "has_phone" ? "bool" : "text"
        })));
      }
    } catch { /* ignore */ }
  }, [isPeople]);

  // ── Load records ────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filterParams = qbFiltersToParams(filters);
      const params = { page, limit, sort_by: sortBy, sort_dir: sortDir, search, ...filterParams };
      if (isPeople) {
        // People tab — number endpoint with column filters
        const { data } = await fpnGetDatabase(params);
        setRecords(data.records || []);
        setTotal(data.total || 0);
      } else {
        // Companies tab — companies endpoint with phone filter
        params.f_has_phone = "true";
        const { data } = await fcGetDatabase(params);
        setRecords(data.records || []);
        setTotal(data.total || 0);
      }
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [isPeople, page, limit, sortBy, sortDir, search, filters]);

  useEffect(() => { loadColumns(); }, [loadColumns]);
  useEffect(() => { load(); }, [load]);

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const fn = isPeople ? fpnRefresh : fcRefresh;
      await fn();
      await Promise.all([loadColumns(), load()]);
      toast.success("Cache refreshed!");
    } catch { toast.error("Refresh failed"); }
    finally { setRefreshing(false); }
  };

  const clearAll = () => {
    setSearch("");
    setFilters([]);
    setPage(1);
  };

  const hasFilters = search || filters.length > 0;

  const exportCSV = () => {
    if (!cols.length || !records.length) return;
    const hdrs = cols.map(c => c.label);
    const rows = records.map(r => cols.map(c => r[c.key] || ""));
    const csv = [hdrs, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${mode}_number_data.csv`;
    a.click();
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Search */}
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              className="input pl-8 text-xs w-full"
              placeholder="Search across all columns…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {/* Filters toggle */}
          <button onClick={() => setShowF(p => !p)} className="btn-ghost text-xs gap-1.5">
            <Filter size={12} />Filters {showF ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {/* Rows per page */}
          <select className="input text-xs w-28" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={!records.length} className="btn-ghost text-xs gap-1.5">
            <Download size={13} />Export CSV
          </button>
          <button onClick={handleRefresh} disabled={refreshing || loading} className="btn-ghost text-xs gap-1.5">
            <RefreshCw size={13} className={refreshing || loading ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Filter Panel ─────────────────────────────────────── */}
      <AnimatePresence>
        {showF && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-4">
              <QueryBuilder
                columns={cols}
                filters={filters}
                onChange={f => { setFilters(f); setPage(1); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active filter badges ──────────────────────────────── */}
      {hasFilters && (
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          {search && (
            <span className="badge badge-purple flex items-center gap-1">
              search: {search}
              <button onClick={() => { setSearch(""); setPage(1); }}><X size={9} /></button>
            </span>
          )}
          {filters.map((f, i) => (
            <span key={i} className="badge badge-purple flex items-center gap-1">
              {f.col} {f.op} {f.val}
              <button onClick={() => { setFilters(prev => prev.filter((_, idx) => idx !== i)); setPage(1); }}>
                <X size={9} />
              </button>
            </span>
          ))}
          <button onClick={clearAll} className="text-[var(--text-3)] hover:text-[var(--rose)] underline">Clear all</button>
        </div>
      )}

      {/* ── Count badge ──────────────────────────────────────── */}
      <p className="text-xs text-[var(--text-3)]">
        <span className="font-semibold text-[var(--text)]">{total.toLocaleString()}</span>{" "}
        {isPeople ? "people" : "companies"} with phone number
      </p>

      {/* ── Table ────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                {cols.map(c => (
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
                  <tr key={idx} className="border-b border-[var(--border)] animate-pulse">
                    {(cols.length > 0 ? cols : Array.from({ length: 6 })).map((_, ci) => (
                      <td key={ci} className="px-3 py-3">
                        <div className="h-4 bg-[var(--surface-2)] rounded" style={{ width: `${55 + (ci * 19) % 60}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={cols.length || 1} className="py-16 text-center text-[var(--text-3)]">
                    <Database size={32} className="mx-auto mb-3 opacity-30" />
                    <p>No records found.</p>
                    <p className="text-[10px] mt-1 opacity-60">Try adjusting your search or clearing filters.</p>
                  </td>
                </tr>
              ) : records.map((r, i) => (
                <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                  {cols.map(c => (
                    <td key={c.key} className="px-3 py-2.5">{renderCell(c, r[c.key])}</td>
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
              Page {page} of {pages} · {total.toLocaleString()} total
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

/* ──────────────────────────────────────────────────
   Main NumberPage
────────────────────────────────────────────────── */
export default function NumberPage() {
  const [mode, setMode] = useState("people");

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Phone size={22} className="text-[var(--accent)]" />
          Numbers
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">
          Browse {mode === "people" ? "people" : "companies"} with phone numbers on record
        </p>
      </div>

      {/* ── Toggle — People / Companies ─────────────────────── */}
      <div className="flex justify-center">
        <div className="relative flex items-center rounded-full p-1"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", width: "fit-content" }}>
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="absolute top-1 bottom-1 rounded-full"
            style={{
              background: "var(--accent)",
              left: mode === "people" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 6px)",
              zIndex: 0,
            }}
          />
          <button onClick={() => setMode("people")}
            className="relative z-10 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{ color: mode === "people" ? "#fff" : "var(--text-3)" }}>
            People
          </button>
          <button onClick={() => setMode("company")}
            className="relative z-10 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{ color: mode === "company" ? "#fff" : "var(--text-3)" }}>
            Companies
          </button>
        </div>
      </div>

      {/* ── Table Panel (key forces remount on mode switch) ─── */}
      <TablePanel key={mode} mode={mode} />
    </div>
  );
}
