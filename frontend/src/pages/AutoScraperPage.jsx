import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, MapPin, Play, X, Loader2, CheckCircle2,
  AlertCircle, Navigation, Globe2, Clock,
  Database, ArrowRight, RefreshCw, SlidersHorizontal,
  Tag, Briefcase, Search, Wand2, ChevronDown,
} from "lucide-react";
import { startAutoScraper, autocompleteLocation, geocodeLocation, getAutoScraperSessions, analyzeScraperDescription } from "../api";
import toast from "react-hot-toast";

const CRAWLER_API_URL = import.meta.env.VITE_CRAWLER_API_URL || "http://localhost:3001/api/crawler";
const AUTO_SCRAPER_SSE = `${CRAWLER_API_URL}/auto-scraper`;

// ── Reusable ICP-style Tag Input ─────────────────────────────
function TagSection({ icon: Icon, title, description, color, tags, setTags, placeholder, suggestions = [] }) {
  const [input, setInput] = useState("");
  const [showSugg, setShowSugg] = useState(false);
  const inputRef = useRef(null);

  const add = (val) => {
    const v = (val || input).trim();
    if (v && !tags.includes(v)) setTags(prev => [...prev, v]);
    setInput("");
    setShowSugg(false);
  };

  const filtered = suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s) && input.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={12} className="text-white" />
        </div>
        <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">{title}</span>
        {tags.length > 0 && <span className="text-[10px] badge badge-purple">{tags.length}</span>}
      </div>
      {description && <p className="text-[11px] text-[var(--text-3)]">{description}</p>}
      <div
        className="relative bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-2.5 flex flex-wrap gap-1.5 min-h-[46px] cursor-text focus-within:border-[var(--accent)] transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map(t => (
          <span key={t} className="flex items-center gap-1 badge badge-purple text-xs">
            {t}
            <button onClick={e => { e.stopPropagation(); setTags(p => p.filter(x => x !== t)); }}
              className="hover:text-white ml-0.5"><X size={9} /></button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-3)]"
          placeholder={tags.length ? "Type and press enter..." : placeholder}
          value={input}
          onChange={e => { setInput(e.target.value); setShowSugg(true); }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            if (e.key === "Backspace" && !input) setTags(p => p.slice(0, -1));
          }}
          onBlur={() => setTimeout(() => { add(); setShowSugg(false); }, 150)}
        />
        <AnimatePresence>
          {showSugg && filtered.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute top-full left-0 mt-1 w-full z-50 card p-1 shadow-2xl">
              {filtered.slice(0, 6).map(s => (
                <button key={s} onMouseDown={() => add(s)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] flex items-center gap-2">
                  <Tag size={10} className="text-[var(--accent)]" /> {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── LocationInput ────────────────────────────────────────────
function LocationInput({ value, onChange, onCoordsChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);

  const handleInput = (v) => {
    onChange(v, null, null);
    clearTimeout(debounceRef.current);
    if (v.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await autocompleteLocation(v);
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch {} finally { setLoading(false); }
    }, 350);
  };

  const selectSuggestion = async (s) => {
    onChange(s.description, null, null);
    setSuggestions([]); setShowSuggestions(false);
    try {
      const { data } = await geocodeLocation(s.description);
      if (data?.lat && data?.lng) { onChange(s.description, data.lat, data.lng); onCoordsChange(data.lat, data.lng, s.description); }
    } catch {}
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        onChange(`${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng);
        onCoordsChange(lat, lng, null); setGeoLoading(false);
        toast.success("Location detected");
      },
      () => { toast.error("Could not get location"); setGeoLoading(false); }
    );
  };

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <MapPin size={14} className="absolute left-3.5 text-[var(--text-3)] pointer-events-none" />
        <input
          className="input pl-9 pr-28 w-full text-sm"
          placeholder="City, region, or country (optional)"
          value={value}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => suggestions.length && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        />
        <div className="absolute right-2 flex items-center gap-1">
          {loading && <Loader2 size={12} className="animate-spin text-[var(--text-3)]" />}
          {value && <button onClick={() => { onChange("", null, null); onCoordsChange(null, null, null); }} className="text-[var(--text-3)] hover:text-[var(--text)] p-0.5"><X size={12} /></button>}
          <button onClick={useMyLocation} disabled={geoLoading}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline disabled:opacity-50 px-1.5 py-1 rounded-lg hover:bg-[var(--accent)]/10">
            {geoLoading ? <Loader2 size={11} className="animate-spin" /> : <Navigation size={11} />} My Location
          </button>
        </div>
      </div>
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 top-full mt-1 w-full card p-1 shadow-2xl">
            {suggestions.map(s => (
              <button key={s.place_id} onMouseDown={() => selectSuggestion(s)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] flex items-center gap-2">
                <MapPin size={12} className="text-[var(--text-3)] flex-shrink-0" /> {s.description}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── LiveLog ──────────────────────────────────────────────────
function LiveLog({ logs, status }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  return (
    <div className="card bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
        <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${status === "running" ? "bg-amber-400 animate-pulse" : status === "done" ? "bg-emerald-400" : "bg-rose-400"}`} />
          Live Progress
        </span>
        <span className="text-[11px] text-[var(--text-3)]">{logs.length} events</span>
      </div>
      <div className="h-64 overflow-y-auto p-4 font-mono text-xs space-y-1.5">
        {logs.length === 0 && <p className="text-[var(--text-3)] italic">Waiting for logs...</p>}
        {logs.map((log, i) => (
          <motion.p key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
            className={`leading-relaxed ${
              log.includes("✅") || log.includes("🎉") ? "text-[var(--emerald)]"
              : log.includes("❌") ? "text-[var(--rose)]"
              : log.includes("⚠") ? "text-amber-400"
              : log.includes("Phase") || log.includes("▶") ? "text-[var(--accent)] font-semibold"
              : "text-[var(--text-2)]"
            }`}>
            {log}
          </motion.p>
        ))}
        <div ref={bottomRef} />
      </div>
      {(status === "done" || status === "failed") && (
        <div className={`px-4 py-3 border-t border-[var(--border)] flex items-center gap-2 text-sm font-semibold ${status === "done" ? "text-[var(--emerald)]" : "text-[var(--rose)]"}`}>
          {status === "done" ? <><CheckCircle2 size={16} /> Pipeline complete! Check Website Intelligence for results.</> : <><AlertCircle size={16} /> Pipeline failed. Check logs above.</>}
        </div>
      )}
    </div>
  );
}

// ── SessionCard ──────────────────────────────────────────────
function SessionCard({ session, index }) {
  const map = { done: "badge badge-green", failed: "badge badge-rose", discovering: "badge badge-amber", crawling: "badge badge-amber", filtering: "badge badge-amber" };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
      className="card p-4 flex items-center gap-4">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent)] to-violet-500 flex items-center justify-center flex-shrink-0">
        <Sparkles size={15} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[var(--text)] text-sm">{session.keyword}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-3)]">
          {session.location && <span className="flex items-center gap-0.5"><MapPin size={9} /> {session.location}</span>}
          <Clock size={9} /> {new Date(session.createdAt).toLocaleString()}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-xs">
        <span className="text-[var(--text-3)]">{session.urlsFound} URLs · {session.leadsFound} leads</span>
        <span className={map[session.status] || "badge badge-amber"}>{session.status}</span>
      </div>
    </motion.div>
  );
}

// ── Suggestion pools ─────────────────────────────────────────
const INDUSTRY_SUGGESTIONS = [
  "SaaS", "fintech", "healthcare", "e-commerce", "logistics", "manufacturing",
  "real estate", "edtech", "legal tech", "HR tech", "cybersecurity", "AI startup",
  "robotics", "biotech", "retail", "insurance", "construction", "media agency",
];
const PERSONA_SUGGESTIONS = [
  "CTO", "CEO", "VP Engineering", "Head of Product", "Director of Marketing",
  "Founder", "Co-founder", "VP Sales", "Chief Revenue Officer", "Engineering Manager",
  "Head of Growth", "CMO", "CFO", "Director of Operations",
];

// ── Main Page ─────────────────────────────────────────────────
export default function AutoScraperPage() {
  const [industryKeywords, setIndustryKeywords] = useState([]);
  const [targetPersonas, setTargetPersonas]     = useState([]);

  // AI natural language mode
  const [aiDescription, setAiDescription]   = useState("");
  const [aiAnalyzing, setAiAnalyzing]       = useState(false);
  const [aiRationale, setAiRationale]       = useState("");
  const [showManual, setShowManual]         = useState(false);

  const analyzeWithAI = async () => {
    if (!aiDescription.trim()) { toast.error("Please describe what businesses you're looking for"); return; }
    setAiAnalyzing(true); setAiRationale("");
    try {
      const { data } = await analyzeScraperDescription(aiDescription);
      if (data.industryKeywords?.length) setIndustryKeywords(data.industryKeywords);
      if (data.targetPersonas?.length)   setTargetPersonas(data.targetPersonas);
      if (data.suggestedLocation && !locationText) setLocationText(data.suggestedLocation);
      if (data.rationale)                setAiRationale(data.rationale);
      setShowManual(true);
      toast.success("AI extracted your search profile! Review and adjust below.");
    } catch (err) {
      toast.error(err.response?.data?.error || "Analysis failed. Please try again.");
    } finally { setAiAnalyzing(false); }
  };

  const [locationText, setLocationText] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [radius, setRadius] = useState(10);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [pipelineStatus, setPipelineStatus] = useState("idle");
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const sseRef = useRef(null);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const { data } = await getAutoScraperSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch {} finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleLocationChange = (text, newLat, newLng) => {
    setLocationText(text); setLat(newLat); setLng(newLng);
  };

  const handleStart = async () => {
    if (!industryKeywords.length) { toast.error("Add at least one Industry Keyword"); return; }
    setRunning(true); setLogs([]); setPipelineStatus("running");

    try {
      const body = {
        industryKeywords,
        targetPersonas,
        location: locationText || null,
      };
      if (lat && lng) { body.lat = lat; body.lng = lng; body.radius = radius * 1000; }

      const { data } = await startAutoScraper(body);

      if (sseRef.current) sseRef.current.close();
      const es = new EventSource(`${AUTO_SCRAPER_SSE}/status/${data.sessionId}`);
      sseRef.current = es;

      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.log) setLogs(prev => [...prev, msg.log]);
        if (msg.status === "done" || msg.status === "failed") {
          setPipelineStatus(msg.status); setRunning(false); es.close(); loadSessions();
          if (msg.status === "done") toast.success("Auto scraper completed!");
          else toast.error("Pipeline failed. See logs.");
        }
      };
      es.onerror = () => { setPipelineStatus("failed"); setRunning(false); es.close(); };
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to start pipeline");
      setRunning(false); setPipelineStatus("idle");
    }
  };

  useEffect(() => () => sseRef.current?.close(), []);

  const canStart = industryKeywords.length > 0 && !running;
  const locationSet = !!(lat && lng);
  const totalKeywords = industryKeywords.length + targetPersonas.length;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Sparkles size={22} className="text-[var(--accent)]" /> Auto Scraper
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Define your Ideal Customer Profile → discover matching companies → crawl and save leads automatically
        </p>
      </div>

      {/* Pipeline Flow */}
      <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] font-medium flex-wrap">
        <span className="badge badge-purple">AI Analysis</span>
        <ArrowRight size={10} />
        <span className="badge badge-purple">Smart Query Builder</span>
        <ArrowRight size={10} />
        <span className="badge badge-purple">Google {locationSet ? "Places" : "Search"}</span>
        <ArrowRight size={10} />
        <span className="badge badge-purple">Web Crawler</span>
        <ArrowRight size={10} />
        <span className="badge badge-green">Leads (DB)</span>
      </div>

      {/* ── AI Natural Language Input ── */}
      <motion.div className="card p-6 space-y-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
            <Wand2 size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text)]">Describe Your Target in Plain English</h3>
            <p className="text-[11px] text-[var(--text-3)]">AI will analyze your description and auto-fill the search profile below</p>
          </div>
        </div>

        <div className="relative">
          <textarea
            className="input w-full text-sm resize-none"
            rows={3}
            placeholder='e.g. "I need details of businesses that need a CRM tool — small retail shops and service companies still managing customers in Excel or spreadsheets"'
            value={aiDescription}
            onChange={e => setAiDescription(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) analyzeWithAI(); }}
            style={{ paddingRight: 120 }}
          />
          <button
            onClick={analyzeWithAI}
            disabled={aiAnalyzing || !aiDescription.trim()}
            className="absolute right-2 bottom-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,var(--accent),#8b5cf6)", color: "white" }}
          >
            {aiAnalyzing ? <><Loader2 size={12} className="animate-spin" /> Analyzing...</> : <><Wand2 size={12} /> Analyze with AI</>}
          </button>
        </div>

        {/* AI Rationale */}
        <AnimatePresence>
          {aiRationale && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 flex items-start gap-2">
              <Sparkles size={13} className="text-violet-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-[var(--text-2)]">{aiRationale}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle to show/hide manual sections */}
        {(industryKeywords.length > 0 || showManual) && (
          <button
            onClick={() => setShowManual(p => !p)}
            className="flex items-center gap-1.5 text-xs text-[var(--accent)] font-semibold hover:underline"
          >
            <ChevronDown size={13} className={`transition-transform ${showManual ? "rotate-180" : ""}`} />
            {showManual ? "Hide" : "Review & Edit"} extracted profile ({industryKeywords.length + targetPersonas.length} keywords)
          </button>
        )}
      </motion.div>

      {/* ICP Keyword Config — shown after AI analysis or manually */}
      <AnimatePresence>
      {(showManual || (!aiDescription && industryKeywords.length === 0)) && (
      <motion.div className="card p-6 space-y-6" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--text)]">Target Profile Keywords</h3>
            <p className="text-[11px] text-[var(--text-3)] mt-0.5">These are combined to build highly accurate search queries</p>
          </div>
          {totalKeywords > 0 && (
            <span className="badge badge-green text-[11px]">
              ✓ {totalKeywords} keyword{totalKeywords !== 1 ? "s" : ""} configured
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Industry Keywords */}
          <TagSection
            icon={Search}
            title="Industry / Business Type"
            description="What industry or company type are you targeting? (Required)"
            color="bg-violet-500"
            tags={industryKeywords}
            setTags={setIndustryKeywords}
            placeholder="e.g. SaaS, fintech, healthcare..."
            suggestions={INDUSTRY_SUGGESTIONS}
          />

          {/* Target Personas */}
          <TagSection
            icon={Briefcase}
            title="Target Personas / Job Titles"
            description="Who are you trying to reach? Narrows search to relevant companies. (Optional)"
            color="bg-emerald-500"
            tags={targetPersonas}
            setTags={setTargetPersonas}
            placeholder="e.g. CTO, VP Engineering, Founder..."
            suggestions={PERSONA_SUGGESTIONS}
          />
        </div>

        {/* Smart Query Preview */}
        {industryKeywords.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3">
            <p className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Search size={10} className="text-[var(--accent)]" /> Search Query Preview
            </p>
            <p className="text-xs font-mono text-[var(--accent)] break-all">
              "{industryKeywords.join(" OR ")}
              {targetPersonas.length ? ` + hiring ${targetPersonas[0]}` : ""}"
            </p>
          </motion.div>
        )}
      </motion.div>
      )}
      </AnimatePresence>

      {/* Location + Radius */}
      <motion.div className="card p-6 space-y-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2 flex items-center gap-2">
            Location
            <span className="font-normal normal-case text-[var(--text-3)]">(optional — uses Google Places if provided)</span>
            {locationSet && <span className="badge badge-green text-[10px]">📍 Coords set</span>}
          </label>
          <LocationInput value={locationText} onChange={handleLocationChange} onCoordsChange={(lat, lng) => { setLat(lat); setLng(lng); }} />
          <p className="text-[11px] text-[var(--text-3)] mt-1.5">
            {locationSet
              ? `✅ Location resolved to (${lat?.toFixed(4)}, ${lng?.toFixed(4)}) — will use Google Places Nearby`
              : "Without location, Google Places Text Search is used to find companies globally."}
          </p>
        </div>

        <AnimatePresence>
          {locationSet && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider flex items-center gap-2">
                    <SlidersHorizontal size={12} className="text-[var(--accent)]" /> Search Radius
                  </label>
                  <span className="text-sm font-bold text-[var(--accent)] tabular-nums">{radius} km</span>
                </div>
                <input type="range" min={1} max={150} step={1} value={radius} onChange={e => setRadius(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(radius - 1) / 149 * 100}%, var(--surface) ${(radius - 1) / 149 * 100}%, var(--surface) 100%)` }}
                />
                <div className="flex justify-between text-[10px] text-[var(--text-3)] px-0.5">
                  <span>1 km</span><span>50 km</span><span>100 km</span><span>150 km</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={handleStart} disabled={!canStart}
          className="btn-primary w-full gap-2 py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed">
          {running ? <><Loader2 size={16} className="animate-spin" /> Pipeline running...</> : <><Play size={16} /> Start Pipeline</>}
        </button>
      </motion.div>

      {/* Live Log */}
      <AnimatePresence>
        {(running || pipelineStatus === "done" || pipelineStatus === "failed") && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <LiveLog logs={logs} status={pipelineStatus} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Past Sessions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text-2)] flex items-center gap-2">
            <Database size={14} className="text-[var(--accent)]" /> Past Sessions
          </h3>
          <button onClick={loadSessions} disabled={sessionsLoading} className="btn-ghost text-xs gap-1 px-2 py-1.5">
            <RefreshCw size={11} className={sessionsLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        {sessionsLoading ? (
          <div className="card p-6 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[var(--accent)]" /></div>
        ) : sessions.length === 0 ? (
          <div className="card p-8 text-center">
            <Globe2 size={32} className="text-[var(--text-3)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-3)]">No sessions yet. Start your first pipeline above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s, i) => <SessionCard key={s.sessionId} session={s} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}
