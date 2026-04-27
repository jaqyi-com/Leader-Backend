import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database, Search, Download, ExternalLink, Globe, Mail, Phone,
  ChevronLeft, ChevronRight, Loader2, Server, RefreshCw, Code2,
  MapPin, Filter, X, ArrowLeft, Clock, Tag, Layers, Eye,
  SlidersHorizontal, Check, Globe2
} from "lucide-react";
import { getCrawlRuns, getCrawlRunWebsites } from "../api";
import toast from "react-hot-toast";

const PAGE_SIZE = 25;

function StatusBadge({ status }) {
  const map = {
    running: "badge badge-amber",
    completed: "badge badge-green",
    failed: "badge badge-rose",
  };
  const labels = { running: "Running", completed: "Completed", failed: "Failed" };
  return (
    <span className={map[status] || "badge badge-rose"}>
      {labels[status] || status}
    </span>
  );
}

function RunCard({ run, onClick, index }) {
  const date = new Date(run.createdAt);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const total = run.urlCount || 0;
  const successRate = total > 0 ? Math.round(((run.successCount || 0) / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={onClick}
      className="card card-interactive gradient-border cursor-pointer p-5 group space-y-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-violet-500 flex items-center justify-center shadow-lg shadow-[var(--accent-glow)] flex-shrink-0">
            <Globe size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[var(--text)] text-sm leading-snug truncate max-w-[180px]">
              {run.label || `${total} URLs`}
            </p>
            <p className="text-[11px] text-[var(--text-3)] mt-0.5 flex items-center gap-1">
              <Clock size={9} /> {dateStr} · {timeStr}
            </p>
          </div>
        </div>
        <StatusBadge status={run.status} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total", val: total, cls: "text-[var(--text-2)]" },
          { label: "OK", val: run.successCount ?? 0, cls: "text-[var(--emerald)]" },
          { label: "Failed", val: run.failedCount ?? 0, cls: "text-[var(--rose)]" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--surface-2)] rounded-xl py-2.5 text-center">
            <p className={`text-xl font-bold ${s.cls}`}>{s.val}</p>
            <p className="text-[10px] text-[var(--text-3)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex justify-between text-[10px] text-[var(--text-3)] mb-1">
          <span>Success rate</span>
          <span>{successRate}%</span>
        </div>
        <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${successRate}%` }}
            transition={{ delay: index * 0.05 + 0.2, duration: 0.6 }}
            className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--emerald)] rounded-full"
          />
        </div>
      </div>

      {run.keywords?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {run.keywords.slice(0, 4).map(k => (
            <span key={k} className="badge badge-purple text-[10px]">
              <Tag size={8} /> {k}
            </span>
          ))}
          {run.keywords.length > 4 && (
            <span className="badge badge-purple text-[10px]">+{run.keywords.length - 4}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="text-[11px] text-[var(--text-3)]">
          {run.source === "csv_upload" ? "CSV Upload" : "Direct URLs"}
          {run.customFields?.length > 0 && ` · ${run.customFields.length} custom fields`}
        </span>
        <span className="text-[11px] text-[var(--accent)] font-semibold flex items-center gap-1 group-hover:underline">
          View Data <ChevronRight size={11} />
        </span>
      </div>
    </motion.div>
  );
}

function TechBadge({ label }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--accent)]/10 text-[var(--accent-2)] border border-[var(--accent)]/15">
      <Code2 size={8} /> {label}
    </span>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 ${
        active
          ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm shadow-[var(--accent-glow)]"
          : "bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)] hover:border-[var(--border-hover)] hover:text-[var(--text)]"
      }`}
    >
      {active && <Check size={10} />} {label}
    </button>
  );
}

