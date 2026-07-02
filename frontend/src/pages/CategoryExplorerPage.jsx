import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users2, Building2, Sparkles, ArrowRight, Search,
  RefreshCw, Grid3x3, Layers, Loader2,
} from "lucide-react";
import { fpGetDatabase, fcGetDatabase, fpGetStats, fcGetStats } from "../api";

// ── LocalStorage keys (bump version to bust old cache) ─────
const LS_PEOPLE  = "doott_cat_people_v3";
const LS_COMPANY = "doott_cat_company_v3";
const BATCH_SIZE = 500;

// ── Job-title normalization ────────────────────────────────
// Strips " at Company", "- Company", "@Company", then takes
// the first 3 meaningful words to form a groupable key.
const STRIP_AT = /\s+(?:at|@|for|with|-)\s+.*/i;
const STOP_WORDS = new Set([
  "a","an","the","of","in","and","or","for","to","at","by","on","as","is","with","from",
  "senior","junior","lead","principal","associate","assistant","chief","head","global",
  "regional","national","corporate","interim","acting","part","time","full","part-time",
  "full-time","sr","jr","ii","iii","iv","i",
]);

function normalizeJobTitle(raw = "") {
  // Remove "at CompanyName" and similar suffixes
  let s = raw.replace(STRIP_AT, "").trim();
  // Remove special chars, collapse spaces
  s = s.replace(/[,;|#&*]/g, " ").replace(/\s{2,}/g, " ").trim();
  // Take first 3 words, filter stop words
  const words = s.split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 3);
  if (!words.length) return "";
  // Capitalise each word
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function normalizeIndustry(raw = "") {
  const s = raw.replace(/[,;|#&*]/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!s) return "";
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function extractCategory(record, mode) {
  if (mode === "people") {
    const raw = record.job_title || record.occupation || record.role || "";
    return normalizeJobTitle(raw);
  }
  const raw = record.industry || record.category || record.sector || record.business_type || "";
  return normalizeIndustry(raw);
}

// ── Category emoji map ─────────────────────────────────────
const EMOJI_MAP = {
  manager: "💼", management: "💼", executive: "💼", director: "💼", vp: "💼",
  engineer: "⚙️", developer: "💻", software: "💻", tech: "💻", programmer: "💻",
  sales: "📞", account: "📊", business: "💼", analyst: "📊", consultant: "🤝",
  marketing: "📣", digital: "📣", brand: "📣", media: "📺", content: "✍️",
  health: "🏥", medical: "🏥", nurse: "🏥", doctor: "🏥", pharma: "💊", clinical: "🏥",
  finance: "💰", financial: "💰", bank: "🏦", insurance: "🛡️", invest: "📈", accounting: "📊",
  real: "🏢", property: "🏢", estate: "🏢", construct: "🏗️", architect: "🏗️",
  auto: "🚗", vehicle: "🚗", motor: "🚗", automobile: "🚗",
  edu: "🎓", teacher: "🎓", professor: "🎓", school: "🎓", training: "🎓",
  legal: "⚖️", law: "⚖️", attorney: "⚖️", compliance: "⚖️",
  design: "🎨", creative: "🎨", art: "🎨", ui: "🎨", ux: "🎨",
  hr: "👥", human: "👥", talent: "👥", recruit: "👥", staffing: "👥",
  supply: "🚚", logistics: "🚚", transport: "🚚", operation: "🔧",
  customer: "🎧", support: "🎧", service: "🎧",
  project: "📋", product: "📦", program: "📋",
  research: "🔬", scientist: "🔬", data: "🗄️",
  security: "🔒", cyber: "🔐",
  retail: "🛍️", shop: "🛍️", ecommerce: "🛒",
  agri: "🌾", farm: "🌾",
  energy: "⚡", oil: "🛢️", solar: "☀️",
  telecom: "📡", network: "📡",
  ngo: "❤️", nonprofit: "❤️", charity: "❤️",
  food: "🍽️", restaurant: "🍽️", hospitality: "🏨",
};

function getEmoji(name = "") {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(EMOJI_MAP)) {
    if (lower.includes(key)) return emoji;
  }
  return "🏷️";
}

const GRADIENTS = [
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
  "linear-gradient(135deg,#4facfe,#00f2fe)",
  "linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)",
  "linear-gradient(135deg,#a18cd1,#fbc2eb)",
  "linear-gradient(135deg,#fccb90,#d57eeb)",
  "linear-gradient(135deg,#e0c3fc,#8ec5fc)",
  "linear-gradient(135deg,#f6d365,#fda085)",
  "linear-gradient(135deg,#89f7fe,#66a6ff)",
  "linear-gradient(135deg,#fddb92,#d1fdff)",
  "linear-gradient(135deg,#a1c4fd,#c2e9fb)",
  "linear-gradient(135deg,#d4fc79,#96e6a1)",
  "linear-gradient(135deg,#30cfd0,#330867)",
  "linear-gradient(135deg,#ff9a9e,#fecfef)",
];

// ── localStorage helpers ───────────────────────────────────
function lsRead(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function lsWrite(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function lsClear(key) {
  try { localStorage.removeItem(key); } catch {}
}

export default function CategoryExplorerPage() {
  const navigate = useNavigate();
  const [mode, setMode]             = useState("people");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [searchQ, setSearchQ]       = useState("");
  const abortRef = useRef(false);

  // ── Load categories (cache-first) ──────────────────────
  const loadCategories = useCallback(async (forceRefresh = false) => {
    const lsKey = mode === "people" ? LS_PEOPLE : LS_COMPANY;

    // ① Cache hit
    if (!forceRefresh) {
      const cached = lsRead(lsKey);
      if (Array.isArray(cached) && cached.length > 0) {
        setCategories(cached);
        return;
      }
    } else {
      lsClear(lsKey);
    }

    // ② Cache miss — paginate through ALL records
    setLoading(true);
    setProgress({ done: 0, total: 0 });
    abortRef.current = false;

    try {
      const statsApi = mode === "people" ? fpGetStats : fcGetStats;
      const dbApi    = mode === "people" ? fpGetDatabase : fcGetDatabase;

      // Get total row count
      const { data: statsData } = await statsApi();
      const total = statsData?.total || 0;
      setProgress({ done: 0, total });

      const freq  = {};
      let page    = 1;
      let fetched = 0;

      while (fetched < total) {
        if (abortRef.current) break;

        const { data } = await dbApi({ page, limit: BATCH_SIZE });
        const records  = data?.records || [];
        if (records.length === 0) break;

        // Extract, normalise, count — discard raw records immediately
        for (const r of records) {
          const cat = extractCategory(r, mode);
          if (!cat || cat.length < 2) continue;
          freq[cat] = (freq[cat] || 0) + 1;
        }

        fetched += records.length;
        setProgress({ done: fetched, total });
        page++;
        if (records.length < BATCH_SIZE) break;
      }

      // ③ Build sorted list — only keep categories with count ≥ 2
      //    (filters out one-off unique job titles)
      const MIN_COUNT = mode === "people" ? 2 : 1;
      const sorted = Object.entries(freq)
        .filter(([, count]) => count >= MIN_COUNT)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([name, count]) => ({ name, count }));

      // ④ Save ONLY name+count to localStorage
      lsWrite(lsKey, sorted);
      setCategories(sorted);
    } catch (err) {
      console.error("Category fetch error:", err);
    } finally {
      setLoading(false);
      setProgress({ done: 0, total: 0 });
    }
  }, [mode]);

  useEffect(() => {
    abortRef.current = true;
    setCategories([]);
    setSearchQ("");
    loadCategories(false);
    return () => { abortRef.current = true; };
  }, [loadCategories]);

  const handleCategoryClick = (cat) => {
    const enc = encodeURIComponent(cat.name);
    if (mode === "people") navigate(`/app/people?f_job_title=${enc}`);
    else                    navigate(`/app/companies?f_industry=${enc}`);
  };

  const lsKey   = mode === "people" ? LS_PEOPLE : LS_COMPANY;
  const isCached = !loading && (lsRead(lsKey)?.length ?? 0) > 0;

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(searchQ.toLowerCase())
  );

  const pct = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6 h-full">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <Grid3x3 size={22} className="text-[var(--accent)]" />
            Category Explorer
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            {loading
              ? "Building category index from full database…"
              : isCached
                ? "✅ Loaded from cache — no API call needed"
                : `Browse ${mode === "people" ? "job roles" : "industries"} from your database`}
          </p>
        </div>
        <button
          onClick={() => loadCategories(true)}
          disabled={loading}
          className="btn-ghost text-xs gap-1.5"
          title="Clear cache & re-fetch all records"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Fetching…" : "Refresh Cache"}
        </button>
      </div>

      {/* ── Toggle — People / Company ─────────────────────── */}
      <div className="flex justify-center">
        <div
          className="relative flex items-center rounded-full p-1"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", width: "fit-content" }}
        >
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="absolute top-1 bottom-1 rounded-full"
            style={{
              background: mode === "people"
                ? "linear-gradient(135deg,#667eea,#764ba2)"
                : "linear-gradient(135deg,#22d3ee,#0ea5e9)",
              left:  mode === "people" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 6px)",
              zIndex: 0,
            }}
          />
          <button
            onClick={() => setMode("people")}
            disabled={loading}
            className="relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ color: mode === "people" ? "#fff" : "var(--text-3)" }}
          >
            <Users2 size={15} /> People
          </button>
          <button
            onClick={() => setMode("company")}
            disabled={loading}
            className="relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ color: mode === "company" ? "#fff" : "var(--text-3)" }}
          >
            <Building2 size={15} /> Companies
          </button>
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="card p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-[var(--text-2)] font-medium">
                <Loader2 size={13} className="animate-spin text-[var(--accent)]" />
                Scanning all records — building category index…
              </span>
              <span className="text-[var(--text-3)] font-mono">
                {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
                {progress.total > 0 && ` · ${pct}%`}
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg,#667eea,#764ba2)" }}
                animate={{ width: `${pct}%` }}
                transition={{ ease: "linear", duration: 0.3 }}
              />
            </div>
            <p className="text-[10px] text-[var(--text-3)]">
              Only category names &amp; counts are saved to localStorage — raw records are discarded immediately.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search ─────────────────────────────────────────── */}
      {!loading && categories.length > 0 && (
        <div className="relative max-w-sm mx-auto w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            className="input pl-9 w-full text-sm"
            placeholder={`Search ${mode === "people" ? "job roles" : "industries"}…`}
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
      )}

      {/* ── Grid ───────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {!loading && filtered.length === 0 && categories.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-3)]"
          >
            <Layers size={40} className="opacity-30" />
            <p className="text-sm">No categories found.</p>
            <p className="text-xs opacity-60">Try clicking Refresh Cache to scan the full database.</p>
          </motion.div>
        ) : !loading && filtered.length > 0 ? (
          <motion.div
            key={`grid-${mode}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          >
            {filtered.map((cat, i) => (
              <motion.button
                key={cat.name}
                onClick={() => handleCategoryClick(cat)}
                whileHover={{ scale: 1.04, y: -3 }}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.5), duration: 0.2 }}
                className="relative rounded-2xl p-4 text-left overflow-hidden group cursor-pointer"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", minHeight: 110 }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                  style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                />
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-2xl"
                  style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                />
                <div className="text-2xl mb-2 leading-none">{getEmoji(cat.name)}</div>
                <p className="text-xs font-semibold text-[var(--text)] leading-snug line-clamp-2 mb-1">
                  {cat.name}
                </p>
                <p className="text-[10px] text-[var(--text-3)]">
                  {cat.count.toLocaleString()} {mode === "people" ? "people" : "companies"}
                </p>
                <div
                  className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full p-1"
                  style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                >
                  <ArrowRight size={10} color="white" />
                </div>
              </motion.button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!loading && filtered.length > 0 && (
        <p className="text-center text-[11px] text-[var(--text-3)] pb-2 flex items-center justify-center gap-1">
          <Sparkles size={10} />
          {filtered.length} categories · click any card to open filtered {mode === "people" ? "People" : "Companies"}
        </p>
      )}
    </div>
  );
}
