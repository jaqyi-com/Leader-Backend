import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, ArrowRight, Search, Layers, RefreshCw, Users2, Building2 } from "lucide-react";
import { fcGetCities, fpGetCities } from "../api";

// ── Tabs — same structure as CategoryExplorerPage ────────────────────────
const TABS = [
  { key: "company", label: "Companies", icon: Building2, fn: fcGetCities, dest: "/app/companies" },
  { key: "people",  label: "People",    icon: Users2,    fn: fpGetCities,  dest: "/app/people"    },
];

// ── City Grid Panel (remounted fresh on tab switch) ──────────────────────
function CityPanel({ mode }) {
  const navigate = useNavigate();
  const tab = TABS.find(t => t.key === mode);

  const [cities,       setCities]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [searchQ,      setSearchQ]      = useState("");
  const [stateFilter,  setStateFilter]  = useState("");
  // Build state list dynamically from data
  const [stateOptions, setStateOptions] = useState([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await tab.fn();
      const list = data.cities || [];
      setCities(list);
      // Build sorted unique state options
      const states = [...new Set(list.map(c => c.state).filter(Boolean))].sort();
      setStateOptions(states);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to load cities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  // ── Filter ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = cities;
    if (stateFilter) {
      list = list.filter(c => (c.state || "").toLowerCase() === stateFilter.toLowerCase());
    }
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [cities, stateFilter, searchQ]);

  const handleClick = (city) => {
    navigate(`${tab.dest}?f_city=${encodeURIComponent(city.name)}`);
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            className="input pl-9 w-full text-sm"
            placeholder="Search city…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>

        {/* State filter */}
        {stateOptions.length > 0 && (
          <select
            className="input text-sm"
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="">All States</option>
            {stateOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Refresh */}
        <button onClick={load} disabled={loading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading…" : "Refresh"}
        </button>

        {(searchQ || stateFilter) && (
          <button
            onClick={() => { setSearchQ(""); setStateFilter(""); }}
            className="text-[11px] text-[var(--text-3)] hover:text-[var(--rose)] underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl animate-pulse"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", height: 90 }}
            />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-3)]">
          <Layers size={40} className="opacity-30" />
          <p className="text-sm text-[var(--rose)]">{error}</p>
          <button onClick={load} className="btn-ghost text-xs gap-1.5">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Grid */}
      {!loading && !error && (
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
              <p className="text-sm">
                {cities.length === 0
                  ? "No city data available."
                  : `No cities match "${searchQ || stateFilter}"`}
              </p>
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
              {filtered.map((city, i) => (
                <motion.button
                  key={`${city.name}-${city.state}-${i}`}
                  onClick={() => handleClick(city)}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.012, 0.5), duration: 0.2 }}
                  className="relative rounded-2xl p-4 text-left overflow-hidden group cursor-pointer"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", minHeight: 90 }}
                >
                  {/* Accent top strip */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
                    style={{ background: "var(--accent)" }}
                  />
                  {/* Hover glow */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-[0.05] transition-opacity duration-300 rounded-2xl"
                    style={{ background: "var(--accent)" }}
                  />
                  {/* City name */}
                  <p className="text-xs font-semibold text-[var(--text)] leading-snug line-clamp-2 mb-1 mt-1">
                    {city.name}
                  </p>
                  {/* State badge */}
                  {city.state && (
                    <p className="text-[9px] font-medium text-[var(--accent)] uppercase tracking-wide mb-0.5">
                      {city.state}
                    </p>
                  )}
                  {/* Count */}
                  <p className="text-[10px] text-[var(--text-3)]">
                    {city.count.toLocaleString()} {mode === "company" ? "companies" : "people"}
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
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-center text-[11px] text-[var(--text-3)] pb-2 flex items-center justify-center gap-1">
          <MapPin size={10} />
          {filtered.length.toLocaleString()} cities · click any card to open filtered {mode === "company" ? "Companies" : "People"}
        </p>
      )}
    </div>
  );
}

// ── Main CityExplorerPage ─────────────────────────────────────────────────
export default function CityExplorerPage() {
  const [mode, setMode] = useState("company");

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <MapPin size={22} className="text-[var(--accent)]" />
          City Explorer
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">
          Browse {mode === "company" ? "companies" : "people"} by city from your full database
          <span className="ml-2 text-[10px] opacity-50">
            (from {mode === "company" ? "companies" : "people"} database)
          </span>
        </p>
      </div>

      {/* ── Toggle — Companies / People (exact same spring-pill as Email & Number pages) */}
      <div className="flex justify-center">
        <div
          className="relative flex items-center rounded-full p-1"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {/* Spring sliding pill */}
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="absolute top-1 bottom-1 rounded-full"
            style={{
              background: "var(--accent)",
              left:  mode === "company" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 6px)",
              zIndex: 0,
            }}
          />
          <button
            onClick={() => setMode("company")}
            className="relative z-10 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{ color: mode === "company" ? "#fff" : "var(--text-3)", minWidth: 130 }}
          >
            <Building2 size={14} />
            Companies
          </button>
          <button
            onClick={() => setMode("people")}
            className="relative z-10 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{ color: mode === "people" ? "#fff" : "var(--text-3)", minWidth: 130 }}
          >
            <Users2 size={14} />
            People
          </button>
        </div>
      </div>

      {/* City Panel — key forces fresh mount + fetch on tab switch */}
      <CityPanel key={mode} mode={mode} />
    </div>
  );
}
