import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, ArrowRight, Search, Layers, Users2, Building2,
  Globe2, Sparkles, X, Filter, Navigation
} from "lucide-react";
import CITIES_DATA from "../cities.json";
import WORLD_CITIES from "../worldCities.json";
import CountryPicker from "../components/CountryPicker";
import { countryByCode, toCountryCode, fmtCount } from "../countries";
import { initCounts, getCounts, useLiveCounts } from "../liveCounts";

initCounts("cities", CITIES_DATA);
initCounts("world_cities", WORLD_CITIES);

// ── Countries with city cards ─────────────────────────────────────────────
// India / USA: "cities" (src/counts/explorerCards.js). Every other country: "world_cities"
// (src/counts/worldCities.js). Counts equal what a card's click finds.
// Both are served live (liveCounts.js); the JSON files are the built-in copy.
const cityCountries = () => ["IN", "US", ...Object.keys(getCounts("world_cities").countries)];
const LEGACY_KEY = { IN: "india", US: "usa" };
const citiesFor = (code, mode) =>
  (LEGACY_KEY[code] ? getCounts("cities")[LEGACY_KEY[code]]?.[mode] : getCounts("world_cities").countries[code]?.[mode]) || [];

// Top Metro Quick Filters
const TOP_METROS_INDIA = [
  "Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai",
  "Pune", "Kolkata", "Ahmedabad", "Gurugram", "Noida", "Jaipur", "Surat", "Indore", "Chandigarh"
];

const TOP_METROS_USA = [
  "New York", "Los Angeles", "Chicago", "Houston", "Dallas",
  "Phoenix", "San Francisco", "San Diego", "Austin", "Atlanta", "Miami", "Seattle"
];

