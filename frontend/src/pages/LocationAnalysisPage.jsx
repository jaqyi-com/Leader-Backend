import { useState, useEffect, useCallback, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Building2, RefreshCw, Layers, BarChart3, Globe, Filter, X, Search, Star, Mail, Phone, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const PEOPLE_COLOR    = "#E23744";
const COMPANIES_COLOR = "#22d3ee";

const BLANK_FILTERS = {
  city: "", state: "", industry: "",
  has_email: "", has_phone: "", min_rating: "",
};

function FitBounds({ clusters }) {
  const map = useMap();
  useEffect(() => {
    if (!clusters.length) return;
    const lats = clusters.map(c => c.lat);
    const lngs = clusters.map(c => c.lng);
    try { map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [40, 40] }); } catch (_) {}
  }, [clusters, map]);
  return null;
}

function clusterRadius(count, maxCount) {
  return 4 + Math.sqrt(count / maxCount) * 36;
}

function fmt(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const INPUT_STYLE = {
  width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: 12, outline: "none",
  boxSizing: "border-box",
};

export default function LocationAnalysisPage() {
  const { token } = useAuth();
  const [layer,    setLayer]    = useState("both");
  const [loading,  setLoading]  = useState(true);
  const [people,    setPeople]    = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stats,     setStats]     = useState(null);
  const [showStats,   setShowStats]   = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [fitKey,   setFitKey]   = useState(0);
  const [filters,  setFilters]  = useState(BLANK_FILTERS);
  const [draft,    setDraft]    = useState(BLANK_FILTERS);   // un-applied draft
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  const headers = { Authorization: `Bearer ${token}` };

  const loadClusters = useCallback(async (type, f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type });
      Object.entries(f || {}).forEach(([k, v]) => { if (v) params.set(k, v); });
      const r = await fetch(`${API_BASE}/location-analysis/clusters?${params}`, { headers });
      const data = await r.json();
      if (data.people)    setPeople(data.people);
      if (data.companies) setCompanies(data.companies);
      setFitKey(k => k + 1);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  const loadStats = useCallback(async (type) => {
    try {
      const t = type === "both" ? "people" : type;
      const r = await fetch(`${API_BASE}/location-analysis/stats?type=${t}`, { headers });
      const data = await r.json();
      setStats(data);
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    loadClusters("both", {});
    loadStats("people");
  }, []);

  const handleLayer = (newLayer) => {
    setLayer(newLayer);
    loadClusters(newLayer, filters);
    loadStats(newLayer === "both" ? "people" : newLayer);
  };

  const applyFilters = () => {
    setFilters(draft);
    loadClusters(layer, draft);
    const count = Object.values(draft).filter(v => v).length;
    setActiveFiltersCount(count);
    setShowFilters(false);
  };

  const clearFilters = () => {
    setDraft(BLANK_FILTERS);
    setFilters(BLANK_FILTERS);
    setActiveFiltersCount(0);
    loadClusters(layer, {});
  };

  const removeFilter = (key) => {
    const updated = { ...filters, [key]: "" };
    setFilters(updated);
    setDraft(updated);
    setActiveFiltersCount(Object.values(updated).filter(v => v).length);
    loadClusters(layer, updated);
  };

  const visiblePeople    = (layer === "people"    || layer === "both") ? people    : [];
  const visibleCompanies = (layer === "companies" || layer === "both") ? companies : [];
  const allVisible       = [...visiblePeople, ...visibleCompanies];
  const maxCount         = allVisible.length ? Math.max(...allVisible.map(c => c.count)) : 1;
  const totalOnMap       = allVisible.reduce((s, c) => s + c.count, 0);

  const activeChips = Object.entries(filters).filter(([, v]) => v);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid var(--border)",
        background: "var(--surface)", flexWrap: "wrap", gap: 10, flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 12, background: "linear-gradient(135deg,#3b82f6,#2dd4bf)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Globe size={16} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>Data Location Analysis</h2>
            <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
              {loading ? "Loading…" : `${fmt(totalOnMap)} records · ${allVisible.length.toLocaleString()} clusters`}
              {activeFiltersCount > 0 && <span style={{ color: "#a78bfa", marginLeft: 6 }}>· {activeFiltersCount} filter{activeFiltersCount > 1 ? "s" : ""} active</span>}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Layer toggle */}
          <div style={{ display: "flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 2, gap: 2 }}>
            {[
              { id: "people",    icon: Users,     label: "People",    color: PEOPLE_COLOR    },
              { id: "both",      icon: Layers,    label: "Both",      color: "#a78bfa"       },
              { id: "companies", icon: Building2, label: "Companies", color: COMPANIES_COLOR },
            ].map(({ id, icon: Icon, label, color }) => (
              <button key={id} onClick={() => handleLayer(id)} disabled={loading}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                  borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none",
                  borderLeft: layer === id ? `2px solid ${color}` : "2px solid transparent",
                  background: layer === id ? "var(--surface)" : "transparent",
                  color: layer === id ? "var(--text)" : "var(--text-3)", transition: "all 0.15s"
                }}
              >
                <Icon size={11} color={layer === id ? color : undefined} />
                {label}
              </button>
            ))}
          </div>

          {/* Filter button */}
          <button onClick={() => { setDraft(filters); setShowFilters(s => !s); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer",
              border: `1px solid ${activeFiltersCount > 0 ? "#a78bfa" : "var(--border)"}`,
              background: activeFiltersCount > 0 ? "rgba(167,139,250,0.1)" : "transparent",
              color: activeFiltersCount > 0 ? "#a78bfa" : "var(--text-2)"
            }}
          >
            <Filter size={12} />
            Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </button>

          {/* Stats toggle */}
          <button onClick={() => setShowStats(s => !s)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, fontSize: 12, background: "transparent", border: "1px solid var(--border)", color: "var(--text-2)", cursor: "pointer" }}
          >
            <BarChart3 size={12} />
            Stats
          </button>

          {/* Refresh */}
          <button onClick={() => { loadClusters(layer, filters); loadStats(layer === "both" ? "people" : layer); }} disabled={loading}
            style={{ display: "flex", alignItems: "center", padding: "6px 10px", borderRadius: 10, fontSize: 12, background: "transparent", border: "1px solid var(--border)", color: "var(--text-2)", cursor: "pointer" }}
          >
            <RefreshCw size={12} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
          </button>
        </div>
      </div>

      {/* ── Active filter chips ──────────────────────────────── */}
      {activeChips.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 20px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", flexWrap: "wrap", flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Filters:</span>
          {activeChips.map(([key, val]) => (
            <span key={key} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 20, fontSize: 11,
              background: "rgba(167,139,250,0.15)", color: "#a78bfa",
              border: "1px solid rgba(167,139,250,0.3)"
            }}>
              <span style={{ opacity: 0.7 }}>{key.replace(/_/g, " ")}:</span> {val}
              <button onClick={() => removeFilter(key)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
                <X size={9} color="#a78bfa" />
              </button>
            </span>
          ))}
          <button onClick={clearFilters} style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Clear all
          </button>
        </div>
      )}

      {/* ── Filter panel dropdown ────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden", flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
          >
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>

                {/* City */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>City</label>
                  <div style={{ position: "relative" }}>
                    <Search size={11} color="var(--text-3)" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      value={draft.city}
                      onChange={e => setDraft(d => ({ ...d, city: e.target.value }))}
                      placeholder="e.g. Mumbai"
                      style={{ ...INPUT_STYLE, paddingLeft: 26 }}
                    />
                  </div>
                </div>

                {/* State */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>State</label>
                  <div style={{ position: "relative" }}>
                    <Search size={11} color="var(--text-3)" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      value={draft.state}
                      onChange={e => setDraft(d => ({ ...d, state: e.target.value }))}
                      placeholder="e.g. Maharashtra"
                      style={{ ...INPUT_STYLE, paddingLeft: 26 }}
                    />
                  </div>
                </div>

                {/* Industry / Job Title */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                    {layer === "companies" ? "Industry" : "Job Title / Industry"}
                  </label>
                  <div style={{ position: "relative" }}>
                    <Search size={11} color="var(--text-3)" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      value={draft.industry}
                      onChange={e => setDraft(d => ({ ...d, industry: e.target.value }))}
                      placeholder={layer === "companies" ? "e.g. Retail" : "e.g. CEO, Manager"}
                      style={{ ...INPUT_STYLE, paddingLeft: 26 }}
                    />
                  </div>
                </div>

                {/* Has Email — people only */}
                {(layer === "people" || layer === "both") && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                      <Mail size={10} style={{ display: "inline", marginRight: 4 }} />Has Email
                    </label>
                    <select
                      value={draft.has_email}
                      onChange={e => setDraft(d => ({ ...d, has_email: e.target.value }))}
                      style={{ ...INPUT_STYLE }}
                    >
                      <option value="">Any</option>
                      <option value="true">✅ With Email</option>
                      <option value="false">❌ Without Email</option>
                    </select>
                  </div>
                )}

                {/* Has Phone — people only */}
                {(layer === "people" || layer === "both") && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                      <Phone size={10} style={{ display: "inline", marginRight: 4 }} />Has Phone
                    </label>
                    <select
                      value={draft.has_phone}
                      onChange={e => setDraft(d => ({ ...d, has_phone: e.target.value }))}
                      style={{ ...INPUT_STYLE }}
                    >
                      <option value="">Any</option>
                      <option value="true">✅ With Phone</option>
                      <option value="false">❌ Without Phone</option>
                    </select>
                  </div>
                )}

                {/* Min Rating — companies only */}
                {(layer === "companies" || layer === "both") && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
                      <Star size={10} style={{ display: "inline", marginRight: 4 }} />Min Rating
                    </label>
                    <select
                      value={draft.min_rating}
                      onChange={e => setDraft(d => ({ ...d, min_rating: e.target.value }))}
                      style={{ ...INPUT_STYLE }}
                    >
                      <option value="">Any Rating</option>
                      <option value="3">3.0+</option>
                      <option value="3.5">3.5+</option>
                      <option value="4">4.0+ ⭐</option>
                      <option value="4.5">4.5+ ⭐⭐</option>
                      <option value="5">5.0 only</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={applyFilters}
                  style={{
                    padding: "8px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: "linear-gradient(135deg,#3b82f6,#2dd4bf)", color: "#fff",
                    border: "none", cursor: "pointer"
                  }}
                >
                  Apply Filters
                </button>
                <button onClick={() => { setDraft(BLANK_FILTERS); }}
                  style={{ padding: "8px 16px", borderRadius: 10, fontSize: 13, background: "transparent", border: "1px solid var(--border)", color: "var(--text-2)", cursor: "pointer" }}
                >
                  Reset
                </button>
                <button onClick={() => setShowFilters(false)}
                  style={{ padding: "8px 16px", borderRadius: 10, fontSize: 13, background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Stats sidebar */}
        <AnimatePresence>
          {showStats && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 268, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{ borderRight: "1px solid var(--border)", background: "var(--surface)", overflowY: "auto", overflowX: "hidden", flexShrink: 0 }}
            >
              <div style={{ padding: 14, minWidth: 268, display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Summary */}
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Summary</p>
                  {[
                    { label: "People on map",    val: people.reduce((s,c)=>s+c.count,0),    color: PEOPLE_COLOR,    Icon: Users     },
                    { label: "Companies on map", val: companies.reduce((s,c)=>s+c.count,0), color: COMPANIES_COLOR, Icon: Building2 },
                  ].map(({ label, val, color, Icon }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", marginBottom: 6 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon size={13} color={color} />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: "var(--text-3)" }}>{label}</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{fmt(val)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Legend</p>
                  <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                    {(layer === "people" || layer === "both") && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: `${PEOPLE_COLOR}60`, border: `2px solid ${PEOPLE_COLOR}` }} />
                        <span style={{ fontSize: 11, color: "var(--text-2)" }}>People density</span>
                      </div>
                    )}
                    {(layer === "companies" || layer === "both") && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: `${COMPANIES_COLOR}60`, border: `2px solid ${COMPANIES_COLOR}` }} />
                        <span style={{ fontSize: 11, color: "var(--text-2)" }}>Companies density</span>
                      </div>
                    )}
                    <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6 }}>Circle size ∝ record count</p>
                  </div>
                </div>

                {/* Top Cities */}
                {stats?.topCities?.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Top Cities</p>
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      {stats.topCities.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 6 }}>
                          <button
                            onClick={() => { const u = {...filters, city: c.name}; setFilters(u); setDraft(u); setActiveFiltersCount(Object.values(u).filter(v=>v).length); loadClusters(layer, u); }}
                            style={{ fontSize: 11, color: "var(--text-2)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}
                            title={`Filter by ${c.name}`}
                          >{c.name}</button>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                            <div style={{ height: 4, borderRadius: 2, background: PEOPLE_COLOR, opacity: 0.6, width: `${Math.max(14, (c.count / stats.topCities[0].count) * 52)}px` }} />
                            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace", width: 34, textAlign: "right" }}>{fmt(c.count)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top States */}
                {stats?.topStates?.length > 0 && !stats?.topIndustry && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Top States</p>
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      {stats.topStates.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 6 }}>
                          <button
                            onClick={() => { const u = {...filters, state: c.name}; setFilters(u); setDraft(u); setActiveFiltersCount(Object.values(u).filter(v=>v).length); loadClusters(layer, u); }}
                            style={{ fontSize: 11, color: "var(--text-2)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}
                          >{c.name}</button>
                          <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace" }}>{fmt(c.count)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Industries */}
                {stats?.topIndustry?.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Top Industries</p>
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      {stats.topIndustry.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 6 }}>
                          <button
                            onClick={() => { const u = {...filters, industry: c.name}; setFilters(u); setDraft(u); setActiveFiltersCount(Object.values(u).filter(v=>v).length); loadClusters(layer, u); }}
                            style={{ fontSize: 11, color: "var(--text-2)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}
                          >{c.name}</button>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                            <div style={{ height: 4, borderRadius: 2, background: COMPANIES_COLOR, opacity: 0.6, width: `${Math.max(14, (c.count / stats.topIndustry[0].count) * 52)}px` }} />
                            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace", width: 34, textAlign: "right" }}>{fmt(c.count)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Jobs (People) */}
                {stats?.topJobs?.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Top Job Titles</p>
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      {stats.topJobs.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 6 }}>
                          <button
                            onClick={() => { const u = {...filters, industry: c.name}; setFilters(u); setDraft(u); setActiveFiltersCount(Object.values(u).filter(v=>v).length); loadClusters(layer, u); }}
                            style={{ fontSize: 11, color: "var(--text-2)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}
                          >{c.name}</button>
                          <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace" }}>{fmt(c.count)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Map */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {loading && (
            <div style={{ position: "absolute", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,10,15,0.75)", backdropFilter: "blur(8px)" }}>
              <div style={{ textAlign: "center" }}>
                <RefreshCw size={32} color="var(--accent)" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
                <p style={{ fontSize: 14, color: "var(--text-2)" }}>
                  {activeFiltersCount > 0 ? "Applying filters…" : "Loading geographic clusters…"}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Aggregating millions of lat/long records</p>
              </div>
            </div>
          )}

          <MapContainer center={[22.5, 78.9]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains="abcd" maxZoom={20}
            />
            {allVisible.length > 0 && <FitBounds key={fitKey} clusters={allVisible} />}

            {visiblePeople.map((c, i) => (
              <CircleMarker key={`p-${i}`} center={[c.lat, c.lng]} radius={clusterRadius(c.count, maxCount)}
                pathOptions={{ fillColor: PEOPLE_COLOR, fillOpacity: 0.5, color: PEOPLE_COLOR, weight: 1, opacity: 0.85 }}
              >
                <Tooltip sticky>
                  <b>{c.city && c.city.replace(/^[-0.]+$/, "") ? c.city : "Unknown"}{c.state && c.state.replace(/^[-0.]+$/, "") ? `, ${c.state}` : ""}</b><br />
                  👥 {c.count.toLocaleString()} people<br />
                  <span style={{ opacity: 0.6, fontSize: 10 }}>{c.lat.toFixed(3)}, {c.lng.toFixed(3)}</span>
                </Tooltip>
              </CircleMarker>
            ))}

            {visibleCompanies.map((c, i) => (
              <CircleMarker key={`co-${i}`} center={[c.lat, c.lng]} radius={clusterRadius(c.count, maxCount)}
                pathOptions={{ fillColor: COMPANIES_COLOR, fillOpacity: 0.5, color: COMPANIES_COLOR, weight: 1, opacity: 0.85 }}
              >
                <Tooltip sticky>
                  <b>{c.city && c.city.replace(/^[-0.]+$/, "") ? c.city : "Unknown"}{c.state && c.state.replace(/^[-0.]+$/, "") ? `, ${c.state}` : ""}</b><br />
                  🏢 {c.count.toLocaleString()} companies<br />
                  <span style={{ opacity: 0.6, fontSize: 10 }}>{c.lat.toFixed(3)}, {c.lng.toFixed(3)}</span>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
