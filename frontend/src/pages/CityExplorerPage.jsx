import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, ArrowRight, Search, Layers, Users2, Building2 } from "lucide-react";

// ── Static hardcoded city data ─────────────────────────────────────────────
// USA: generated from Neon final.companies + final.people
// India: curated city list (India data not in Neon — hardcoded reference data)
// To regenerate USA cities: node scripts/generate_cities.js
import CITIES_DATA from "../cities.json";

// ── Country config ─────────────────────────────────────────────────────────
const COUNTRIES = [
  { key: "usa",   label: "USA",   flag: "🇺🇸" },
  { key: "india", label: "India", flag: "🇮🇳" },
];

// ── USA Tabs ───────────────────────────────────────────────────────────────
const USA_TABS = [
  { key: "company", label: "Companies", icon: Building2, dest: "/app/companies", dataKey: "companies" },
  { key: "people",  label: "People",    icon: Users2,    dest: "/app/people",    dataKey: "people"    },
];

export default function CityExplorerPage() {
  const navigate = useNavigate();
  const [country,     setCountry]     = useState("usa");
  const [mode,        setMode]        = useState("company");
  const [searchQ,     setSearchQ]     = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const isIndia = country === "india";

  // ── Pick the right dataset ────────────────────────────────────────────────
  const allCities = useMemo(() => {
    if (isIndia) return CITIES_DATA.india || [];
    return mode === "company" ? CITIES_DATA.companies : CITIES_DATA.people;
  }, [isIndia, mode]);

  // ── Unique states for dropdown ────────────────────────────────────────────
  const stateOptions = useMemo(
    () => [...new Set(allCities.map(c => c.state).filter(Boolean))].sort(),
    [allCities]
  );

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allCities;
    if (stateFilter) {
      list = list.filter(c => (c.state || "").toLowerCase() === stateFilter.toLowerCase());
    }
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.state || "").toLowerCase().includes(q));
    }
    return list;
  }, [allCities, stateFilter, searchQ]);

  const handleClick = (city) => {
    if (isIndia) {
      // India cities → open people page filtered by city
      navigate(`/app/people?f_city=${encodeURIComponent(city.name)}`);
    } else {
      const dest = USA_TABS.find(t => t.key === mode).dest;
      navigate(`${dest}?f_city=${encodeURIComponent(city.name)}`);
    }
  };

  const entityLabel = isIndia ? "leads" : (mode === "company" ? "companies" : "people");
  const countryFlag = isIndia ? "🇮🇳" : "🇺🇸";
  const clearFilters = () => { setSearchQ(""); setStateFilter(""); };

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <MapPin size={22} className="text-[var(--accent)]" />
          City Explorer
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">
          Browse {entityLabel} by city — {filtered.length.toLocaleString()} cities available
        </p>
      </div>

      {/* ── Country Toggle — USA / India ─────────────────────────────────────── */}
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
              left:  country === "usa" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 6px)",
              zIndex: 0,
            }}
          />
          {COUNTRIES.map(c => (
            <button
              key={c.key}
              onClick={() => { setCountry(c.key); setSearchQ(""); setStateFilter(""); }}
              className="relative z-10 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
              style={{ color: country === c.key ? "#fff" : "var(--text-3)", minWidth: 130 }}
            >
              <span className="text-base leading-none">{c.flag}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── USA Companies / People toggle ───────────────────────────────────── */}
      <AnimatePresence>
        {!isIndia && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="flex justify-center overflow-hidden"
          >
            <div
              className="relative flex items-center rounded-full p-1"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <motion.div
                layout
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className="absolute top-1 bottom-1 rounded-full"
                style={{
                  background: "var(--surface-3, #333)",
                  left:  mode === "company" ? "4px" : "calc(50% + 2px)",
                  width: "calc(50% - 6px)",
                  zIndex: 0,
                }}
              />
              {USA_TABS.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => { setMode(t.key); setSearchQ(""); setStateFilter(""); }}
                    className="relative z-10 flex items-center justify-center gap-2 px-6 py-2 rounded-full text-xs font-semibold transition-colors"
                    style={{ color: mode === t.key ? "var(--text)" : "var(--text-3)", minWidth: 120 }}
                  >
                    <Icon size={13} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search + State Filter ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            className="input pl-9 w-full text-sm"
            placeholder={`Search ${isIndia ? "Indian" : "US"} city or state…`}
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>

        {stateOptions.length > 0 && (
          <select
            className="input text-sm"
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">All {isIndia ? "States" : "States"}</option>
            {stateOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {(searchQ || stateFilter) && (
          <button
            onClick={clearFilters}
            className="text-[11px] text-[var(--text-3)] hover:text-[var(--rose)] underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── City Grid ────────────────────────────────────────────────────────── */}
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
            <p className="text-sm">No cities match your search</p>
          </motion.div>
        ) : (
          <motion.div
            key={`grid-${country}-${mode}`}
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
                {/* Top accent strip */}
                <div
                  className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
                  style={{ background: "var(--accent)" }}
                />
                {/* Country flag */}
                <span className="absolute top-2 right-2 text-[11px] opacity-40 select-none">{countryFlag}</span>
                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-[0.05] transition-opacity duration-300 rounded-2xl"
                  style={{ background: "var(--accent)" }}
                />
                {/* City name */}
                <p className="text-xs font-semibold text-[var(--text)] leading-snug line-clamp-2 mb-1 mt-1 pr-4">
                  {city.name}
                </p>
                {/* State */}
                {city.state && (
                  <p className="text-[9px] font-medium text-[var(--accent)] uppercase tracking-wide mb-0.5">
                    {city.state}
                  </p>
                )}
                {/* Count */}
                <p className="text-[10px] text-[var(--text-3)]">
                  {city.count.toLocaleString()} {entityLabel}
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

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <p className="text-center text-[11px] text-[var(--text-3)] pb-2 flex items-center justify-center gap-1">
          <MapPin size={10} />
          {filtered.length.toLocaleString()} cities · click any card to browse filtered {entityLabel}
        </p>
      )}
    </div>
  );
}