function WebsiteRow({ site, index, dynKeys }) {
  const techs = (site.technology_stack || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);
  return (
    <motion.tr
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors group"
    >
      <td className="px-4 py-3 min-w-[190px]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent)] to-violet-500 flex items-center justify-center flex-shrink-0">
            <Globe size={12} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text)] truncate max-w-[155px]">
              {site.brand_name || site.website_title || "—"}
            </div>
            <a
              href={site.input_url} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-[var(--text-3)] hover:text-[var(--accent)] truncate max-w-[155px] block"
              onClick={e => e.stopPropagation()}
            >
              {(site.input_url || "").replace(/^https?:\/\//, "").split("/")[0]}
            </a>
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-xs text-[var(--text-2)] max-w-[200px]">
        <p className="line-clamp-2">{site.short_description || "—"}</p>
      </td>

      <td className="px-4 py-3 min-w-[140px]">
        {techs.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {techs.map((t, i) => <TechBadge key={i} label={t} />)}
            {site.framework_used && <TechBadge label={site.framework_used} />}
          </div>
        ) : <span className="text-[var(--text-3)] text-xs">—</span>}
      </td>

      <td className="px-4 py-3 text-xs text-[var(--text-2)] min-w-[150px]">
        <div className="space-y-1">
          {site.contact_email && (
            <div className="flex items-center gap-1">
              <Mail size={10} className="text-[var(--teal)] flex-shrink-0" />
              <a href={`mailto:${site.contact_email}`} className="hover:text-[var(--accent)] truncate max-w-[130px]">
                {site.contact_email}
              </a>
            </div>
          )}
          {site.phone_number && (
            <div className="flex items-center gap-1">
              <Phone size={10} className="text-[var(--teal)] flex-shrink-0" />
              <span className="truncate max-w-[130px]">{site.phone_number}</span>
            </div>
          )}
          {!site.contact_email && !site.phone_number && (
            <span className="text-[var(--text-3)]">—</span>
          )}
        </div>
      </td>

      <td className="px-4 py-3 text-xs">
        {site.country
          ? <span className="flex items-center gap-1 text-[var(--text-2)]"><MapPin size={10} />{site.country}</span>
          : <span className="text-[var(--text-3)]">—</span>
        }
      </td>

      {dynKeys.map(k => (
        <td key={k} className="px-4 py-3 text-xs text-[var(--text-2)] max-w-[150px]">
          <span className="truncate block" title={site.extra_data?.custom_fields?.[k] || ""}>
            {site.extra_data?.custom_fields?.[k] || "—"}
          </span>
        </td>
      ))}

      <td className="px-4 py-3 text-center">
        {site.fetch_failed
          ? <span className="badge badge-rose text-[10px]">Failed</span>
          : <span className="badge badge-green text-[10px]">OK</span>
        }
      </td>

      <td className="px-4 py-3 text-right opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={site.input_url} target="_blank" rel="noopener noreferrer"
          className="btn-secondary text-xs px-2 py-1 gap-1"
        >
          <ExternalLink size={11} /> Open
        </a>
      </td>
    </motion.tr>
  );
}

