import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Search, Grid3x3, Layers } from "lucide-react";

// ── Static hardcoded categories (generated from full DB scan) ──
// People: 489,443 records   Companies: 20,216 records
import CATEGORIES_DATA from "../categories.json";

export default function CategoryExplorerPage() {
  const navigate = useNavigate();
  const [mode, setMode]   = useState("people");
  const [searchQ, setSearchQ] = useState("");

  // Pick the right static dataset
  const allCategories = useMemo(
    () => (mode === "people" ? CATEGORIES_DATA.people : CATEGORIES_DATA.company),
    [mode]
  );

  const filtered = useMemo(
    () => allCategories.filter(c =>
      c.name.toLowerCase().includes(searchQ.toLowerCase())
    ),
    [allCategories, searchQ]
  );

  const handleClick = (cat) => {
    const enc = encodeURIComponent(cat.name);
    if (mode === "people") navigate(`/app/people?f_job_title=${enc}`);
    else                    navigate(`/app/companies?f_industry=${enc}`);
  };

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
            Browse {mode === "people" ? "job roles" : "industries"} from your full database
            <span className="ml-2 text-[10px] opacity-50">
              (from {mode === "people" ? "489k people" : "20k companies"})
            </span>
          </p>
        </div>
      </div>

      {/* ── Toggle — People / Company ─────────────────────── */}
      <div className="flex justify-center">
        <div
          className="relative flex items-center rounded-full p-1"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="absolute top-1 bottom-1 rounded-full"
            style={{
              background: "var(--accent)",
              left:  mode === "people" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 6px)",
              zIndex: 0,
            }}
          />
          <button
            onClick={() => { setMode("people"); setSearchQ(""); }}
            className="relative z-10 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{ color: mode === "people" ? "#fff" : "var(--text-3)", minWidth: 120 }}
          >
            People
          </button>
          <button
            onClick={() => { setMode("company"); setSearchQ(""); }}
            className="relative z-10 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{ color: mode === "company" ? "#fff" : "var(--text-3)", minWidth: 120 }}
          >
            Companies
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────── */}
      <div className="relative max-w-sm mx-auto w-full">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
        <input
          className="input pl-9 w-full text-sm"
          placeholder={`Search ${mode === "people" ? "job roles" : "industries"}…`}
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
      </div>

      {/* ── Grid ───────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-3)]"
          >
            <Layers size={40} className="opacity-30" />
            <p className="text-sm">No categories match "{searchQ}"</p>
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
                onClick={() => handleClick(cat)}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.5), duration: 0.2 }}
                className="relative rounded-2xl p-4 text-left overflow-hidden group cursor-pointer"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", minHeight: 90 }}
              >
                {/* Red top strip */}
                <div
                  className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
                  style={{ background: "var(--accent)" }}
                />
                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-[0.05] transition-opacity duration-300 rounded-2xl"
                  style={{ background: "var(--accent)" }}
                />
                {/* Name */}
                <p className="text-xs font-semibold text-[var(--text)] leading-snug line-clamp-2 mb-1 mt-1">
                  {cat.name}
                </p>
                {/* Count */}
                <p className="text-[10px] text-[var(--text-3)]">
                  {cat.count.toLocaleString()} {mode === "people" ? "people" : "companies"}
                </p>
                {/* Arrow on hover */}
                <div
                  className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full p-1"
                  style={{ background: "var(--accent)" }}
                >
                  <ArrowRight size={10} color="white" />
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer ─────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <p className="text-center text-[11px] text-[var(--text-3)] pb-2 flex items-center justify-center gap-1">
          <Sparkles size={10} />
          {filtered.length} categories · click any card to open filtered {mode === "people" ? "People" : "Companies"}
        </p>
      )}
    </div>
  );
}
