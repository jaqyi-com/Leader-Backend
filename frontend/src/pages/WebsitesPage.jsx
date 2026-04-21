import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database, Search, Download, ExternalLink, Globe, Mail,
  Phone, ChevronLeft, ChevronRight, Loader2, Server, RefreshCw,
  Code2, MapPin, Building2,
} from "lucide-react";
import { getWebsites } from "../api";
import toast from "react-hot-toast";

const PAGE_SIZE = 25;

// ── Tech badge ────────────────────────────────────────────────────────────────
function TechBadge({ label }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
      <Code2 size={9} /> {label}
    </span>
  );
}

// ── Website row ───────────────────────────────────────────────────────────────
function WebsiteRow({ site, index }) {
  const techParts = (site.technology_stack || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);

  return (
    <motion.tr
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="border-b border-slate-100 dark:border-gray-800 hover:bg-slate-50/60 dark:hover:bg-gray-800/40 transition-colors group"
    >
      {/* Domain / URL */}
      <td className="px-4 py-3 min-w-[180px]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-accent-cyan flex items-center justify-center flex-shrink-0 shadow-sm">
            <Globe size={12} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 dark:text-white truncate max-w-[160px]">
              {site.brand_name || site.company_name || site.website_title || "—"}
            </div>
            <a href={site.input_url} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-slate-400 hover:text-brand-500 truncate max-w-[160px] block">
              {(site.input_url || "").replace(/^https?:\/\//, "").split("/")[0]}
            </a>
          </div>
        </div>
      </td>

      {/* Description */}
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[200px]">
        <p className="line-clamp-2">{site.short_description || "—"}</p>
      </td>

      {/* Tech Stack */}
      <td className="px-4 py-3">
        {techParts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {techParts.map((t, i) => <TechBadge key={i} label={t} />)}
            {(site.framework_used) && <TechBadge label={site.framework_used} />}
          </div>
        ) : (
          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
        )}
      </td>

      {/* Contact */}
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 min-w-[140px]">
        <div className="space-y-1">
          {site.contact_email && (
            <div className="flex items-center gap-1">
              <Mail size={10} className="text-slate-400 flex-shrink-0" />
              <a href={`mailto:${site.contact_email}`} className="hover:text-brand-500 truncate max-w-[130px]">
                {site.contact_email}
              </a>
            </div>
          )}
          {site.phone_number && (
            <div className="flex items-center gap-1">
              <Phone size={10} className="text-slate-400 flex-shrink-0" />
              <span>{site.phone_number}</span>
            </div>
          )}
          {!site.contact_email && !site.phone_number && (
            <span className="text-slate-300 dark:text-slate-600">—</span>
          )}
        </div>
      </td>

      {/* Country */}
      <td className="px-4 py-3 text-xs">
        {site.country ? (
          <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <MapPin size={10} /> {site.country}
          </span>
        ) : (
          <span className="text-slate-300 dark:text-slate-600">—</span>
        )}
      </td>

      {/* Failed badge */}
      <td className="px-4 py-3 text-center">
        {site.fetch_failed ? (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500">Failed</span>
        ) : (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600">OK</span>
        )}
      </td>

      {/* Open Link */}
      <td className="px-4 py-3 text-right opacity-0 group-hover:opacity-100 transition-opacity">
        <a href={site.input_url} target="_blank" rel="noopener noreferrer"
          className="btn-secondary text-xs px-2 py-1 gap-1">
          <ExternalLink size={11} /> Open
        </a>
      </td>
    </motion.tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WebsitesPage() {
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (debouncedQuery) params.q = debouncedQuery;
      const { data } = await getWebsites(params);
      const list = Array.isArray(data) ? data : [];
      setWebsites(list);
      setHasMore(list.length === PAGE_SIZE);
      setTotal(prev => page === 0 ? list.length : prev + list.length);
    } catch (e) {
      const msg = e.response?.data?.error || "Could not reach crawler backend";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Export CSV
  const handleExport = () => {
    if (websites.length === 0) return;
    const headers = ["URL", "Title", "Brand", "Company", "Tech Stack", "Framework", "Backend", "Email", "Phone", "Country", "Failed"];
    const rows = websites.map(s => [
      s.input_url, s.website_title, s.brand_name, s.company_name,
      s.technology_stack, s.framework_used, s.backend_language,
      s.contact_email, s.phone_number, s.country, s.fetch_failed
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `websites_intel_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${websites.length} records`);
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database size={22} className="text-brand-500" /> Website Intelligence
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Browse and search all crawled websites — tech stacks, contacts, companies.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} disabled={loading} className="btn-secondary gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={handleExport} disabled={websites.length === 0} className="btn-secondary gap-2">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="glass-card p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9 w-full" placeholder="Search by URL, title, brand, tech stack, hosting..."
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {loading && <Loader2 size={16} className="animate-spin text-slate-400 flex-shrink-0" />}
        {websites.length > 0 && !loading && (
          <span className="text-xs text-slate-400 whitespace-nowrap">{websites.length} results</span>
        )}
      </div>

      {/* Error state */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass-card p-5 flex items-center gap-3 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
            <Server size={20} className="text-red-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-600 dark:text-red-400 text-sm">Crawler backend unavailable</p>
              <p className="text-xs text-red-500/80 dark:text-red-400/80 mt-0.5">{error} — Start the Python backend with <code className="font-mono bg-red-100 dark:bg-red-900/40 px-1 rounded">uvicorn app.main:app --port 8000</code></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      {!error && (
        <motion.div
          className="glass-card overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {loading && websites.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={28} className="animate-spin text-brand-400" />
            </div>
          ) : websites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Database size={40} className="text-slate-300 dark:text-slate-600 mb-3" />
              <p className="font-semibold text-slate-500 dark:text-slate-400">No websites crawled yet</p>
              <p className="text-xs text-slate-400 mt-1">Run a crawl from the <strong>Website Crawler</strong> page first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-gray-800 bg-slate-50/80 dark:bg-gray-900/40">
                    {["Website", "Description", "Tech Stack", "Contact", "Country", "Status", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {websites.map((site, i) => (
                    <WebsiteRow key={site.input_url || i} site={site} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {websites.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/20">
              <p className="text-xs text-slate-400">
                Page {page + 1} · Showing {websites.length} records
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading}
                  className="btn-secondary px-2 py-1.5 text-xs disabled:opacity-40">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 px-2">{page + 1}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={!hasMore || loading}
                  className="btn-secondary px-2 py-1.5 text-xs disabled:opacity-40">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