export default function WebsitesPage() {
  const [view, setView] = useState("list");
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);

  // Detail state
  const [websites, setWebsites] = useState([]);
  const [total, setTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [dynKeys, setDynKeys] = useState([]);
  const [frameworkOptions, setFrameworkOptions] = useState([]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMail, setFilterMail] = useState("all");
  const [filterPhone, setFilterPhone] = useState("all");
  const [filterFramework, setFilterFramework] = useState("");

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const { data } = await getCrawlRuns();
      setRuns(Array.isArray(data) ? data : []);
    } catch (e) {
      setRunsError(e.response?.data?.error || "Could not load crawl runs");
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const loadDetail = useCallback(async () => {
    if (!selectedRun) return;
    setDetailLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (debouncedQ) params.q = debouncedQ;
      if (filterStatus !== "all") params.status = filterStatus;
      if (filterMail === "yes") params.hasMail = "true";
      if (filterMail === "no") params.hasMail = "false";
      if (filterPhone === "yes") params.hasPhone = "true";
      if (filterPhone === "no") params.hasPhone = "false";
      if (filterFramework) params.framework = filterFramework;

      const { data } = await getCrawlRunWebsites(selectedRun.crawlRunId, params);
      const list = data.websites || [];
      setWebsites(list);
      setTotal(data.total || 0);

      const keys = new Set();
      list.forEach(s => {
        if (s.extra_data?.custom_fields) Object.keys(s.extra_data.custom_fields).forEach(k => keys.add(k));
      });
      setDynKeys(Array.from(keys));

      const fws = [...new Set(list.map(s => s.framework_used).filter(Boolean))];
      if (fws.length > 0) setFrameworkOptions(prev => [...new Set([...prev, ...fws])]);
    } catch (e) {
      toast.error("Could not load websites");
    } finally {
      setDetailLoading(false);
    }
  }, [selectedRun, page, debouncedQ, filterStatus, filterMail, filterPhone, filterFramework]);

  useEffect(() => { if (view === "detail") loadDetail(); }, [loadDetail, view]);

  const openRun = (run) => {
    setSelectedRun(run);
    setView("detail");
    setPage(0);
    setQ("");
    setDebouncedQ("");
    setFilterStatus("all");
    setFilterMail("all");
    setFilterPhone("all");
    setFilterFramework("");
    setFrameworkOptions([]);
    setDynKeys([]);
  };

  const backToList = () => {
    setView("list");
    setSelectedRun(null);
    setWebsites([]);
    setTotal(0);
  };

  const activeFilterCount = [
    filterStatus !== "all",
    filterMail !== "all",
    filterPhone !== "all",
    !!filterFramework,
  ].filter(Boolean).length;

  const handleExport = () => {
    if (!websites.length) return;
    const baseH = ["URL", "Title", "Brand", "Tech Stack", "Framework", "Email", "Phone", "Country", "Status"];
    const headers = [...baseH, ...dynKeys];
    const rows = websites.map(s => [
      s.input_url, s.website_title, s.brand_name, s.technology_stack,
      s.framework_used, s.contact_email, s.phone_number, s.country,
      s.fetch_failed ? "Failed" : "OK",
      ...dynKeys.map(k => s.extra_data?.custom_fields?.[k] ?? ""),
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `crawl_${selectedRun?.crawlRunId?.slice(0, 8)}_${Date.now()}.csv`;
    a.click();
    toast.success(`Exported ${websites.length} records`);
  };

  const hasMore = (page + 1) * PAGE_SIZE < total;

  // ── LIST VIEW ─────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
              <Database size={22} className="text-[var(--accent)]" /> Website Intelligence
            </h2>
            <p className="text-sm text-[var(--text-3)] mt-1">
              Select a crawl run to explore its scraped data
            </p>
          </div>
          <button onClick={loadRuns} disabled={runsLoading} className="btn-secondary gap-2">
            <RefreshCw size={14} className={runsLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {runsError && (
          <div className="card p-5 flex items-center gap-3" style={{ borderColor: "rgba(244,63,94,0.3)" }}>
            <Server size={20} className="text-[var(--rose)] flex-shrink-0" />
            <div>
              <p className="font-semibold text-[var(--rose)] text-sm">Backend unavailable</p>
              <p className="text-xs text-[var(--text-3)] mt-0.5">{runsError}</p>
            </div>
          </div>
        )}

        {runsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-5 space-y-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--surface-3)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-[var(--surface-3)] rounded w-3/4" />
                    <div className="h-2.5 bg-[var(--surface-3)] rounded w-1/2" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-14 bg-[var(--surface-3)] rounded-xl" />
                  ))}
                </div>
                <div className="h-1.5 bg-[var(--surface-3)] rounded-full" />
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="card card-glow p-20 flex flex-col items-center justify-center text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mb-5 shadow-lg shadow-[var(--accent-glow)]">
              <Layers size={36} className="text-[var(--accent)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--text)] mb-2">No crawl runs yet</h3>
            <p className="text-sm text-[var(--text-3)] max-w-sm leading-relaxed">
              Run a crawl from the <strong className="text-[var(--text-2)]">Website Crawler</strong> page.
              Each run will appear here as a separate session you can explore and filter.
            </p>
          </motion.div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-[var(--text-3)]">
              <Globe2 size={14} />
              <span>{runs.length} crawl run{runs.length !== 1 ? "s" : ""} found</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {runs.map((run, i) => (
                <RunCard key={run.crawlRunId || i} run={run} index={i} onClick={() => openRun(run)} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ───────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button onClick={backToList} className="btn-ghost px-2 py-2 rounded-xl">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
              <Globe size={18} className="text-[var(--accent)]" />
              {selectedRun?.label || "Crawl Run"}
            </h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <StatusBadge status={selectedRun?.status} />
              <span className="text-[11px] text-[var(--text-3)] flex items-center gap-1">
                <Clock size={9} /> {new Date(selectedRun?.createdAt).toLocaleString()}
              </span>
              {selectedRun?.keywords?.length > 0 && (
                <span className="text-[11px] text-[var(--text-3)] flex items-center gap-1">
                  <Tag size={9} /> {selectedRun.keywords.join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`btn-secondary gap-2 ${showFilters ? "text-[var(--accent)] border-[var(--accent)]/40" : ""}`}
          >
            <Filter size={14} /> Filters
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button onClick={loadDetail} disabled={detailLoading} className="btn-secondary gap-2">
            <RefreshCw size={14} className={detailLoading ? "animate-spin" : ""} />
          </button>
          <button onClick={handleExport} disabled={!websites.length} className="btn-secondary gap-2">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card p-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            className="input pl-9 w-full text-sm"
            placeholder="Search by URL, title, brand, tech stack, email..."
            value={q}
            onChange={e => { setQ(e.target.value); setPage(0); }}
          />
        </div>
        {q && (
          <button onClick={() => { setQ(""); setPage(0); }} className="text-[var(--text-3)] hover:text-[var(--text)]">
            <X size={16} />
          </button>
        )}
        {detailLoading && <Loader2 size={16} className="animate-spin text-[var(--text-3)] flex-shrink-0" />}
        <span className="text-xs text-[var(--text-3)] whitespace-nowrap">
          {total} record{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="card p-5 space-y-4 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal size={12} /> Filter Options
              </h4>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setFilterStatus("all");
                    setFilterMail("all");
                    setFilterPhone("all");
                    setFilterFramework("");
                    setPage(0);
                  }}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Clear all ({activeFilterCount})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { val: "all", label: "All" },
                    { val: "ok", label: "✓ OK" },
                    { val: "failed", label: "✗ Failed" },
                  ].map(o => (
                    <FilterChip key={o.val} label={o.label} active={filterStatus === o.val}
                      onClick={() => { setFilterStatus(o.val); setPage(0); }} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">Has Email</p>
                <div className="flex flex-wrap gap-1.5">
                  {["all", "yes", "no"].map(v => (
                    <FilterChip key={v} label={v.charAt(0).toUpperCase() + v.slice(1)}
                      active={filterMail === v} onClick={() => { setFilterMail(v); setPage(0); }} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">Has Phone</p>
                <div className="flex flex-wrap gap-1.5">
                  {["all", "yes", "no"].map(v => (
                    <FilterChip key={v} label={v.charAt(0).toUpperCase() + v.slice(1)}
                      active={filterPhone === v} onClick={() => { setFilterPhone(v); setPage(0); }} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">Framework</p>
                <select
                  value={filterFramework}
                  onChange={e => { setFilterFramework(e.target.value); setPage(0); }}
                  className="input text-xs py-1.5 w-full"
                >
                  <option value="">All Frameworks</option>
                  {frameworkOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <motion.div className="card overflow-hidden" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {detailLoading && websites.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
          </div>
        ) : websites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Eye size={40} className="text-[var(--text-3)] mb-3" />
            <p className="font-semibold text-[var(--text-2)]">No results match your filters</p>
            <p className="text-xs text-[var(--text-3)] mt-1">Try adjusting or clearing filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  {[
                    "Website", "Description", "Tech Stack", "Contact", "Country",
                    ...dynKeys,
                    "Status", "",
                  ].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {websites.map((site, i) => (
                  <WebsiteRow key={site._id || site.input_url || i} site={site} index={i} dynKeys={dynKeys} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]">
            <p className="text-xs text-[var(--text-3)]">
              Showing {Math.min(page * PAGE_SIZE + 1, total)}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || detailLoading}
                className="btn-secondary px-2 py-1.5 text-xs disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-semibold text-[var(--text-2)] px-2">{page + 1}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore || detailLoading}
                className="btn-secondary px-2 py-1.5 text-xs disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
