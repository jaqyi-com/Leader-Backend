import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Search, Loader2, Star, Phone, Globe, ExternalLink,
  Navigation, Download, AlertCircle, CheckCircle2, SlidersHorizontal, History, RotateCcw, X
} from "lucide-react";
import { searchPlaces, getStoredPlaces, exportPlacesCsv, getPlacesHistory, geocodePlacesAddress, autocompletePlaces } from "../api";
import toast from "react-hot-toast";

// ── Rating stars ──────────────────────────────────────────────────────────────
function Stars({ rating, totalRatings }) {
  if (!rating) return <span className="text-xs text-slate-400">No rating</span>;
  const full = Math.floor(rating);
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={10} className={i < full ? "text-amber-400 fill-amber-400" : "text-slate-300 dark:text-slate-600"} />
      ))}
      <span className="text-xs text-slate-500 dark:text-slate-400 ml-1 font-medium">{rating}</span>
      {totalRatings > 0 && <span className="text-[10px] text-slate-400 ml-1">({totalRatings} reviews)</span>}
    </span>
  );
}

// ── Place card ────────────────────────────────────────────────────────────────
function PlaceCard({ place, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="glass-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 dark:text-white text-sm truncate">
            <a href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}&query_place_id=${place.place_id}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-500 hover:underline transition-colors">
              {place.name || "—"}
            </a>
          </h3>
          <Stars rating={place.rating} totalRatings={place.user_ratings_total} />
        </div>
        <a href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}&query_place_id=${place.place_id}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-accent-cyan flex items-center justify-center shadow-md flex-shrink-0 hover:scale-110 transition-transform cursor-pointer">
          <MapPin size={16} className="text-white" />
        </a>
      </div>

      <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
        {place.types && place.types.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {place.types.slice(0, 3).map((type, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-brand-50 dark:bg-brand-900/10 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-800/30 rounded text-[10px] uppercase font-semibold tracking-wider">
                {type.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
        {place.address && (
          <div className="flex items-start gap-1.5">
            <MapPin size={11} className="mt-0.5 flex-shrink-0 text-slate-400" />
            <span className="leading-relaxed">{place.address}</span>
          </div>
        )}
        {place.phone && (
          <div className="flex items-center gap-1.5">
            <Phone size={11} className="flex-shrink-0 text-slate-400" />
            <a href={`tel:${place.phone}`} className="hover:text-brand-500 transition-colors">{place.phone}</a>
          </div>
        )}
        {place.website && (
          <div className="flex items-center gap-1.5">
            <Globe size={11} className="flex-shrink-0 text-slate-400" />
            <a href={place.website} target="_blank" rel="noopener noreferrer"
              className="text-brand-500 hover:underline truncate max-w-[180px]">
              {place.website.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}
      </div>

      {place.website && (
        <a href={place.website} target="_blank" rel="noopener noreferrer"
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
          <ExternalLink size={11} /> Visit Website
        </a>
      )}
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PlacesPage() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState(2000);
  const [keyword, setKeyword] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [geocodingAddress, setGeocodingAddress] = useState(false);

  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterMinReviews, setFilterMinReviews] = useState(0);
  const [filterHasWebsite, setFilterHasWebsite] = useState(false);
  const [filterHasPhone, setFilterHasPhone] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const [searchStatus, setSearchStatus] = useState(null); // { count, message }
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingStored, setLoadingStored] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestionTimeout = useRef(null);

  // ── Geolocation & Address Search ─────────────────────────────────────────────
  const handleAddressSearch = async (addressToSearch) => {
    const query = typeof addressToSearch === "string" ? addressToSearch : addressInput;
    if (!query.trim()) {
      toast.error("Please enter a location to search");
      return;
    }
    setError(null);
    setGeocodingAddress(true);
    setShowSuggestions(false);
    try {
      const { data } = await geocodePlacesAddress(query);
      if (data && data.lat && data.lng) {
        setLat(data.lat.toFixed(6));
        setLng(data.lng.toFixed(6));
        toast.success(`Found: ${data.formatted_address}`);
        setAddressInput(data.formatted_address); // Update input with full address
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to find location. Please try a different query.");
    } finally {
      setGeocodingAddress(false);
    }
  };

  const handleAddressChange = (e) => {
    const val = e.target.value;
    setAddressInput(val);
    
    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    
    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestionTimeout.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      setShowSuggestions(true);
      try {
        const { data } = await autocompletePlaces(val);
        setSuggestions(data || []);
      } catch (err) {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);
  };

  const handleSuggestionClick = (suggestion) => {
    setAddressInput(suggestion.description);
    setShowSuggestions(false);
    handleAddressSearch(suggestion.description);
  };

  const handleGetLocation = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGeoLoading(false);
        toast.success("Location detected!");
      },
      (err) => {
        setGeoLoading(false);
        setError(`Location error: ${err.message}`);
      }
    );
  };

  // ── History ────────────────────────────────────────────────────────────────
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await getPlacesHistory();
      setHistoryList(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error("Failed to load history");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleLoadHistory = (item) => {
    setLat(item.lat);
    setLng(item.lng);
    setRadius(item.radius);
    setKeyword(item.keyword);
    setShowHistory(false);
    toast.success("Loaded history parameters");
  };

  // ── Search places ────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    setError(null);
    setSearchStatus(null);
    if (!lat || !lng) { setError("Please provide coordinates first"); return; }
    if (!keyword.trim()) { setError("Please enter a keyword"); return; }
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) { setError("Invalid coordinates"); return; }

    setLoading(true);
    try {
      const { data } = await searchPlaces(latN, lngN, radius, keyword.trim());
      setSearchStatus(data);
      toast.success(`Found ${data.count} places!`);
      // Load stored results
      await fetchStored();
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || e.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch already-stored places ─────────────────────────────────────────────
  const fetchStored = async () => {
    setLoadingStored(true);
    try {
      const { data } = await getStoredPlaces({ limit: 50, keyword: keyword || undefined });
      setPlaces(Array.isArray(data) ? data : (data.places || []));
    } catch {
      // silently fail – DB may not be connected
    } finally {
      setLoadingStored(false);
    }
  };

  // ── Filters & Export ────────────────────────────────────────────────────────
  const availableCategories = Array.from(new Set(places.flatMap(p => p.types || []))).sort();

  const filteredPlaces = places.filter(p => {
    if (filterMinRating > 0 && (p.rating || 0) < filterMinRating) return false;
    if (filterMinReviews > 0 && (p.user_ratings_total || 0) < filterMinReviews) return false;
    if (filterHasWebsite && !p.website) return false;
    if (filterHasPhone && !p.phone) return false;
    if (filterCategory && !(p.types || []).includes(filterCategory)) return false;
    if (filterText) {
      const search = filterText.toLowerCase();
      return (
        p.name?.toLowerCase().includes(search) || 
        p.address?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const handleExport = async () => {
    if (!filteredPlaces || filteredPlaces.length === 0) {
      toast.error("No results to export");
      return;
    }

    const tId = toast.loading("Generating professional CSV...");
    try {
      // Use the new backend-powered export service
      const response = await exportPlacesCsv(filteredPlaces);
      
      // Create a blob from the response data
      const url = window.URL.createObjectURL(new Blob([response.data]));
      
      // Extract filename from header if provided, else use fallback
      const contentDisposition = response.headers["content-disposition"];
      let fileName = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (fileNameMatch?.[1]) fileName = fileNameMatch[1];
      } else {
        const safeKeyword = (keyword || "leads").trim().replace(/[^a-z0-9]/gi, "_").toLowerCase() || "export";
        fileName = `places_${safeKeyword}_${new Date().toISOString().split('T')[0]}.csv`;
      }

      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      link.style.display = "none";
      document.body.appendChild(link);
      
      link.click();
      
      toast.success("Download started!", { id: tId });
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 500);
    } catch (e) {
      console.error("Export failed:", e);
      toast.error("Failed to generate export", { id: tId });
    }
  };

  return (
    <>
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <History size={16} className="text-brand-500" /> Search History
                </h3>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1 space-y-3">
                {loadingHistory ? (
                  <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-brand-500" /></div>
                ) : historyList.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">No search history found.</div>
                ) : (
                  historyList.map(item => (
                    <div key={item._id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700 transition-colors flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {item.keyword || "Any Category"}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1"><MapPin size={10} /> {item.lat?.toFixed(4)}, {item.lng?.toFixed(4)}</span>
                          <span>⭕ {item.radius}m</span>
                          <span className="text-brand-600 dark:text-brand-400 font-medium">✅ {item.placesFound} found</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {new Date(item.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleLoadHistory(item)}
                        className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-brand-500 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                        title="Load Parameters"
                      >
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-6 max-w-5xl mx-auto">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MapPin size={22} className="text-brand-500" /> Local Business Scraper
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Search for businesses near any coordinates using the global directory mapping engine and store the results.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Config Panel */}
        <motion.div
          className="glass-card p-6 space-y-5 lg:col-span-1"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-brand-500" /> Search Config
            </h3>
            <button 
              onClick={() => { setShowHistory(true); fetchHistory(); }} 
              className="text-xs text-brand-600 dark:text-brand-400 font-semibold flex items-center gap-1 hover:underline px-2 py-1 rounded-md hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
            >
              <History size={13} /> History
            </button>
          </div>

          {/* Location */}
          <div className="space-y-4">
            {/* Global Address Search */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Global Location Search</label>
              <div className="relative">
                <div className="flex gap-2">
                  <input className="input text-sm flex-1" type="text"
                    value={addressInput} onChange={handleAddressChange}
                    onKeyDown={e => e.key === "Enter" && handleAddressSearch()}
                    onFocus={() => addressInput.trim() && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="e.g. New York, London, Tokyo..." />
                  <button 
                    onClick={() => handleAddressSearch()} 
                    disabled={geocodingAddress}
                    className="btn-primary px-3 text-sm flex-shrink-0"
                  >
                    {geocodingAddress ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  </button>
                </div>

                <AnimatePresence>
                  {showSuggestions && (loadingSuggestions || suggestions.length > 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50"
                    >
                      {loadingSuggestions && suggestions.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500">
                          <Loader2 size={14} className="animate-spin inline-block mr-2" />
                          Searching...
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto">
                          {suggestions.map((sugg, i) => (
                            <button
                              key={i}
                              onClick={() => handleSuggestionClick(sugg)}
                              className="w-full text-left px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0 flex items-start gap-2"
                            >
                              <MapPin size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{sugg.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
              <span className="text-xs font-medium text-slate-400">OR</span>
              <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
            </div>

            <button onClick={handleGetLocation} disabled={geoLoading}
              className="btn-secondary w-full justify-center text-sm">
              {geoLoading ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
              {geoLoading ? "Detecting..." : "Use My Location"}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Latitude</label>
                <input className="input text-sm" type="number" step="any"
                  value={lat} onChange={e => setLat(e.target.value)} placeholder="12.9716" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Longitude</label>
                <input className="input text-sm" type="number" step="any"
                  value={lng} onChange={e => setLng(e.target.value)} placeholder="77.5946" />
              </div>
            </div>
          </div>

          {/* Keyword */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Keyword / Category</label>
            <input className="input" type="text" value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="e.g. restaurant, software company" />
          </div>

          {/* Radius */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              Radius: <span className="text-brand-600 dark:text-brand-400 font-bold">{(radius / 1000).toFixed(1)} km</span>
            </label>
            <input type="range" min={500} max={10000} step={500} value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer" />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>0.5 km</span><span>10 km</span>
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search Button */}
          <button onClick={handleSearch} disabled={loading}
            className="btn-primary w-full justify-center">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Searching...</> : <><Search size={15} /> Search Places</>}
          </button>

          {/* Status */}
          <AnimatePresence>
            {searchStatus && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs">
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">{searchStatus.count} places saved</p>
                  <p className="text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">{searchStatus.message}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Right — Results */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Results header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-slate-800 dark:text-white">
                Results {places.length > 0 && <span className="text-slate-400 font-normal">({filteredPlaces.length} of {places.length})</span>}
              </h3>
              {loadingStored && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </div>
            {places.length > 0 && (
              <button onClick={handleExport} className="btn-secondary text-xs gap-1.5" disabled={filteredPlaces.length === 0}>
                <Download size={13} /> Export CSV
              </button>
            )}
          </div>

          {places.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              {/* Header / Icon */}
              <div className="flex items-center gap-2 pr-1 border-r border-slate-200 dark:border-slate-700 h-6">
                <SlidersHorizontal size={13} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                  Filters
                </span>
              </div>

              {/* Selection Dropdowns */}
              <select 
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600" 
                value={filterMinRating} onChange={e => setFilterMinRating(Number(e.target.value))}
              >
                <option value={0}>Rating</option>
                <option value={4.0}>4.0+ Stars</option>
                <option value={4.5}>4.5+ Stars</option>
                <option value={4.8}>4.8+ Stars</option>
              </select>
              
              <select 
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600" 
                value={filterMinReviews} onChange={e => setFilterMinReviews(Number(e.target.value))}
              >
                <option value={0}>Reviews</option>
                <option value={10}>10+ Reviews</option>
                <option value={50}>50+ Reviews</option>
                <option value={100}>100+ Reviews</option>
              </select>

              <select 
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500 text-slate-700 dark:text-slate-200 cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600" 
                value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              >
                <option value="">Category</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat.replace(/_/g, " ").toUpperCase()}</option>
                ))}
              </select>

              {/* Search Bar - Flex 1 to fill space properly */}
              <div className="relative flex-1 min-w-[180px]">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search in results..." 
                  className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-2 py-1.5 outline-none focus:border-brand-500 text-slate-700 dark:text-slate-200 transition-colors hover:border-slate-300 dark:hover:border-slate-600"
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                />
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 cursor-pointer hover:border-brand-500 transition-colors">
                  <input type="checkbox" className="accent-brand-500 w-3 h-3 cursor-pointer" checked={filterHasWebsite} onChange={e => setFilterHasWebsite(e.target.checked)} />
                  Website
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 cursor-pointer hover:border-brand-500 transition-colors">
                  <input type="checkbox" className="accent-brand-500 w-3 h-3 cursor-pointer" checked={filterHasPhone} onChange={e => setFilterHasPhone(e.target.checked)} />
                  Phone
                </label>
              </div>
            </div>
          )}

          {/* Cards grid */}
          {places.length > 0 ? (
            filteredPlaces.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredPlaces.map((place, i) => <PlaceCard key={place.place_id || i} place={place} index={i} />)}
              </div>
            ) : (
              <div className="p-10 flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 border-dashed">
                <SlidersHorizontal size={28} className="text-slate-300 dark:text-slate-600 mb-2" />
                <p className="font-medium text-slate-500 dark:text-slate-400">No results match your filters</p>
                <button onClick={() => {
                  setFilterMinRating(0); setFilterMinReviews(0); setFilterHasWebsite(false); setFilterHasPhone(false);
                  setFilterText(""); setFilterCategory("");
                }} className="mt-2 text-xs font-semibold text-brand-500 hover:text-brand-600 hover:underline">
                  Clear Filters
                </button>
              </div>
            )
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card flex flex-col items-center justify-center py-20 text-center"
            >
              <MapPin size={36} className="text-slate-300 dark:text-slate-600 mb-3" />
              <p className="font-semibold text-slate-500 dark:text-slate-400">No results yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Enter your location and keyword, then press Search.
              </p>
            </motion.div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
