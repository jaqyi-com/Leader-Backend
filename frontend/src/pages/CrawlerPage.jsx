import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Upload, Tag, X, Play, Square, Clock, Wifi, WifiOff,
  Link as LinkIcon, Loader2, History, RotateCcw
} from "lucide-react";
import { startCrawlFromUrls, startCrawlFromCsv, getCrawlerLogStreamUrl } from "../api";
import toast from "react-hot-toast";


// ── Tag input for keywords ────────────────────────────────────────────────────
function KeywordInput({ tags, setTags }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !tags.some(t => t.toLowerCase() === v.toLowerCase())) setTags([...tags, v]);
    setInput("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-brand-500/40 focus-within:border-brand-500 transition-all min-h-[44px]">
      {tags.map((t, i) => (
        <span key={i} className="flex items-center gap-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-md text-xs font-semibold">
          <Tag size={10} />
          {t}
          <button onClick={() => setTags(tags.filter((_, j) => j !== i))}><X size={10} /></button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        className="flex-1 min-w-[160px] bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
        placeholder={tags.length === 0 ? "Type and press Enter..." : "Add more..."}
      />
    </div>
  );
}

// ── Log line renderer ─────────────────────────────────────────────────────────
function LogLine({ line }) {
  const lower = line.toLowerCase();
  let cls = "text-slate-400";
  if (lower.includes("error") || lower.includes("fail")) cls = "text-red-400";
  else if (lower.includes("warn")) cls = "text-yellow-400";
  else if (lower.includes("done") || lower.includes("success") || lower.includes("✓")) cls = "text-emerald-400";
  else if (lower.includes("info") || lower.includes("[api]")) cls = "text-sky-400";
  return <div className={`font-mono text-xs leading-5 ${cls}`}>{line}</div>;
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ running, connected }) {
  if (running) return (
    <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
      <Loader2 size={12} className="animate-spin" /> Running
    </span>
  );
  if (connected) return (
    <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
      <Wifi size={12} /> Connected
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-gray-800 text-slate-500">
      <WifiOff size={12} /> Idle
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CrawlerPage() {
  // Input state
  const [mode, setMode] = useState("urls"); // "urls" | "csv"
  const [urlsText, setUrlsText] = useState(""); // newline-separated URLs
  const [csvFile, setCsvFile] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [customFields, setCustomFields] = useState([]);

  // Runtime state
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [crawlStats, setCrawlStats] = useState({ current: null, done: 0, failed: 0, total: 0, finished: false });
  const evtRef = useRef(null);
  const timerRef = useRef(null);
  // logEndRef kept for possible future use but logs are not displayed to user
  const logEndRef = useRef(null);

  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("crawler_history") || "[]");
      setHistoryList(stored);
    } catch (e) {}
  }, []);

  const saveHistory = (payload) => {
    setHistoryList(prev => {
      const updated = [{ ...payload, timestamp: Date.now() }, ...prev].slice(0, 10);
      localStorage.setItem("crawler_history", JSON.stringify(updated));
      return updated;
    });
  };

  // ── SSE connection ──────────────────────────────────────────────────────────
  useEffect(() => {
    const url = getCrawlerLogStreamUrl();
    const evt = new EventSource(url);
    evtRef.current = evt;

    evt.onopen = () => setConnected(true);
    evt.onmessage = (e) => {
      const line = e.data;
      // Parse log line to extract stats (never shown to user)
      setCrawlStats(prev => {
        const next = { ...prev };
        const urlMatch = line.match(/Fetching HTML:\s*(https?:\/\/[^\s]+)/);
        if (urlMatch) next.current = urlMatch[1];
        if (line.includes('[BUILDER] Building record')) next.done = prev.done + 1;
        if (line.includes('Fetch failed') || line.includes('fetch_failed')) next.failed = prev.failed + 1;
        if (line.includes('Pipeline complete') || line.includes('[DONE]') || line.includes('Finished')) {
          next.finished = true;
          next.current = null;
        }
        return next;
      });
      if (line.includes('Pipeline complete') || line.includes('[DONE]') || line.includes('Finished')) {
        setRunning(false);
        clearInterval(timerRef.current);
      }
    };
    evt.onerror = () => {
      setConnected(false);
      evt.close();
    };

    return () => {
      evt.close();
      clearInterval(timerRef.current);
    };
  }, []);

  // logs are processed internally for stats only — not shown to the user

  // ── Timer ───────────────────────────────────────────────────────────────────
  const startTimer = () => {
    const t0 = Date.now();
    setStartTime(t0);
    setElapsed(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
  };

  // ── Start URL list crawl ─────────────────────────────────────────────────────
  const handleUrlsCrawl = async () => {
    const urls = urlsText
      .split("\n")
      .map(u => u.trim())
      .filter(Boolean);
    if (!urls.length || running) return;
    setCrawlStats({ current: null, done: 0, failed: 0, total: 0, finished: false });
    setRunning(true);
    startTimer();
    try {
      await startCrawlFromUrls(urls, keywords, customFields);
      saveHistory({ mode: "urls", urlsText, keywords, customFields, count: urls.length });
      toast.success(`Crawl started for ${urls.length} URLs!`);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || "Failed to start crawl";
      toast.error(msg);
      setRunning(false);
      clearInterval(timerRef.current);
    }
  };

  // ── Start CSV crawl ─────────────────────────────────────────────────────────
  const handleCsvCrawl = async () => {
    if (!csvFile || running) return;
    setCrawlStats({ current: null, done: 0, failed: 0, total: 0, finished: false });
    setRunning(true);
    startTimer();
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("keywords", JSON.stringify(keywords));
      formData.append("customFields", JSON.stringify(customFields));
      await startCrawlFromCsv(formData);
      saveHistory({ mode: "csv", filename: csvFile.name, keywords, customFields, count: 1 });
      toast.success("CSV crawl started!");
    } catch (e) {
      const msg = e.response?.data?.error || e.message || "Failed to start CSV crawl";
      toast.error(msg);
      setRunning(false);
      clearInterval(timerRef.current);
    }
  };

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe size={22} className="text-brand-500" /> Website Crawler
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Crawl websites by pasting URLs or uploading a CSV file — extracts tech stack, contacts, emails &amp; more.
          </p>
        </div>
        <div className="flex items-center gap-3 relative z-50">
          <button onClick={() => setShowHistory(!showHistory)} className="btn-secondary gap-2 relative h-8 px-3 text-xs">
            <History size={14} /> History
            {historyList.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-brand-500 text-[8px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
                {historyList.length}
              </span>
            )}
          </button>
          <StatusPill running={running} connected={connected} />
          
          {/* History Dropdown */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-[340px] z-[100] glass-card p-2 shadow-xl border border-slate-200/50 dark:border-slate-700/50"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <RotateCcw size={12} /> Crawl History
                  </h4>
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <X size={14} />
                  </button>
                </div>
                <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {historyList.length === 0 ? (
                    <p className="text-xs text-center text-slate-400 py-4">No recent crawls</p>
                  ) : (
                    historyList.map((item, idx) => (
                      <div key={idx} className="group relative flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:border-brand-200 dark:hover:border-brand-800 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-slate-700 dark:text-slate-200 truncate">
                            {item.mode === "csv" ? `CSV: ${item.filename}` : `URLs (${item.count})`}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                            <span>{new Date(item.timestamp).toLocaleString()}</span>
                            {item.keywords?.length > 0 && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                                <span>{item.keywords.length} keywords</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => { 
                            setMode(item.mode);
                            if (item.mode === "urls") setUrlsText(item.urlsText || "");
                            setKeywords(item.keywords || []);
                            setCustomFields(item.customFields || []);
                            setShowHistory(false); 
                          }}
                          className="btn-secondary h-7 w-7 !p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Load Parameters"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="glass-card p-1 inline-flex gap-1 self-start">
        {[
          { id: "urls",  label: "Paste URLs",   icon: LinkIcon },
          { id: "csv",   label: "Upload CSV",   icon: Upload },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setMode(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
              mode === id
                ? "bg-brand-500 text-white shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800"
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Config Card */}
      <motion.div
        layout
        className="glass-card p-6 space-y-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <AnimatePresence mode="wait">
          {mode === "urls" ? (
            <motion.div key="urls" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Website URLs
                </label>
                <textarea
                  className="input font-mono text-sm w-full min-h-[120px] resize-y"
                  placeholder={"https://example.com\nhttps://shopify.com\nhttps://vercel.com"}
                  value={urlsText}
                  onChange={e => setUrlsText(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-1">One URL per line. Protocols (http/https) are added automatically.</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="csv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  CSV File
                </label>
                <label className={`flex items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                  csvFile
                    ? "border-brand-400 bg-brand-50 dark:bg-brand-900/20"
                    : "border-slate-200 dark:border-gray-700 hover:border-brand-300 hover:bg-slate-50 dark:hover:bg-gray-800/60"
                }`}>
                  <Upload size={20} className={csvFile ? "text-brand-500" : "text-slate-400"} />
                  <div className="text-center">
                    {csvFile ? (
                      <>
                        <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">{csvFile.name}</p>
                        <p className="text-xs text-slate-400">{(csvFile.size / 1024).toFixed(1)} KB</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Click to choose a CSV</p>
                        <p className="text-xs text-slate-400">Must contain a <code className="font-mono">url</code> column</p>
                      </>
                    )}
                  </div>
                  <input type="file" accept=".csv" className="hidden" onChange={e => setCsvFile(e.target.files[0])} />
                </label>
                {csvFile && (
                  <button onClick={() => setCsvFile(null)} className="text-xs text-slate-400 hover:text-red-500 mt-1 flex items-center gap-1">
                    <X size={11} /> Remove file
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keywords */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Filter Keywords <span className="font-normal text-slate-400 normal-case">(optional)</span>
          </label>
          <KeywordInput tags={keywords} setTags={setKeywords} />
          <p className="text-xs text-slate-400 mt-1">Only crawl sites matching these keywords. Leave empty to crawl all.</p>
        </div>

        {/* Quick keyword presets */}
        <div className="flex gap-2 flex-wrap pb-4 border-b border-slate-100 dark:border-gray-800">
          {["ai", "saas", "fintech", "robotics", "cloud", "b2b"].map(kw => (
            <button key={kw} onClick={() => { if (!keywords.some(k => k.toLowerCase() === kw.toLowerCase())) setKeywords([...keywords, kw]); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                keywords.some(k => k.toLowerCase() === kw.toLowerCase())
                  ? "bg-brand-500 text-white border-brand-500"
                  : "border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-brand-400"
              }`}>
              {kw}
            </button>
          ))}
        </div>

        {/* Custom Fields */}
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-2">
            Dynamic Fields <span className="px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 text-[10px] font-bold">AI Extracted</span>
          </label>
          <KeywordInput tags={customFields} setTags={setCustomFields} />
          <p className="text-xs text-slate-400 mt-1">Add custom data points to extract (e.g. "LinkedIn URL", "Pricing Model", "Founder Name").</p>
        </div>

        {/* Run Button */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-gray-800">
          <button
            onClick={mode === "urls" ? handleUrlsCrawl : handleCsvCrawl}
            disabled={running || (mode === "urls" ? !urlsText.trim() : !csvFile)}
            className="btn-primary"
          >
            {running ? <><Loader2 size={15} className="animate-spin" /> Running...</> : <><Play size={15} /> Start Crawl</>}
          </button>
          {running && (
            <span className="flex items-center gap-1.5 text-sm font-mono text-slate-500 dark:text-slate-400">
              <Clock size={13} /> {fmt(elapsed)}
            </span>
          )}
        </div>
      </motion.div>

      {/* Processing Status Card */}
      <AnimatePresence mode="wait">
        {(running || crawlStats.finished) && (
          <motion.div
            key={crawlStats.finished ? 'done' : 'running'}
            className="glass-card overflow-hidden"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            {running ? (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-brand-500/10">
                      <Loader2 size={18} className="animate-spin text-brand-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white text-sm">Crawling in progress</p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Clock size={10} /> {fmt(elapsed)} elapsed</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Running</span>
                </div>

                {/* Animated progress bar */}
                <div className="w-full h-1.5 bg-slate-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-brand-500 to-violet-500 rounded-full"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                    style={{ width: "50%" }}
                  />
                </div>

                {/* Current URL */}
                {crawlStats.current && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-gray-800/50 border border-slate-100 dark:border-gray-700">
                    <Globe size={13} className="text-brand-500 flex-shrink-0" />
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">{crawlStats.current}</span>
                  </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[{label:'Processed', val: crawlStats.done, color:'text-emerald-600 dark:text-emerald-400', bg:'bg-emerald-50 dark:bg-emerald-900/20'},
                    {label:'Failed',    val: crawlStats.failed, color:'text-red-500',                          bg:'bg-red-50 dark:bg-red-900/20'},
                    {label:'Elapsed',   val: fmt(elapsed),        color:'text-brand-500',                        bg:'bg-brand-50 dark:bg-brand-900/20'},
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                      <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Completion Card */
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                    <Square size={18} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-white text-sm">Crawl complete!</p>
                    <p className="text-xs text-slate-400 mt-0.5">Results saved to Website Intel</p>
                  </div>
                  <button onClick={() => setCrawlStats({ current: null, done: 0, failed: 0, total: 0, finished: false })} className="ml-auto text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{crawlStats.done}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Successfully crawled</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-500">{crawlStats.failed}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Failed / unreachable</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
