import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users2, Building2, Sparkles, ArrowRight, Search,
  RefreshCw, Grid3x3, Layers,
} from "lucide-react";
import { fpGetDatabase, fcGetDatabase } from "../api";

// ── Category icons mapping (emoji per keyword) ──────────────
const CATEGORY_EMOJI = {
  auto: "🚗", car: "🚗", motor: "🚗", vehicle: "🚗",
  health: "🏥", medical: "🏥", pharma: "💊", hospital: "🏥", clinic: "🏥",
  tech: "💻", software: "💻", it: "💻", digital: "💻", cyber: "🔐",
  food: "🍽️", restaurant: "🍽️", hotel: "🏨", hospitality: "🏨",
  finance: "💰", bank: "🏦", insurance: "🛡️", invest: "📈",
  retail: "🛍️", shop: "🛍️", ecommerce: "🛒", fashion: "👗",
  real: "🏢", property: "🏢", estate: "🏢", construct: "🏗️", build: "🏗️",
  edu: "🎓", school: "🎓", college: "🎓", train: "🎓",
  legal: "⚖️", law: "⚖️",
  market: "📣", advertis: "📣", media: "📺", entertainment: "🎭",
  manufactur: "🏭", factory: "🏭", industri: "🏭",
  transport: "🚚", logistics: "🚚", shipping: "🚢",
  energy: "⚡", oil: "🛢️", gas: "🛢️", solar: "☀️",
  telecom: "📡", network: "📡",
  agri: "🌾", farm: "🌾",
  consult: "🤝", service: "🤝", hr: "👥", recruit: "👥",
  travel: "✈️", tour: "✈️",
  art: "🎨", design: "🎨", creative: "🎨",
  security: "🔒", safety: "🔒",
  ngo: "❤️", nonprofit: "❤️", charity: "❤️",
};

function getCategoryEmoji(name = "") {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return "🏷️";
}

// ── Vibrant gradient palettes per index ─────────────────────
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

export default function CategoryExplorerPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("people"); // "people" | "company"
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");

  // ── Fetch distinct categories from real data ───────────────
  const load = useCallback(async () => {
    setLoading(true);
    setCategories([]);
    try {
      if (mode === "people") {
        // Fetch a large sample and extract unique job_titles
        const { data } = await fpGetDatabase({ page: 1, limit: 2000 });
        const records = data.records || [];
        const freq = {};
        for (const r of records) {
          const raw = r.job_title || r.industry || r.category || "";
          if (!raw.trim()) continue;
          // Normalize — capitalise first letter, trim
          const key = raw.trim().replace(/\b\w/g, c => c.toUpperCase());
          freq[key] = (freq[key] || 0) + 1;
        }
        const sorted = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 60)
          .map(([name, count]) => ({ name, count }));
        setCategories(sorted);
      } else {
        // Fetch companies and extract industry
        const { data } = await fcGetDatabase({ page: 1, limit: 2000 });
        const records = data.records || [];
        const freq = {};
        for (const r of records) {
          const raw = r.industry || r.category || r.sector || r.business_type || "";
          if (!raw.trim()) continue;
          const key = raw.trim().replace(/\b\w/g, c => c.toUpperCase());
          freq[key] = (freq[key] || 0) + 1;
        }
        const sorted = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 60)
          .map(([name, count]) => ({ name, count }));
        setCategories(sorted);
      }
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { load(); }, [load]);

  // ── Navigate to People/Company with pre-filled filter ──────
  const handleCategoryClick = (cat) => {
    const encoded = encodeURIComponent(cat.name);
    if (mode === "people") {
      navigate(`/app/people?f_job_title=${encoded}`);
    } else {
      navigate(`/app/companies?f_industry=${encoded}`);
    }
  };

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 h-full">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <Grid3x3 size={22} className="text-[var(--accent)]" />
            Category Explorer
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            Browse & jump into filtered {mode === "people" ? "People" : "Companies"} by category
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ── Toggle — People / Company ───────────────────────── */}
      <div className="flex justify-center">
        <div
          className="relative flex items-center rounded-full p-1 gap-1"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            width: "fit-content",
          }}
        >
          {/* Sliding pill */}
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="absolute top-1 bottom-1 rounded-full"
            style={{
              background: mode === "people"
                ? "linear-gradient(135deg,#667eea,#764ba2)"
                : "linear-gradient(135deg,#22d3ee,#0ea5e9)",
              left: mode === "people" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 6px)",
              zIndex: 0,
            }}
          />
          <button
            onClick={() => setMode("people")}
            className="relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{ color: mode === "people" ? "#fff" : "var(--text-3)" }}
          >
            <Users2 size={15} />
            People
          </button>
          <button
            onClick={() => setMode("company")}
            className="relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{ color: mode === "company" ? "#fff" : "var(--text-3)" }}
          >
            <Building2 size={15} />
            Companies
          </button>
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────── */}
      <div className="relative max-w-sm mx-auto w-full">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
        <input
          className="input pl-9 w-full text-sm"
          placeholder={`Search ${mode === "people" ? "job titles" : "industries"}…`}
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
      </div>

      {/* ── Category Grid ───────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          >
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl animate-pulse"
                style={{
                  height: 110,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              />
            ))}
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-3)]"
          >
            <Layers size={40} className="opacity-30" />
            <p className="text-sm">No categories found.</p>
            <p className="text-xs opacity-60">Try refreshing or switching mode.</p>
          </motion.div>
        ) : (
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
                transition={{ delay: i * 0.018, duration: 0.22 }}
                className="relative rounded-2xl p-4 text-left overflow-hidden group cursor-pointer"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  minHeight: 110,
                }}
              >
                {/* Gradient accent strip at top */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                  style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                />

                {/* Soft gradient glow on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-2xl"
                  style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                />

                {/* Emoji */}
                <div className="text-2xl mb-2 leading-none">
                  {getCategoryEmoji(cat.name)}
                </div>

                {/* Category name */}
                <p className="text-xs font-semibold text-[var(--text)] leading-snug line-clamp-2 mb-1">
                  {cat.name}
                </p>

                {/* Count badge */}
                <p className="text-[10px] text-[var(--text-3)]">
                  {cat.count.toLocaleString()} {mode === "people" ? "people" : "companies"}
                </p>

                {/* Arrow — appears on hover */}
                <div
                  className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full p-1"
                  style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                >
                  <ArrowRight size={10} color="white" />
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer hint ─────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <p className="text-center text-[11px] text-[var(--text-3)] pb-2 flex items-center justify-center gap-1">
          <Sparkles size={10} />
          Click any category to open filtered {mode === "people" ? "People" : "Companies"} view
        </p>
      )}
    </div>
  );
}