export default function CityExplorerPage() {
  const navigate = useNavigate();
  const countsVersion = useLiveCounts("countries", "world_cities", "cities");
  const [searchParams, setSearchParams] = useSearchParams();
  const [country,     setCountry]     = useState(() => {
    const fromUrl = toCountryCode(searchParams.get("country"));
    return cityCountries().includes(fromUrl) ? fromUrl : "IN";
  });
  const [mode,        setMode]        = useState("companies"); // "companies" or "people"
  const [searchQ,     setSearchQ]     = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const isIndia = country === "IN";
  const isMain = country === "IN" || country === "US";
  const countryInfo = countryByCode(country);
  const countryLabel = countryInfo?.name || country;
  const noun = mode === "companies" ? "companies" : "people";

  // ── Pick the right dataset ────────────────────────────────────────────────
  const allCities = useMemo(() => citiesFor(country, mode), [country, mode, countsVersion]);
  const CITY_COUNTRIES = useMemo(() => cityCountries(), [countsVersion]);
  const topMetros = country === "IN" ? TOP_METROS_INDIA
    : country === "US" ? TOP_METROS_USA
    : allCities.length > 6 ? allCities.slice(0, 12).map((c) => c.name) : [];
  // Outside India, the USA and Canada most records have no city: say how much the cards cover.
  const countryTotal = countryInfo?.[mode] || 0;
  const cardsTotal = allCities.reduce((sum, c) => sum + c.count, 0);
  const limited = !isMain && country !== "CA";
  const browseAll = () => navigate(`${mode === "companies" ? "/app/companies" : "/app/people"}?country=${country}`);

  // ── Unique states for dropdown ────────────────────────────────────────────
  const stateOptions = useMemo(() => {
    const states = new Set();
    allCities.forEach(c => {
      if (c.state && c.state.trim()) {
        states.add(c.state.trim());
      }
    });
    return Array.from(states).sort();
  }, [allCities]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allCities;

    // Filter by state dropdown
    if (stateFilter) {
      list = list.filter(c => (c.state || "").toLowerCase() === stateFilter.toLowerCase());
    }

    // Filter by text search
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) || (c.state || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [allCities, stateFilter, searchQ]);

  const handleClick = (city) => {
    const dest = mode === "companies" ? "/app/companies" : "/app/people";
    // USA cards are per city + state (there are several Columbuses); India cards cover the whole city.
    // Other countries: country + city (+ province for Canada), as in src/counts/worldCities.js.
    const params = new URLSearchParams({ f_city: city.name.trim() });
    if (isIndia) params.set("f_country", "india");
    else if (country === "US") { if (city.state) params.set("f_state_eq", city.state); }
    else {
      params.set("country", country);
      if (city.state) params.set("f_state_eq", city.state);
    }
    navigate(`${dest}?${params}`);
  };

  const handleCountryChange = (newCountry) => {
    if (!newCountry) return;
    setCountry(newCountry);
    setStateFilter("");
    setSearchQ("");
    const next = new URLSearchParams(searchParams);
    next.set("country", newCountry);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col gap-6 h-full pb-10">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(226,55,68,0.12)",
                border: "1px solid rgba(226,55,68,0.25)",
                color: "var(--accent)"
              }}
            >
              <MapPin size={22} />
            </div>
            City &amp; Regional Explorer
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Discover verified leads and companies mapped across <span className="font-semibold text-[var(--text-2)]">{countryLabel}</span> commercial hubs.
          </p>
        </div>

        {/* Stats counter */}
        <div
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-2)",
          }}
        >
          <Sparkles size={14} style={{ color: "var(--accent)" }} />
          <span>{filtered.length} cities listed</span>
        </div>
      </div>

      {/* ── Main Control Bar ─────────────────────────────── */}
      <div
        className="p-4 rounded-2xl flex flex-col gap-4"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Country: India, USA, Canada and every country with city data */}
          <CountryPicker value={country} onChange={handleCountryChange} kind={mode} codes={CITY_COUNTRIES} allowAll={false} />

          {/* Entity Mode: Companies vs People */}
          <div className="flex items-center rounded-xl p-1 bg-[var(--surface)] border border-[var(--border)]">
            <button
              onClick={() => setMode("companies")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
              style={{
                background: mode === "companies" ? "rgba(226,55,68,0.15)" : "transparent",
                color: mode === "companies" ? "var(--accent)" : "var(--text-3)",
                border: mode === "companies" ? "1px solid rgba(226,55,68,0.3)" : "1px solid transparent",
              }}
            >
              <Building2 size={14} />
              Companies
            </button>
            <button
              onClick={() => setMode("people")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
              style={{
                background: mode === "people" ? "rgba(226,55,68,0.15)" : "transparent",
                color: mode === "people" ? "var(--accent)" : "var(--text-3)",
                border: mode === "people" ? "1px solid rgba(226,55,68,0.3)" : "1px solid transparent",
              }}
            >
              <Users2 size={14} />
              People &amp; Founders
            </button>
          </div>

          {/* State / Region Dropdown */}
          <div className="flex items-center gap-2 min-w-[180px]">
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="input text-xs font-semibold py-2 px-3 rounded-xl w-full cursor-pointer"
            >
              <option value="">{country === "CA" ? "All provinces" : "All States / Regions"}</option>
              {stateOptions.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              className="input pl-10 pr-9 w-full text-sm font-medium rounded-xl"
              placeholder={`Search ${countryLabel} cities${topMetros.length > 1 ? ` (e.g. ${topMetros.slice(0, 2).join(", ")})` : ""}...`}
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Top Metros Quick Tags ───────────────────────── */}
        {topMetros.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--text-3)] pt-2 border-t border-[var(--border)]">
          <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mr-1 flex items-center gap-1">
            <Navigation size={11} /> Top Metros:
          </span>
          {topMetros.map(metro => (
            <button
              key={metro}
              onClick={() => { setSearchQ(metro); setStateFilter(""); }}
              className="px-2.5 py-0.5 rounded-md text-[11px] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors cursor-pointer"
            >
              {metro}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* ── Limited city data note (countries other than India / USA / Canada) ── */}
      {limited && (
        <div
          className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 rounded-2xl text-xs"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          <span>
            City data is limited in {countryLabel}:{" "}
            {allCities.length > 0
              ? <>these cards cover {fmtCount(cardsTotal)} of {fmtCount(countryTotal)} {noun}.</>
              : <>no city has {noun === "people" ? "20 or more people" : "20 or more companies"} yet.</>}
          </span>
          {countryTotal > 0 && (
            <button
              onClick={browseAll}
              className="flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline cursor-pointer"
            >
              Browse all {fmtCount(countryTotal)} {noun} in {countryLabel} <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}

      {/* ── Cities Grid ───────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-3)] rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]"
          >
            <MapPin size={44} className="opacity-30 text-[var(--accent)]" />
            <h3 className="text-base font-bold text-[var(--text)]">No cities found</h3>
            <p className="text-xs max-w-sm text-center">
              {allCities.length === 0
                ? `No city cards for ${noun} in ${countryLabel} yet.`
                : `No cities match your search query "${searchQ}"${stateFilter ? ` in ${stateFilter}` : ""}.`}
            </p>
            <button
              onClick={() => { setSearchQ(""); setStateFilter(""); }}
              className="mt-2 px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-[var(--accent)] hover:opacity-90 transition-opacity"
            >
              Reset Filters
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={`grid-${country}-${mode}-${stateFilter}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5"
          >
            {filtered.map((city, i) => (
              <motion.button
                key={`${city.name}-${city.state}-${i}`}
                onClick={() => handleClick(city)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.008, 0.25), duration: 0.2 }}
                className="relative rounded-2xl p-4 text-left overflow-hidden group cursor-pointer flex flex-col justify-between"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  minHeight: 96,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                {/* Top Accent Strip */}
                <div
                  className="absolute top-0 left-0 right-0 h-[2.5px] rounded-t-2xl opacity-60 group-hover:opacity-100 transition-opacity"
                  style={{ background: isIndia ? "linear-gradient(90deg, #f97316 0%, #10b981 100%)" : "linear-gradient(90deg, var(--accent) 0%, #3b82f6 100%)" }}
                />

                {/* Hover Glow Layer */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300 rounded-2xl pointer-events-none"
                  style={{ background: isIndia ? "#f97316" : "var(--accent)" }}
                />

                {/* City Name & State */}
                <div>
                  <h4 className="text-xs font-bold text-[var(--text)] leading-snug line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                    {city.name}
                  </h4>
                  {(city.state || !isMain) && (
                    <span className="text-[10px] font-semibold text-[var(--text-3)] block mt-0.5">
                      {city.state || countryLabel}
                    </span>
                  )}
                </div>

                {/* Bottom Stats & Arrow */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border)]">
                  <span className="text-[10px] font-semibold text-[var(--text-3)]">
                    {fmtCount(city.count)} {noun}
                  </span>

                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5"
                    style={{ background: isIndia ? "#f97316" : "var(--accent)", color: "#fff" }}
                  >
                    <ArrowRight size={10} />
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
