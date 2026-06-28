import { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Building2, RefreshCw, Layers, BarChart3, Globe } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const PEOPLE_COLOR    = "#E23744";
const COMPANIES_COLOR = "#22d3ee";

function FitBounds({ clusters }) {
  const map = useMap();
  useEffect(() => {
    if (!clusters.length) return;
    const lats = clusters.map(c => c.lat);
    const lngs = clusters.map(c => c.lng);
    const bounds = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    try { map.fitBounds(bounds, { padding: [40, 40] }); } catch (_) {}
  }, [clusters, map]);
  return null;
}

function clusterRadius(count, maxCount) {
  const ratio = Math.sqrt(count / maxCount);
  return 4 + ratio * 36;
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function LocationAnalysisPage() {
  const { token } = useAuth();
  const [layer,   setLayer]   = useState("both");
  const [loading, setLoading] = useState(true);
  const [people,    setPeople]    = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stats,     setStats]     = useState(null);
  const [showStats, setShowStats] = useState(true);
  const [fitKey,    setFitKey]    = useState(0);

  const headers = { Authorization: `Bearer ${token}` };

  const loadClusters = useCallback(async (type) => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/location-analysis/clusters?type=${type}`, { headers });
      const data = await r.json();
      if (data.people)    setPeople(data.people);
      if (data.companies) setCompanies(data.companies);
      setFitKey(k => k + 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadStats = useCallback(async (type) => {
    try {
      const t = type === "both" ? "people" : type;
      const r = await fetch(`${API_BASE}/location-analysis/stats?type=${t}`, { headers });
      const data = await r.json();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => {
    loadClusters("both");
    loadStats("people");
  }, []);

  const handleLayer = (newLayer) => {
    setLayer(newLayer);
    loadClusters(newLayer);
    loadStats(newLayer === "both" ? "people" : newLayer);
  };

  const visiblePeople    = (layer === "people"    || layer === "both") ? people    : [];
  const visibleCompanies = (layer === "companies" || layer === "both") ? companies : [];
  const allVisible       = [...visiblePeople, ...visibleCompanies];
  const maxCount         = allVisible.length ? Math.max(...allVisible.map(c => c.count)) : 1;
  const totalOnMap       = allVisible.reduce((s, c) => s + c.count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid var(--border)",
        background: "var(--surface)", flexWrap: "wrap", gap: 12, flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 12,
            background: "linear-gradient(135deg,#3b82f6,#2dd4bf)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Globe size={16} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
              Data Location Analysis
            </h2>
            <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
              {loading
                ? "Loading clusters…"
                : `${fmt(totalOnMap)} records mapped · ${allVisible.length.toLocaleString()} clusters`
              }
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Layer toggle */}
          <div style={{
            display: "flex", background: "var(--surface-2)",
            border: "1px solid var(--border)", borderRadius: 12, padding: 2, gap: 2
          }}>
            {[
              { id: "people",    icon: Users,     label: "People",    color: PEOPLE_COLOR    },
              { id: "both",      icon: Layers,    label: "Both",      color: "#a78bfa"       },
              { id: "companies", icon: Building2, label: "Companies", color: COMPANIES_COLOR },
            ].map(({ id, icon: Icon, label, color }) => (
              <button key={id} onClick={() => handleLayer(id)} disabled={loading}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 500,
                  cursor: "pointer", border: "none",
                  borderLeft: layer === id ? `2px solid ${color}` : "2px solid transparent",
                  background: layer === id ? "var(--surface)" : "transparent",
                  color: layer === id ? "var(--text)" : "var(--text-3)",
                  transition: "all 0.15s"
                }}
              >
                <Icon size={11} color={layer === id ? color : undefined} />
                {label}
              </button>
            ))}
          </div>

          <button onClick={() => setShowStats(s => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 10, fontSize: 12,
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-2)", cursor: "pointer"
            }}
          >
            <BarChart3 size={13} />
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>

          <button onClick={() => { loadClusters(layer); loadStats(layer === "both" ? "people" : layer); }}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", borderRadius: 10, fontSize: 12,
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-2)", cursor: "pointer"
            }}
          >
            <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>

        {/* Sidebar */}
        <AnimatePresence>
          {showStats && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 272, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{
                borderRight: "1px solid var(--border)",
                background: "var(--surface)",
                overflowY: "auto", overflowX: "hidden",
                flexShrink: 0
              }}
            >
              <div style={{ padding: 16, minWidth: 272, display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Summary */}
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Summary</p>
                  {[
                    { label: "People on map",    val: people.reduce((s,c) => s+c.count,0),    color: PEOPLE_COLOR,    Icon: Users     },
                    { label: "Companies on map", val: companies.reduce((s,c) => s+c.count,0), color: COMPANIES_COLOR, Icon: Building2 },
                  ].map(({ label, val, color, Icon }) => (
                    <div key={label} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                      borderRadius: 12, border: "1px solid var(--border)",
                      background: "var(--surface-2)", marginBottom: 8
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: `${color}20`,
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>
                        <Icon size={14} color={color} />
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{fmt(val)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Legend</p>
                  <div style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                    {(layer === "people" || layer === "both") && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: `${PEOPLE_COLOR}60`, border: `2px solid ${PEOPLE_COLOR}`, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>People density</span>
                      </div>
                    )}
                    {(layer === "companies" || layer === "both") && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: `${COMPANIES_COLOR}60`, border: `2px solid ${COMPANIES_COLOR}`, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>Companies density</span>
                      </div>
                    )}
                    <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>Circle size ∝ record count in area</p>
                  </div>
                </div>

                {/* Top Cities */}
                {stats?.topCities?.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Top Cities</p>
                    <div style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      {stats.topCities.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            <div style={{
                              height: 4, borderRadius: 2, background: PEOPLE_COLOR, opacity: 0.6,
                              width: `${Math.max(16, (c.count / stats.topCities[0].count) * 56)}px`
                            }} />
                            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace", width: 36, textAlign: "right" }}>{fmt(c.count)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Industries */}
                {stats?.topIndustry?.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 8 }}>Top Industries</p>
                    <div style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      {stats.topIndustry.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            <div style={{
                              height: 4, borderRadius: 2, background: COMPANIES_COLOR, opacity: 0.6,
                              width: `${Math.max(16, (c.count / stats.topIndustry[0].count) * 56)}px`
                            }} />
                            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace", width: 36, textAlign: "right" }}>{fmt(c.count)}</span>
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
                    <div style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      {stats.topStates.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
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
            <div style={{
              position: "absolute", inset: 0, zIndex: 1000,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(10,10,15,0.75)", backdropFilter: "blur(8px)"
            }}>
              <div style={{ textAlign: "center" }}>
                <RefreshCw size={32} color="var(--accent)" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
                <p style={{ fontSize: 14, color: "var(--text-2)" }}>Loading geographic clusters…</p>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Aggregating millions of lat/long records</p>
              </div>
            </div>
          )}

          <MapContainer
            center={[22.5, 78.9]}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains="abcd"
              maxZoom={20}
            />

            {allVisible.length > 0 && <FitBounds key={fitKey} clusters={allVisible} />}

            {visiblePeople.map((c, i) => (
              <CircleMarker key={`p-${i}`} center={[c.lat, c.lng]}
                radius={clusterRadius(c.count, maxCount)}
                pathOptions={{ fillColor: PEOPLE_COLOR, fillOpacity: 0.5, color: PEOPLE_COLOR, weight: 1, opacity: 0.85 }}
              >
                <Tooltip sticky>
                  <b>{c.city && c.city.replace(/^[-0.]+$/, '') ? c.city : 'Unknown'}{c.state ? `, ${c.state}` : ""}</b><br />
                  👥 {c.count.toLocaleString()} people<br />
                  <span style={{ opacity: 0.6, fontSize: 10 }}>{c.lat.toFixed(3)}, {c.lng.toFixed(3)}</span>
                </Tooltip>
              </CircleMarker>
            ))}

            {visibleCompanies.map((c, i) => (
              <CircleMarker key={`co-${i}`} center={[c.lat, c.lng]}
                radius={clusterRadius(c.count, maxCount)}
                pathOptions={{ fillColor: COMPANIES_COLOR, fillOpacity: 0.5, color: COMPANIES_COLOR, weight: 1, opacity: 0.85 }}
              >
                <Tooltip sticky>
                  <b>{c.city && c.city.replace(/^[-0.]+$/, '') ? c.city : 'Unknown'}{c.state ? `, ${c.state}` : ""}</b><br />
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
