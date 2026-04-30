import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database, Search, Filter, Download, Trash2, RefreshCw,
  Loader2, CheckCircle2, Mail, Phone, Globe, Building2,
  MapPin, Tag, UserCheck, UserX, MessageSquare, Clock,
  Upload, ChevronDown, X, ExternalLink,
} from "lucide-react";
import { lgGetDatabase, lgUpdateLead, lgDeleteLead, lgImportAutoScraper } from "../api";
import toast from "react-hot-toast";

const STATUS_CONFIG = {
  new:       { label: "New",       color: "badge-purple",  icon: Clock },
  contacted: { label: "Contacted", color: "badge-amber",   icon: MessageSquare },
  replied:   { label: "Replied",   color: "badge-blue",    icon: Mail },
  qualified: { label: "Qualified", color: "badge-green",   icon: UserCheck },
  rejected:  { label: "Rejected",  color: "badge-rose",    icon: UserX },
};

const SOURCE_LABELS = {
  linkedin_finder: "LinkedIn",
  email_finder:    "Email Finder",
  company_intel:   "Company Intel",
  ai_research:     "AI Research",
  auto_scraper:    "Auto Scraper",
  places_scraper:  "Places",
  manual:          "Manual",
};

function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <div className="relative">
      <button onClick={() => setOpen(p => !p)} className={`badge ${cfg.color} flex items-center gap-1 cursor-pointer`}>
        {status} <ChevronDown size={9} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-full left-0 mt-1 z-50 card p-1 shadow-2xl w-36">
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
              <button key={key} onMouseDown={() => { onChange(key); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] rounded-lg">
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LeadDatabasePage() {
  const [leads, setLeads]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [importing, setImporting]   = useState(false);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("");
  const [sourceFilter, setSource]   = useState("");
  const [page, setPage]             = useState(1);
  const LIMIT = 50;

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await lgGetDatabase({ page, limit: LIMIT, search, status: statusFilter, source: sourceFilter });
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error("Failed to load leads");
    } finally { setLoading(false); }
  }, [page, search, statusFilter, sourceFilter]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const handleStatusChange = async (id, status) => {
    try {
      await lgUpdateLead(id, { status });
      setLeads(prev => prev.map(l => l._id === id ? { ...l, status } : l));
      toast.success("Status updated");
    } catch { toast.error("Update failed"); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this lead?")) return;
    try {
      await lgDeleteLead(id);
      setLeads(prev => prev.filter(l => l._id !== id));
      setTotal(p => p - 1);
      toast.success("Lead deleted");
    } catch { toast.error("Delete failed"); }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const { data } = await lgImportAutoScraper();
      toast.success(`Imported ${data.imported} leads from Auto Scraper`);
      loadLeads();
    } catch { toast.error("Import failed"); } finally { setImporting(false); }
  };

  const exportCSV = () => {
    const headers = ["Name", "Job Title", "Company", "Email", "Phone", "Country", "Source", "Status", "Date"];
    const rows = leads.map(l => [
      l.fullName || "", l.jobTitle || "", l.companyName || "",
      l.email || "", l.phone || "", l.country || "",
      SOURCE_LABELS[l.source] || l.source, l.status,
      new Date(l.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "leads.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <Database size={22} className="text-[var(--accent)]" /> Lead Database
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-0.5">{total.toLocaleString()} total leads from all sources</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleImport} disabled={importing} className="btn-ghost text-xs gap-1.5">
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Import Auto Scraper
          </button>
          <button onClick={exportCSV} disabled={!leads.length} className="btn-ghost text-xs gap-1.5">
            <Download size={13} /> Export CSV
          </button>
          <button onClick={loadLeads} disabled={loading} className="btn-ghost text-xs gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input className="input pl-9 text-sm w-full" placeholder="Search name, company, email..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input text-sm pr-8 min-w-[140px]" value={statusFilter}
          onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input text-sm pr-8 min-w-[150px]" value={sourceFilter}
          onChange={e => { setSource(e.target.value); setPage(1); }}>
          <option value="">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                {["Name / Title", "Company", "Contact", "Location", "Source", "Status", "Date", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[var(--text-3)] font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-16">
                  <Loader2 size={24} className="animate-spin text-[var(--accent)] mx-auto" />
                </td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-[var(--text-3)]">
                  <Database size={32} className="mx-auto mb-2 opacity-40" />
                  <p>No leads yet. Use LinkedIn Finder, Email Finder, or AI Research to generate leads.</p>
                </td></tr>
              ) : leads.map((lead, i) => (
                <motion.tr key={lead._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--text)]">{lead.fullName || "—"}</p>
                    <p className="text-[var(--text-3)]">{lead.jobTitle || ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[var(--text-2)] font-medium">{lead.companyName || "—"}</p>
                    {lead.companyWebsite && (
                      <a href={lead.companyWebsite} target="_blank" rel="noreferrer"
                        className="text-[var(--accent)] hover:underline flex items-center gap-0.5">
                        <Globe size={9} /> website
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 space-y-0.5">
                    {lead.email && <p className="flex items-center gap-1 text-[var(--text-2)]"><Mail size={9} className="text-[var(--accent)]" /> {lead.email}</p>}
                    {lead.phone && <p className="flex items-center gap-1 text-[var(--text-3)]"><Phone size={9} /> {lead.phone}</p>}
                    {lead.linkedinUrl && (
                      <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-blue-400 hover:underline">
                        <ExternalLink size={9} /> LinkedIn
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {lead.country && <span className="flex items-center gap-1 text-[var(--text-3)]"><MapPin size={9} /> {lead.city ? `${lead.city}, ` : ""}{lead.country}</span>}
                    {lead.industry && <span className="badge badge-purple text-[9px] mt-0.5">{lead.industry}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge badge-purple text-[9px]">{SOURCE_LABELS[lead.source] || lead.source}</span>
                    {lead.isMock && <span className="badge badge-amber text-[9px] ml-1">Mock</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} onChange={s => handleStatusChange(lead._id, s)} />
                  </td>
                  <td className="px-4 py-3 text-[var(--text-3)]">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(lead._id)} className="text-[var(--text-3)] hover:text-[var(--rose)] p-1">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--text-3)]">Page {page} of {pages} · {total} total</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">← Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
