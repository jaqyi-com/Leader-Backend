import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, Search, Filter, Download, RefreshCw, Loader2, Mail, Phone, Globe, MapPin, Sparkles, X, ChevronDown, ChevronUp, ExternalLink, Users } from "lucide-react";
import { ibGetDatabase, ibGetStats, ibAIFilter } from "../api";
import toast from "react-hot-toast";

const STATUS_CFG = {
  new:       { label: "New",       cls: "badge-purple" },
  contacted: { label: "Contacted", cls: "badge-amber"  },
  replied:   { label: "Replied",   cls: "badge-teal"   },
  qualified: { label: "Qualified", cls: "badge-green"  },
  rejected:  { label: "Rejected",  cls: "badge-rose"   },
};
const SOURCE_LABELS = {
  linkedin_finder:"LinkedIn", email_finder:"Email Finder",
  auto_scraper:"Auto Scraper", ai_research:"AI Research",
  places_scraper:"Places", manual:"Manual",
};
const COLS = [
  { key:"full_name",    label:"Name"     },
  { key:"company_name", label:"Company"  },
  { key:"email",        label:"Email"    },
  { key:"job_title",    label:"Title"    },
  { key:"country",      label:"Country"  },
  { key:"industry",     label:"Industry" },
  { key:"status",       label:"Status"   },
  { key:"source",       label:"Source"   },
  { key:"created_at",   label:"Added"    },
];
const BLANK = { search:"", status:"", source:"", industry:"", country:"", job_title:"", has_email:"", has_phone:"", date_from:"", date_to:"" };

