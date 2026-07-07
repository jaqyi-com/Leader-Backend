import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2, Search, Filter, Download, RefreshCw,
  Phone, Mail, MapPin, X,
  Globe, Users, Database, Link, Linkedin,
} from "lucide-react";
import { fcGetDatabase, fcGetStats, fcGetColumns, fcRefresh } from "../api";
import toast from "react-hot-toast";
import QueryBuilder, { qbFiltersToParams } from "../components/QueryBuilder";

export default function CompaniesPage() {
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [search, setSearch] = useState("");
  
  // Dynamic QueryBuilder Filters
  const [filters, setFilters] = useState(() => {
    const initialIndustry = searchParams.get("f_industry") || "";
    if (initialIndustry) {
      return [{ col: "industry", op: "contains", val: initialIndustry }];
    }
    return [];
  });

  // ── Column discovery ────
  const loadColumns = useCallback(async () => {
    try {
      const { data } = await fcGetColumns();
      if (data?.columns?.length) {
        const columns = data.columns.map(k => ({
          key: k,
          label: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          type: k === "has_email" || k === "has_phone" ? "bool" : "text"
        }));
        setCols(columns);
      }
    } catch {
      // fallback
    }
  }, []);

  // ── Load records ──────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filterParams = qbFiltersToParams(filters);
      const { data } = await fcGetDatabase({
        page, limit,
        sort_by: sortBy, sort_dir: sortDir,
        search,
        ...filterParams,
      });
      const recordsData = data.records || [];
      if (!sortBy) {
        recordsData.sort((a, b) => {
          const getScore = (r) => {
            let score = 0;
            if (r.business_name && String(r.business_name).trim() !== "") score += 3;
            if (r.phone && String(r.phone).trim() !== "") score += 3;
            if (r.website && String(r.website).trim() !== "") score += 2;
            if (r.emails) {
              if (Array.isArray(r.emails) && r.emails.length > 0) score += 2;
              else if (typeof r.emails === "string" && r.emails.trim() !== "") score += 2;
            }
            if (r.industry && String(r.industry).trim() !== "") score += 1;
            if (r.rating !== null && r.rating !== undefined && r.rating !== "") score += 1;
            if (r.city && String(r.city).trim() !== "") score += 1;
            return score;
          };
          return getScore(b) - getScore(a);
        });
      }
      setRecords(recordsData);
      setTotal(data.total || 0);
    } catch {
      toast.error("Failed to load Companies data");
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortDir, search, filters]);

  useEffect(() => { loadColumns(); }, [loadColumns]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fcGetStats().then(({ data }) => setStats(data)).catch(() => { });
  }, []);

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fcRefresh();
      await Promise.all([
        loadColumns(),
        load(),
        fcGetStats().then(({ data }) => setStats(data)),
      ]);
      toast.success("Cache refreshed!");
    } catch { toast.error("Refresh failed"); }
    finally { setRefreshing(false); }
  };

  const clearAll = () => {
    setSearch("");
    setFilters([]);
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
    a.download = "companies_data.csv";
    a.click();
  };

  const pages = Math.ceil(total / limit);
  const statRows = stats ? [
    { label: "Total Companies", val: stats.total, icon: Building2, color: "#22d3ee" },
  ] : [];

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

    if (key.includes("phone") || key === "mobile" || key === "contact_number") return (
      <p className="flex items-center gap-1 text-[var(--text-2)] text-[11px]">
        <Phone size={9} className="text-green-400 flex-shrink-0" />
        <span className="truncate max-w-[140px]" title={val}>{val}</span>
      </p>
    );

    if (key.includes("website") || key === "url" || key === "web" || key === "domain") return (
      <a href={val.startsWith("http") ? val : `https://${val}`} target="_blank" rel="noreferrer"
        className="text-[var(--text-3)] hover:text-blue-400 flex items-center gap-1">
        <Globe size={10} />Visit
      </a>
    );

    if (key.includes("linkedin")) return (
      <a href={val.startsWith("http") ? val : `https://${val}`} target="_blank" rel="noreferrer"
        className="text-[var(--text-3)] hover:text-blue-400 flex items-center gap-1">
        <Link size={10} />Profile
      </a>
    );

    if (key.includes("address") || key === "location" || key === "city" || key === "state" || key === "country") return (
      <span className="flex items-start gap-1 text-[var(--text-3)]">
        <MapPin size={10} className="mt-0.5 flex-shrink-0" />{val}
      </span>
    );

    if (key === "name" || key === "company_name" || key === "company" || key.includes("brand")) return (
      <p className="font-semibold text-[var(--text)]">{val}</p>
    );

    if (key.includes("employee") || key.includes("size") || key === "headcount") return (
      <span className="flex items-center gap-1 text-[var(--text-2)]">
        <Users size={9} className="text-cyan-400 flex-shrink-0" />{val}
      </span>
    );

    if (key.includes("industry") || key.includes("category") || key.includes("sector") || key.includes("type")) return (
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
            <Building2 size={22} className="text-cyan-400" />
            Companies
          </h2>
          {/* <p className="text-sm text-[var(--text-3)] mt-0.5">
            {total.toLocaleString()} records {" "}
            <span className="font-mono text-[11px] opacity-60">final_companies</span>
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

      {/* Controls: Search & Rows per page */}
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        {/* Name search */}
        <div className="relative w-full sm:w-72">
          <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">Business Name Search</label>
          <div className="relative">
            <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input className="input pl-7 text-xs w-full" placeholder="Search name…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>

        {/* Rows per page */}
        <div className="w-full sm:w-32">
          <label className="text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)] mb-1 block">Rows / Page</label>
          <select className="input text-xs w-full" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Supabase/Airtable style filter query builder */}
      <QueryBuilder
        columns={cols}
        filters={filters}
        onChange={f => { setFilters(f); setPage(1); }}
      />

      {/* Table */}
      <div className="card overflow-hidden flex-1">
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
                  <tr key={`skel-${idx}`} className="border-b border-[var(--border)] animate-pulse">
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
