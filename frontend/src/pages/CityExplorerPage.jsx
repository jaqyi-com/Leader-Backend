import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, ArrowRight, Search, Layers, RefreshCw } from "lucide-react";
import { ibGetCities, indiaGetCities } from "../api";

// ── US States ─────────────────────────────────────────────────────────────
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];
const STATE_FULL = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",
  CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",
  IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",
  ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
  NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",
  ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",
  RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",
  UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",
  WI:"Wisconsin",WY:"Wyoming",DC:"Washington DC",
};
const STATE_ABBR = Object.fromEntries(
  Object.entries(STATE_FULL).map(([k, v]) => [v.toLowerCase(), k])
);

// ── Country tabs ──────────────────────────────────────────────────────────
const TABS = [
  { key: "usa",   label: "USA",   flag: "🇺🇸" },
  { key: "india", label: "India", flag: "🇮🇳" },
];

// ── City grid panel (one per country tab) ────────────────────────────────
function CityPanel({ country }) {
  const navigate = useNavigate();

  const [cities,      setCities]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [searchQ,     setSearchQ]     = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  // All unique states/regions present in this dataset (computed from data)
  const [regionOptions, setRegionOptions] = useState([]);

  // ── Load ─────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const fn = country === "usa" ? ibGetCities : indiaGetCities;
      const { data } = await fn();
      const list = data.cities || [];
      setCities(list);

      if (country === "india") {
        // Build unique region list dynamically from returned data
        const regions = [...new Set(list.map(c => c.state).filter(Boolean))].sort();
        setRegionOptions(regions);
      }
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

    if (regionFilter) {
      if (country === "usa") {
        const abbr = regionFilter.toUpperCase();
        const full = (STATE_FULL[abbr] || "").toLowerCase();
        list = list.filter(c => {
          const s = (c.state || "").toLowerCase();
          return s === abbr.toLowerCase() || s === full || (STATE_ABBR[s] || "").toUpperCase() === abbr;
        });
      } else {
        // India: exact state name match
        list = list.filter(c => (c.state || "").toLowerCase() === regionFilter.toLowerCase());
      }
    }

    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [cities, regionFilter, searchQ, country]);

  const handleClick = (city) => {
    if (country === "usa") {
      navigate(`/app/inbuild-db?city_file=${encodeURIComponent(city.city_file || city.name)}`);
    } else {
      navigate(`/app/india-data?search=${encodeURIComponent(city.name)}`);
    }
  };

  const regionLabel = country === "usa" ? "State" : "State / Region";

  return (
    <div className="flex flex-col gap-5">

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            className="input pl-9 w-full text-sm"
            placeholder={`Search ${country === "usa" ? "city" : "city / location"}…`}
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>

        {/* State / Region filter */}
        <select
          className="input text-sm"
          value={regionFilter}
          onChange={e => setRegionFilter(e.target.value)}
          style={{ minWidth: 170 }}
        >
          <option value="">All {regionLabel}s</option>
          {country === "usa"
            ? US_STATES.map(s => (
                <option key={s} value={s}>{s} — {STATE_FULL[s]}</option>
              ))
            : regionOptions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))
          }
        </select>

        {/* Refresh */}
        <button onClick={load} disabled={loading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading…" : "Refresh"}
        </button>

        {(searchQ || regionFilter) && (
          <button
            onClick={() => { setSearchQ(""); setRegionFilter(""); }}
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
                  : `No cities match "${searchQ || regionFilter}"`}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
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
                  {/* State / region */}
                  {city.state && (
                    <p className="text-[9px] font-medium text-[var(--accent)] uppercase tracking-wide mb-0.5">
                      {city.state}
                    </p>
                  )}
                  {/* Count */}
                  <p className="text-[10px] text-[var(--text-3)]">
                    {city.count.toLocaleString()} businesses
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
          {filtered.length.toLocaleString()} cities · click any card to open filtered database
        </p>
      )}
    </div>
  );
}

// ── Main CityExplorerPage ─────────────────────────────────────────────────
export default function CityExplorerPage() {
  const [country, setCountry] = useState("usa");

  const activeTab = TABS.find(t => t.key === country);

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <MapPin size={22} className="text-[var(--accent)]" />
          City Explorer
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">
          Browse {activeTab?.label} businesses by city / region
        </p>
      </div>

      {/* ── Toggle — USA / India (same spring-pill pattern as Email & Number pages) */}
      <div className="flex justify-center">
        <div
          className="relative flex items-center rounded-full p-1"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {/* Sliding pill */}
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
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setCountry(tab.key)}
              className="relative z-10 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
              style={{
                color: country === tab.key ? "#fff" : "var(--text-3)",
                minWidth: 130,
              }}
            >
              <span>{tab.flag}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── City Panel (key forces fresh mount + fetch on tab switch) */}
      <CityPanel key={country} country={country} />
    </div>
  );
}
