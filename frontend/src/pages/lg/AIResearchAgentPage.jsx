import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Play, Loader2, CheckCircle2, AlertCircle, Sparkles, Database, Send, ChevronRight } from "lucide-react";
import { lgResearchStart, BACKEND_ROOT } from "../../api";
import toast from "react-hot-toast";


const EXAMPLE_PROMPTS = [
  "Find me 15 B2B SaaS companies in India with 50-200 employees that are hiring a Head of Sales",
  "I need 20 fintech startups in Europe that raised Series A in the last 2 years",
  "Find healthcare technology companies in the USA with under 100 employees that need a CRM",
  "Discover 10 manufacturing companies in Germany that are adopting AI and automation",
  "Find retail e-commerce companies in Southeast Asia with a growing engineering team",
];

export default function AIResearchAgentPage() {
  const [prompt, setPrompt]         = useState("");
  const [running, setRunning]       = useState(false);
  const [sessionId, setSessionId]   = useState(null);
  const [logs, setLogs]             = useState([]);
  const [status, setStatus]         = useState("idle");
  const [leads, setLeads]           = useState([]);
  const sseRef                      = useRef(null);
  const logsBottomRef               = useRef(null);

  useEffect(() => { logsBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  useEffect(() => () => sseRef.current?.close(), []);

  const startResearch = async () => {
    if (!prompt.trim()) { toast.error("Enter a research prompt"); return; }
    setRunning(true); setLogs([]); setLeads([]); setStatus("running");

    try {
      const { data } = await lgResearchStart(prompt);
      setSessionId(data.sessionId);

      if (sseRef.current) sseRef.current.close();
      const es = new EventSource(`${BACKEND_ROOT}/api/lead-generator/research/status/${data.sessionId}`);
      sseRef.current = es;

      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.log) setLogs(prev => [...prev, msg.log]);
        if (msg.status === "done" || msg.status === "failed") {
          setStatus(msg.status);
          setRunning(false);
          es.close();
          if (msg.leads?.length) setLeads(msg.leads);
          if (msg.status === "done") toast.success(`Research complete! ${msg.leads?.length || 0} leads saved.`);
          else toast.error("Research failed. Check logs.");
        }
      };
      es.onerror = () => { setStatus("failed"); setRunning(false); es.close(); };
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to start research");
      setRunning(false); setStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Bot size={22} className="text-[var(--accent)]" /> AI Research Agent
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">Describe your ideal prospect in plain English — the agent autonomously finds and enriches leads</p>
      </div>

      {/* Prompt Input */}
      <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent)] to-violet-600 flex items-center justify-center">
            <Bot size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text)]">Research Prompt</p>
            <p className="text-[11px] text-[var(--text-3)]">Describe the type of businesses you want leads for</p>
          </div>
        </div>
        <div className="relative">
          <textarea
            className="input w-full text-sm resize-none"
            rows={4}
            placeholder='e.g. "Find me 20 B2B SaaS companies in India with 50-200 employees that are hiring a Head of Sales and likely need a CRM tool"'
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={running}
          />
        </div>

        {/* Example prompts */}
        <div>
          <p className="text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-2">Try an example:</p>
          <div className="space-y-1">
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button key={i} onClick={() => setPrompt(ex)} disabled={running}
                className="w-full text-left text-[11px] text-[var(--text-3)] hover:text-[var(--accent)] flex items-center gap-1.5 group py-0.5">
                <ChevronRight size={9} className="text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                {ex}
              </button>
            ))}
          </div>
        </div>

        <button onClick={startResearch} disabled={running || !prompt.trim()}
          className="btn-primary w-full gap-2 py-3 text-sm font-bold disabled:opacity-40">
          {running ? <><Loader2 size={16} className="animate-spin" /> Agent is researching...</> : <><Play size={16} /> Start Research Agent</>}
        </button>
      </motion.div>

      {/* Pipeline steps visualization */}
      {status !== "idle" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-[11px] text-[var(--text-3)] font-medium flex-wrap">
          {["Analyze Prompt", "Plan Research", "Find Companies", "Get Contacts", "Save to DB"].map((step, i) => (
            <span key={step} className="flex items-center gap-1.5">
              <span className={`badge ${status === "done" ? "badge-green" : status === "failed" ? "badge-rose" : "badge-amber"}`}>{step}</span>
              {i < 4 && <ChevronRight size={9} />}
            </span>
          ))}
        </motion.div>
      )}

      {/* Live Logs */}
      <AnimatePresence>
        {(running || status === "done" || status === "failed") && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }}
            className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
              <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${running ? "bg-amber-400 animate-pulse" : status === "done" ? "bg-emerald-400" : "bg-rose-400"}`} />
                Agent Log
              </span>
              <span className="text-[11px] text-[var(--text-3)]">{logs.length} events</span>
            </div>
            <div className="h-52 overflow-y-auto p-4 font-mono text-xs space-y-1">
              {logs.map((log, i) => (
                <p key={i} className={`leading-relaxed ${
                  log.includes("✅") || log.includes("🎉") ? "text-[var(--emerald)]"
                  : log.includes("❌") ? "text-[var(--rose)]"
                  : log.includes("⚠") ? "text-amber-400"
                  : log.startsWith("▶") || log.startsWith("🧠") ? "text-[var(--accent)] font-semibold"
                  : "text-[var(--text-2)]"
                }`}>{log}</p>
              ))}
              <div ref={logsBottomRef} />
            </div>
            {status === "done" && (
              <div className="px-4 py-3 border-t border-[var(--border)] flex items-center gap-2 text-sm font-semibold text-[var(--emerald)]">
                <CheckCircle2 size={16} /> Research complete! {leads.length} leads saved to your Lead Database.
              </div>
            )}
            {status === "failed" && (
              <div className="px-4 py-3 border-t border-[var(--border)] flex items-center gap-2 text-sm font-semibold text-[var(--rose)]">
                <AlertCircle size={16} /> Agent encountered an error. Check logs above.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lead Preview */}
      {leads.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--text-2)] flex items-center gap-2">
              <Database size={14} className="text-[var(--accent)]" /> Generated Leads Preview
            </h3>
            <span className="badge badge-green">{leads.length} leads saved</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {leads.slice(0, 6).map((lead, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                className="card p-3 space-y-1">
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <p className="font-semibold text-[var(--text)] text-sm">{lead.fullName}</p>
                    <p className="text-[11px] text-[var(--accent)]">{lead.jobTitle}</p>
                  </div>
                  <span className="badge badge-purple text-[9px] flex-shrink-0">{lead.industry}</span>
                </div>
                <p className="text-[11px] text-[var(--text-2)]">🏢 {lead.companyName}</p>
                {lead.email && <p className="text-[11px] text-[var(--text-3)]">✉ {lead.email}</p>}
              </motion.div>
            ))}
          </div>
          {leads.length > 6 && (
            <p className="text-center text-xs text-[var(--text-3)]">+{leads.length - 6} more leads in the Lead Database →</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
