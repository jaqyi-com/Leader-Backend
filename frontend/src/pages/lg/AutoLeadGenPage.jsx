import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Play, StopCircle, Download, Database,
  Mail, Phone, Globe, Building2, MapPin, User,
  Clock, CheckCircle2, AlertCircle, Loader2, ExternalLink,
  ChevronDown, Zap, Target, TrendingUp,
} from "lucide-react";
import { startAutoLeadGen, getAutoLeadGenStatus } from "../../api";
import toast from "react-hot-toast";

// ── Age filter options ───────────────────────────────────────
const AGE_OPTIONS = [
  { label: "1 hour",   value: 1 },
  { label: "6 hours",  value: 6 },
  { label: "24 hours", value: 24 },
  { label: "3 days",   value: 72 },
  { label: "7 days",   value: 168 },
  { label: "30 days",  value: 720 },
  { label: "Any time", value: 0 },
];

const COUNT_OPTIONS = [10, 20, 30, 50];

const EXAMPLE_PROMPTS = [
  "I need people who need custom CRM software for managing their customers",
  "I need homeowners who want solar panels installed on their house",
  "I need small restaurants looking for a point-of-sale system",
  "I need e-commerce store owners struggling with shipping and logistics",
  "I need HR managers at companies with 50–200 employees who need payroll software",
];

// ── Log line color mapping ───────────────────────────────────
function getLogStyle(line) {
  if (line.startsWith("✅") || line.startsWith("🎉")) return "#22c55e";
  if (line.startsWith("❌") || line.startsWith("⚠")) return "#f87171";
  if (line.startsWith("🧠") || line.startsWith("🤖")) return "#a78bfa";
  if (line.startsWith("🌐") || line.startsWith("🕷")) return "#38bdf8";
  if (line.startsWith("💾") || line.startsWith("📊")) return "#34d399";
  if (line.startsWith("•")) return "var(--text-2)";
  if (line.startsWith("━")) return "var(--border)";
  if (line.startsWith("🔎") || line.startsWith("📋")) return "#fbbf24";
  return "var(--text-3)";
}