export default function InBuildDatabasePage() {
  const [leads,      setLeads]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiQuery,    setAiQuery]    = useState("");
  const [aiSummary,  setAiSummary]  = useState("");
  const [showF,      setShowF]      = useState(false);
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(50);
  const [sortBy,     setSortBy]     = useState("created_at");
  const [sortDir,    setSortDir]    = useState("desc");
  const [isMock,     setIsMock]     = useState(false);
  const [filters,    setFilters]    = useState(BLANK);

  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await ibGetDatabase({ page, limit, sort_by: sortBy, sort_dir: sortDir, ...filters });
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setIsMock(data.source === "mock");
    } catch { toast.error("Failed to load database"); }
    finally { setLoading(false); }
  }, [page, limit, sortBy, sortDir, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { ibGetStats().then(({ data }) => setStats(data)).catch(() => {}); }, []);

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const handleAI = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await ibAIFilter(aiQuery);
      const { summary, ...rest } = data.filters || {};
      setFilters(p => ({ ...p, ...rest }));
      setAiSummary(summary || "");
      setPage(1);
      toast.success("AI filters applied!");
    } catch { toast.error("AI filter failed"); }
    finally { setAiLoading(false); }
  };

  const clearAll = () => { setFilters(BLANK); setAiQuery(""); setAiSummary(""); setPage(1); };

  const exportCSV = () => {
    const hdrs = ["Name","Email","Phone","Job Title","Company","Country","Industry","Status","Source","Added"];
    const rows = leads.map(l => [
      l.full_name||"", l.email||"", l.phone||"", l.job_title||"",
      l.company_name||"", l.country||"", l.industry||"",
      l.status||"", SOURCE_LABELS[l.source]||l.source||"",
      l.created_at ? new Date(l.created_at).toLocaleDateString() : "",
    ]);
    const csv = [hdrs,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = "inbuild_leads.csv"; a.click();
  };

  const pages    = Math.ceil(total / limit);
  const chips    = Object.entries(filters).filter(([,v]) => v);
  const statRows = stats ? [
    { label:"Total Records", val:stats.total,      icon:Database, color:"#E23744" },
    { label:"With Email",    val:stats.with_email,  icon:Mail,     color:"#22d3ee" },
    { label:"With Phone",    val:stats.with_phone,  icon:Phone,    color:"#10b981" },
    { label:"Qualified",     val:stats.qualified,   icon:Users,    color:"#a78bfa" },
  ] : [];

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <Database size={22} className="text-[var(--accent)]" />
            In Build - Database
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            {total.toLocaleString()} records · Supabase
            {isMock && <span className="badge badge-amber ml-2 text-[10px]">Demo Data — add Supabase keys to .env</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCSV} disabled={!leads.length} className="btn-ghost text-xs gap-1.5">
            <Download size={13}/>Export CSV
          </button>
          <button onClick={load} disabled={loading} className="btn-ghost text-xs gap-1.5">
            <RefreshCw size={13} className={loading?"animate-spin":""}/>Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {statRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statRows.map(s => (
            <div key={s.label} className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{background:`${s.color}22`}}>
                <s.icon size={16} style={{color:s.color}}/>
              </div>
              <div>
                <p className="text-xl font-bold text-[var(--text)]">{s.val?.toLocaleString() ?? "—"}</p>
                <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wide">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Filter */}
      <div className="card p-4" style={{background:"linear-gradient(135deg,rgba(226,55,68,0.07),rgba(34,211,238,0.05))"}}>
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles size={13} className="text-[var(--accent)]"/>
          <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider">AI Smart Filter</span>
          <span className="text-[10px] text-[var(--text-3)]">describe what you need in plain English</span>
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder={'e.g. "CTOs from India with verified email, last 30 days"'}
            value={aiQuery}
            onChange={e => setAiQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAI()}
          />
          <button onClick={handleAI} disabled={aiLoading||!aiQuery.trim()} className="btn-primary text-xs gap-1.5 whitespace-nowrap">
            <Sparkles size={12}/>{aiLoading ? "Thinking…" : "Apply Filter"}
          </button>
        </div>
        {aiSummary && (
          <p className="text-xs text-[var(--teal)] mt-2 flex items-center gap-1">
            <Sparkles size={10}/>Understood: {aiSummary}
          </p>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={()=>setShowF(p=>!p)} className="btn-ghost text-xs gap-1.5">
          <Filter size={12}/>Filters {showF ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
        </button>
        {chips.map(([k,v]) => (
          <span key={k} className="badge badge-purple text-[10px] flex items-center gap-1">
            {k.replace(/_/g," ")}: {v}
            <button onClick={()=>setF(k,"")} className="hover:text-[var(--rose)] ml-0.5"><X size={9}/></button>
          </span>
        ))}
        {chips.length > 0 && (
          <button onClick={clearAll} className="text-[10px] text-[var(--text-3)] hover:text-[var(--rose)] underline">Clear all</button>
        )}
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {showF && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
            <div className="card p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"/>
                <input className="input pl-8 text-xs w-full" placeholder="Search…" value={filters.search} onChange={e=>setF("search",e.target.value)}/>
              </div>
              <select className="input text-xs" value={filters.status} onChange={e=>setF("status",e.target.value)}>
                <option value="">All Statuses</option>
                {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="input text-xs" value={filters.source} onChange={e=>setF("source",e.target.value)}>
                <option value="">All Sources</option>
                {Object.entries(SOURCE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
              <input className="input text-xs" placeholder="Industry…" value={filters.industry} onChange={e=>setF("industry",e.target.value)}/>
              <input className="input text-xs" placeholder="Country…" value={filters.country} onChange={e=>setF("country",e.target.value)}/>
              <input className="input text-xs" placeholder="Job Title…" value={filters.job_title} onChange={e=>setF("job_title",e.target.value)}/>
              <select className="input text-xs" value={filters.has_email} onChange={e=>setF("has_email",e.target.value)}>
                <option value="">Email: Any</option>
                <option value="true">Has Email ✓</option>
                <option value="false">No Email</option>
              </select>
              <select className="input text-xs" value={filters.has_phone} onChange={e=>setF("has_phone",e.target.value)}>
                <option value="">Phone: Any</option>
                <option value="true">Has Phone ✓</option>
                <option value="false">No Phone</option>
              </select>
              <input className="input text-xs" type="date" title="From date" value={filters.date_from} onChange={e=>setF("date_from",e.target.value)}/>
              <input className="input text-xs" type="date" title="To date" value={filters.date_to} onChange={e=>setF("date_to",e.target.value)}/>
              <select className="input text-xs" value={limit} onChange={e=>{setLimit(Number(e.target.value));setPage(1);}}>
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
                {COLS.map(c => (
                  <th key={c.key} onClick={()=>handleSort(c.key)}
                    className="text-left px-3 py-3 text-[var(--text-3)] font-semibold uppercase tracking-wider text-[10px] cursor-pointer hover:text-[var(--text-2)] select-none whitespace-nowrap">
                    {c.label}{sortBy===c.key?(sortDir==="asc"?" ↑":" ↓"):""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center text-[var(--text-3)]">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2"/>Loading records…
                </td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-[var(--text-3)]">
                  <Database size={32} className="mx-auto mb-3 opacity-30"/>
                  <p>No records match your filters.</p>
                </td></tr>
              ) : leads.map((l, i) => (
                <tr key={l.id||i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-[var(--text)]">{l.full_name||l.name||"—"}</p>
                    {l.linkedin_url && (
                      <a href={l.linkedin_url} target="_blank" rel="noreferrer"
                        className="text-blue-400 flex items-center gap-0.5 mt-0.5 text-[10px] hover:underline">
                        <ExternalLink size={8}/>LinkedIn
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-[var(--text-2)] font-medium">{l.company_name||"—"}</p>
                    {l.company_domain && <p className="text-[var(--text-3)] flex items-center gap-0.5 text-[10px]"><Globe size={8}/>{l.company_domain}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    {l.email
                      ? <p className="flex items-center gap-1 text-[var(--text-2)]"><Mail size={9} className="text-[var(--accent)]"/>{l.email}</p>
                      : <span className="text-[var(--text-3)]">—</span>}
                    {l.phone && <p className="flex items-center gap-1 text-[var(--text-3)] mt-0.5 text-[10px]"><Phone size={9}/>{l.phone}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-2)]">{l.job_title||"—"}</td>
                  <td className="px-3 py-2.5 text-[var(--text-3)]">
                    {l.country && <span className="flex items-center gap-1"><MapPin size={9}/>{l.city?`${l.city}, `:""}{l.country}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {l.industry ? <span className="badge badge-teal text-[9px]">{l.industry}</span> : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {l.status
                      ? <span className={`badge ${STATUS_CFG[l.status]?.cls||"badge-purple"} text-[9px]`}>{STATUS_CFG[l.status]?.label||l.status}</span>
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="badge badge-purple text-[9px]">{SOURCE_LABELS[l.source]||l.source||"—"}</span>
                    {l.is_mock && <span className="badge badge-amber text-[9px] ml-1">Mock</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-3)] whitespace-nowrap">
                    {l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}
                  </td>
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
              <button onClick={()=>setPage(1)} disabled={page===1} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">«</button>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">‹ Prev</button>
              <button onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page===pages} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">Next ›</button>
              <button onClick={()=>setPage(pages)} disabled={page===pages} className="btn-ghost text-xs px-2 py-1 disabled:opacity-40">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
