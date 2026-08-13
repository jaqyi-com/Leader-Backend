import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, ArrowRight, Search, Layers, RefreshCw,
} from "lucide-react";
import { ibGetCities } from "../api";

// ── US State short-codes used for the filter dropdown ──────────────────
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

export default function CityExplorerPage() {
  const navigate = useNavigate();

  const [cities,      setCities]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [searchQ,     setSearchQ]     = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await ibGetCities();
      setCities(data.cities || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to load cities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = cities;
    if (stateFilter) {
      const abbr = stateFilter.toUpperCase();
      const full = (STATE_FULL[abbr] || "").toLowerCase();
      list = list.filter(c => {
        const s = (c.state || "").toLowerCase();
        return (
          s === abbr.toLowerCase() ||
          s === full ||
          (STATE_ABBR[s] || "").toUpperCase() === abbr
        );
      });
    }
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [cities, stateFilter, searchQ]);

  const handleClick = (city) => {
    const enc = encodeURIComponent(city.city_file || city.name);
    navigate(`/app/inbuild-db?city_file=${enc}`);
  };

  return (
    <div className="flex flex-col gap-6 h-full">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            <MapPin size={22} className="text-[var(--accent)]" />
            City Explorer
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            Browse businesses by city / region
            {!loading && cities.length > 0 && (
              <span className="ml-2 text-[10px] opacity-50">
                ({cities.length.toLocaleString()} cities)
              </span>
            )}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            className="input pl-9 w-full text-sm"
            placeholder="Search city…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
        <select
          className="input text-sm"
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All States</option>
          {US_STATES.map(s => (
            <option key={s} value={s}>{s} — {STATE_FULL[s]}</option>
          ))}
        </select>
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
              key="grid"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
            >
              {filtered.map((city, i) => (
                <motion.button
                  key={city.city_file || city.name}
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
                    {city.name || city.city_file}
                  </p>
                  {/* State badge */}
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