export default function AutoLeadGenPage() {
  const [description, setDescription]   = useState("");
  const [maxAge, setMaxAge]             = useState(0);
  const [resultCount, setResultCount]   = useState(20);
  const [running, setRunning]           = useState(false);
  const [logs, setLogs]                 = useState([]);
  const [leads, setLeads]               = useState([]);
  const [status, setStatus]             = useState("idle"); // idle | running | done | failed
  const [showExamples, setShowExamples] = useState(false);
  const [expandedRow, setExpandedRow]   = useState(null);

  const logsEndRef  = useRef(null);
  const esRef       = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function stopSession() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setRunning(false);
    setStatus(prev => prev === "running" ? "failed" : prev);
  }

  async function handleStart() {
    if (!description.trim()) { toast.error("Please describe who you want to find"); return; }
    if (running) return;

    setRunning(true);
    setLogs([]);
    setLeads([]);
    setStatus("running");

    try {
      const { data } = await startAutoLeadGen({ description, maxAgeHours: maxAge, resultCount });
      const sessionId = data.sessionId;

      const url = getAutoLeadGenStatus(sessionId);
      const es  = new EventSource(url);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.log !== undefined) {
            setLogs(prev => [...prev, payload.log]);
          }
          if (payload.status) {
            setStatus(payload.status);
            setRunning(false);
            es.close();
            esRef.current = null;
            if (payload.leads?.length) setLeads(payload.leads);
            if (payload.status === "done") toast.success(`Done! ${payload.leads?.length || 0} leads found`);
            if (payload.status === "failed") toast.error("Pipeline failed. Check the log above.");
          }
        } catch {}
      };

      es.onerror = () => {
        setRunning(false);
        setStatus("failed");
        es.close();
        esRef.current = null;
      };
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to start pipeline");
      setRunning(false);
      setStatus("idle");
    }
  }

  function exportCSV() {
    const headers = ["Name", "Job Title", "Company", "Website", "Email", "Phone", "Industry", "Country", "City", "Notes"];
    const rows = leads.map(l => [
      l.fullName || "", l.jobTitle || "", l.companyName || "",
      l.companyWebsite || "", l.email || "", l.phone || "",
      l.industry || "", l.country || "", l.city || "", l.researchNotes || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `auto-leads-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const selectedAge = AGE_OPTIONS.find(o => o.value === maxAge) || AGE_OPTIONS[6];

  return (
    <div className="flex flex-col gap-6 h-full pb-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--text)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)", boxShadow: "0 0 20px rgba(245,158,11,0.3)" }}>
              <Target size={18} className="text-white" />
            </div>
            Auto Lead Generator
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
            Describe your ideal customer in plain language — AI finds real leads from the web
          </p>
        </div>

        {leads.length > 0 && (
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-ghost text-xs gap-1.5">
              <Download size={13} /> Export CSV ({leads.length})
            </button>
            <button onClick={() => window.location.href = "/app/lg/database"}
              className="btn-ghost text-xs gap-1.5">
              <Database size={13} /> View in Database
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5 flex-1 min-h-0">

        {/* ── Left: Input + Results ─────────────────────────── */}
        <div className="flex flex-col gap-5 min-h-0">

          {/* Input Card */}
          <div className="card p-5">
            {/* Description textarea */}
            <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text-2)" }}>
              Who are you looking for?
            </label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleStart(); }}
                placeholder={EXAMPLE_PROMPTS[0]}
                rows={4}
                disabled={running}
                className="input w-full resize-none text-sm leading-relaxed"
                style={{ paddingBottom: 40 }}
              />
              {/* Examples toggle */}
              <button
                onClick={() => setShowExamples(p => !p)}
                className="absolute bottom-2 left-3 text-xs flex items-center gap-1 transition-colors"
                style={{ color: "var(--accent-2)" }}
              >
                <Sparkles size={11} /> Examples {showExamples ? "▲" : "▼"}
              </button>
              <span className="absolute bottom-2 right-3 text-xs" style={{ color: "var(--text-3)" }}>
                ⌘+Enter to run
              </span>
            </div>

            {/* Examples */}
            <AnimatePresence>
              {showExamples && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-3 flex flex-col gap-1.5">
                    {EXAMPLE_PROMPTS.map((p, i) => (
                      <button key={i} onClick={() => { setDescription(p); setShowExamples(false); textareaRef.current?.focus(); }}
                        className="text-left text-xs px-3 py-2 rounded-lg transition-colors"
                        style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                      >
                        "{p}"
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Controls row */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* Age filter */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  <Clock size={10} className="inline mr-1" />Results age
                </span>
                <div className="flex flex-wrap gap-1">
                  {AGE_OPTIONS.map(opt => (
                    <button key={opt.value}
                      onClick={() => setMaxAge(opt.value)}
                      disabled={running}
                      className="text-xs px-2.5 py-1 rounded-lg border transition-all"
                      style={{
                        background: maxAge === opt.value ? "var(--accent)" : "var(--surface-2)",
                        color: maxAge === opt.value ? "#fff" : "var(--text-3)",
                        borderColor: maxAge === opt.value ? "var(--accent)" : "var(--border)",
                        fontWeight: maxAge === opt.value ? 600 : 400,
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Count */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  <TrendingUp size={10} className="inline mr-1" />Lead count
                </span>
                <div className="flex gap-1">
                  {COUNT_OPTIONS.map(n => (
                    <button key={n}
                      onClick={() => setResultCount(n)}
                      disabled={running}
                      className="text-xs px-3 py-1 rounded-lg border transition-all"
                      style={{
                        background: resultCount === n ? "var(--accent)" : "var(--surface-2)",
                        color: resultCount === n ? "#fff" : "var(--text-3)",
                        borderColor: resultCount === n ? "var(--accent)" : "var(--border)",
                        fontWeight: resultCount === n ? 600 : 400,
                      }}
                    >{n}</button>
                  ))}
                </div>
              </div>

              {/* Spacer + Run button */}
              <div className="ml-auto flex gap-2">
                {running && (
                  <button onClick={stopSession}
                    className="btn-ghost text-xs gap-1.5 text-red-400 border-red-400/30">
                    <StopCircle size={13} /> Stop
                  </button>
                )}
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleStart}
                  disabled={running || !description.trim()}
                  className="btn-primary text-sm gap-2 px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)", border: "none" }}
                >
                  {running
                    ? <><Loader2 size={14} className="animate-spin" /> Finding leads...</>
                    : <><Zap size={14} /> Find Leads</>}
                </motion.button>
              </div>
            </div>
          </div>

          {/* Results Table */}
          {leads.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="card overflow-hidden flex-1">
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
                  <CheckCircle2 size={15} className="text-green-400" />
                  {leads.length} Leads Found
                </span>
                <span className="badge badge-green text-[10px]">Saved to Database</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 440 }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: "var(--surface-2)", zIndex: 10 }}>
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      {["#", "Name / Role", "Company", "Contact", "Location", "Notes"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: "var(--text-3)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, i) => (
                      <motion.tr key={i}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                        className="border-b cursor-pointer transition-colors"
                        style={{ borderColor: "var(--border)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td className="px-3 py-2.5" style={{ color: "var(--text-3)" }}>{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ background: "linear-gradient(135deg, #f59e0b40, #ef444440)" }}>
                              <User size={10} style={{ color: "#f59e0b" }} />
                            </div>
                            <div>
                              <p className="font-semibold" style={{ color: "var(--text)" }}>{lead.fullName || "—"}</p>
                              <p style={{ color: "var(--text-3)" }}>{lead.jobTitle || ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium" style={{ color: "var(--text-2)" }}>{lead.companyName || "—"}</p>
                          {lead.companyWebsite && (
                            <a href={lead.companyWebsite} target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-0.5 hover:underline"
                              style={{ color: "var(--accent)" }}>
                              <Globe size={9} /> website
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2.5 space-y-0.5">
                          {lead.email && (
                            <p className="flex items-center gap-1" style={{ color: "var(--text-2)" }}>
                              <Mail size={9} style={{ color: "#f59e0b" }} />{lead.email}
                            </p>
                          )}
                          {lead.phone && (
                            <p className="flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                              <Phone size={9} />{lead.phone}
                            </p>
                          )}
                          {!lead.email && !lead.phone && (
                            <span style={{ color: "var(--text-3)" }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {(lead.country || lead.city) && (
                            <span className="flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                              <MapPin size={9} />{[lead.city, lead.country].filter(Boolean).join(", ")}
                            </span>
                          )}
                          {lead.industry && (
                            <span className="badge badge-purple text-[9px] mt-0.5">{lead.industry}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 max-w-[180px]">
                          {lead.researchNotes ? (
                            <p className="truncate text-[10px]" style={{ color: "var(--text-3)" }}
                              title={lead.researchNotes}>{lead.researchNotes}</p>
                          ) : "—"}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Empty state */}
          {status === "idle" && leads.length === 0 && (
            <div className="card p-12 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(239,68,68,0.1) 100%)" }}>
                <Target size={28} style={{ color: "#f59e0b" }} />
              </div>
              <div>
                <p className="font-semibold text-base" style={{ color: "var(--text)" }}>
                  Describe your ideal customer
                </p>
                <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
                  AI will search the web and extract real leads that match your description
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mt-2">
                {[
                  { icon: "🧠", title: "AI Query Builder", desc: "Converts your words into precision search queries" },
                  { icon: "🌐", title: "Web Search", desc: "Scans top articles, forums & directories" },
                  { icon: "✅", title: "Smart Filtering", desc: "Only genuine matches saved to your database" },
                ].map((f, i) => (
                  <div key={i} className="p-3 rounded-xl text-center"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <div className="text-2xl mb-1">{f.icon}</div>
                    <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>{f.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Live Log Panel ─────────────────────────── */}
        <div className="flex flex-col min-h-0">
          <div className="card flex flex-col overflow-hidden" style={{ height: "100%", minHeight: 300 }}>
            {/* Log header */}
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                  <div className="w-2 h-2 rounded-full"
                    style={{ background: status === "running" ? "#22c55e" : status === "done" ? "#22c55e" : status === "failed" ? "#f87171" : "var(--text-3)" }}>
                  </div>
                  {status === "running" && (
                    <div className="absolute inset-0 rounded-full animate-ping"
                      style={{ background: "#22c55e", opacity: 0.5 }} />
                  )}
                </div>
                <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                  Live Progress
                </span>
              </div>
              <div className="flex items-center gap-2">
                {status === "running" && (
                  <span className="text-[10px] animate-pulse" style={{ color: "var(--accent)" }}>Processing...</span>
                )}
                {status === "done" && (
                  <span className="badge badge-green text-[10px]">Complete</span>
                )}
                {status === "failed" && (
                  <span className="badge badge-rose text-[10px]">Failed</span>
                )}
                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{logs.length} lines</span>
              </div>
            </div>

            {/* Log body */}
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
              style={{ background: "var(--bg)", minHeight: 0 }}>
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3"
                  style={{ color: "var(--text-3)" }}>
                  <div className="text-3xl">📡</div>
                  <p className="text-xs">Awaiting pipeline start...</p>
                  <p className="text-[10px]">Live log will appear here</p>
                </div>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className="mb-0.5"
                    style={{ color: getLogStyle(line), borderLeft: line.startsWith("━") ? "none" : undefined }}>
                    {line.startsWith("━") ? (
                      <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
                    ) : line}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>

            {/* Status footer */}
            {(status === "done" || status === "failed") && (
              <div className="px-4 py-2.5 border-t flex items-center gap-2 flex-shrink-0"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                {status === "done"
                  ? <><CheckCircle2 size={13} className="text-green-400" />
                      <span className="text-xs text-green-400 font-semibold">
                        {leads.length} leads saved to Lead Database
                      </span></>
                  : <><AlertCircle size={13} className="text-red-400" />
                      <span className="text-xs text-red-400">Pipeline failed — check log above</span></>
                }
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
