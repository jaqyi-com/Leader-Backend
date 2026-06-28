import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Building2, Users, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronDown, Trash2,
  RefreshCw, BarChart3, Target, Zap, Shield,
  ArrowUpRight, ArrowDownRight, Info,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const CATEGORIES = [
  { value: "QSR",        label: "🍔 QSR / Fast Food"     },
  { value: "Retail",     label: "🛍️ Retail"              },
  { value: "Pharmacy",   label: "💊 Pharmacy"             },
  { value: "Grocery",    label: "🛒 Grocery"              },
  { value: "Fintech",    label: "💳 Fintech"              },
  { value: "Logistics",  label: "📦 Logistics / Hub"      },
  { value: "Insurance",  label: "🔒 Insurance"            },
  { value: "Beauty",     label: "💅 Beauty / Salon"       },
];

const REC_META = {
  STRONG_BUY: { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "Strong Buy", icon: CheckCircle2 },
  BUY:        { color: "#84cc16", bg: "rgba(132,204,22,0.12)", label: "Buy",         icon: CheckCircle2 },
  HOLD:       { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "Hold",        icon: Clock        },
  AVOID:      { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  label: "Avoid",       icon: XCircle      },
};

// ── Animated Score Ring ─────────────────────────────────────────────────────
function ScoreRing({ score = 0, label, color, size = 120, delay = 0 }) {
  const [displayed, setDisplayed] = useState(0);
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayed / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => {
      let start = 0;
      const step = () => {
        start += 2;
        setDisplayed(Math.min(start, score));
        if (start < score) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timer);
  }, [score, delay]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none"
            stroke="var(--surface-3)" strokeWidth={10} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none"
            stroke={color} strokeWidth={10}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.05s linear" }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{displayed}</span>
          <span style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>/100</span>
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textAlign: "center" }}>{label}</span>
    </div>
  );
}

// ── Risk Card ───────────────────────────────────────────────────────────────
function RiskCard({ risk }) {
  const impactColor = {
    HIGH:   { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   text: "#ef4444" },
    MEDIUM: { bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)",  text: "#f59e0b" },
    LOW:    { bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.25)",   text: "#22c55e" },
  }[risk.impact] || {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: impactColor.bg,
        border: `1px solid ${impactColor.border}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{risk.risk_name}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: impactColor.text,
          background: impactColor.bg, border: `1px solid ${impactColor.border}`,
          padding: "2px 8px", borderRadius: 6,
        }}>{risk.impact}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--surface-3)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${risk.probability}%`,
            background: impactColor.text, borderRadius: 2,
            transition: "width 1s ease",
          }} />
        </div>
        <span style={{ fontSize: 11, color: impactColor.text, fontWeight: 700, minWidth: 30 }}>
          {risk.probability}%
        </span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{risk.recommendation}</p>
    </motion.div>
  );
}

// ── Stat Pill ───────────────────────────────────────────────────────────────
function StatPill({ label, value, icon: Icon, color = "var(--accent)" }) {
  return (
    <div style={{
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 10, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${color}18`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{value}</div>
      </div>
    </div>
  );
}

// ── History Row ─────────────────────────────────────────────────────────────
function HistoryRow({ item, onLoad, onDelete }) {
  const rec = REC_META[item.final_recommendation] || REC_META.HOLD;
  const Icon = rec.icon;

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <td style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {item.formatted_address || item.address || item.pin_code || "—"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <span style={{ fontSize: 12, color: "var(--text-2)" }}>{item.business_category}</span>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <span style={{
          fontSize: 13, fontWeight: 800,
          color: item.overall_score >= 70 ? "#22c55e" : item.overall_score >= 50 ? "#f59e0b" : "#ef4444",
        }}>
          {item.overall_score ?? "—"}
        </span>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Icon size={13} style={{ color: rec.color }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: rec.color }}>{rec.label}</span>
        </div>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => onLoad(item)}
            style={{
              padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--surface-2)", color: "var(--text-2)",
              fontSize: 11, cursor: "pointer", fontWeight: 600,
            }}
          >View</button>
          <button
            onClick={() => onDelete(item._id)}
            style={{
              padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.25)",
              background: "rgba(239,68,68,0.08)", color: "#ef4444",
              fontSize: 11, cursor: "pointer",
            }}
          ><Trash2 size={11} /></button>
        </div>
      </td>
    </motion.tr>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════
export default function LocationIQPage() {
  const [tab,      setTab]      = useState("score");   // "score" | "history"
  const [pin,      setPin]      = useState("");
  const [address,  setAddress]  = useState("");
  const [category, setCategory] = useState("Retail");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);

  const [history,      setHistory]      = useState([]);
  const [histLoading,  setHistLoading]  = useState(false);
  const [histPage,     setHistPage]     = useState(1);
  const [histTotal,    setHistTotal]    = useState(0);

  const token = localStorage.getItem("token") || sessionStorage.getItem("token");

  // ── Fetch history ─────────────────────────────────────────────────────
  async function loadHistory(page = 1) {
    setHistLoading(true);
    try {
      const r = await fetch(`${API_BASE}/locationiq/history?page=${page}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setHistory(data.data || []);
      setHistTotal(data.pagination?.total || 0);
      setHistPage(page);
    } catch (e) {
      console.error(e);
    } finally {
      setHistLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "history") loadHistory(1);
  }, [tab]);

  // ── Score location ────────────────────────────────────────────────────
  async function handleScore() {
    if (!pin.trim() && !address.trim()) {
      setError("Enter a PIN code or address");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const r = await fetch(`${API_BASE}/locationiq/score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pin_code: pin.trim() || undefined,
          address:  address.trim() || undefined,
          business_category: category,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Scoring failed");
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Load a history item into scorer ──────────────────────────────────
  async function loadHistoryItem(item) {
    try {
      const r = await fetch(`${API_BASE}/locationiq/history/${item._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const full = await r.json();
      setResult(full.result || full);
      setPin(full.pin_code || "");
      setAddress(full.address || "");
      setCategory(full.business_category || "Retail");
      setTab("score");
    } catch (e) { console.error(e); }
  }

  // ── Delete history ────────────────────────────────────────────────────
  async function deleteItem(id) {
    await fetch(`${API_BASE}/locationiq/history/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadHistory(histPage);
  }

  const rec = result ? (REC_META[result.final_recommendation] || REC_META.HOLD) : null;
  const RecIcon = rec?.icon;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, sans-serif" }}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, var(--accent) 0%, #f4576a 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px var(--accent-glow)",
          }}>
            <MapPin size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>
              LocationIQ
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Hyperlocal Demand Prediction &amp; Location Scoring &mdash; powered by 23M+ real data points
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {["score", "history"].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: tab === t ? "none" : "1px solid var(--border)",
                  background: tab === t ? "linear-gradient(135deg, var(--accent), #f4576a)" : "var(--surface-2)",
                  color: tab === t ? "#fff" : "var(--text-2)",
                  textTransform: "capitalize",
                }}
              >{t === "score" ? "Score Location" : "History"}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px" }}>

        {/* ══════════════ SCORE TAB ══════════════ */}
        {tab === "score" && (
          <>
            {/* Input card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "24px 28px",
                marginBottom: 24,
              }}
            >
              <h2 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 700 }}>Enter Location</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 220px auto", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>
                    PIN CODE
                  </label>
                  <input
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    placeholder="e.g. 400001"
                    onKeyDown={e => e.key === "Enter" && handleScore()}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10,
                      border: "1px solid var(--border)", background: "var(--surface-2)",
                      color: "var(--text)", fontSize: 14, boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>
                    ADDRESS (optional)
                  </label>
                  <input
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="e.g. Connaught Place, Delhi"
                    onKeyDown={e => e.key === "Enter" && handleScore()}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10,
                      border: "1px solid var(--border)", background: "var(--surface-2)",
                      color: "var(--text)", fontSize: 14, boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>
                    BUSINESS CATEGORY
                  </label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      style={{
                        width: "100%", padding: "10px 36px 10px 14px", borderRadius: 10,
                        border: "1px solid var(--border)", background: "var(--surface-2)",
                        color: "var(--text)", fontSize: 14, appearance: "none", cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} style={{
                      position: "absolute", right: 12, top: "50%",
                      transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none",
                    }} />
                  </div>
                </div>
                <button
                  onClick={handleScore}
                  disabled={loading}
                  style={{
                    padding: "10px 24px", borderRadius: 10, border: "none",
                    background: loading ? "var(--surface-3)" : "linear-gradient(135deg, var(--accent) 0%, #f4576a 100%)",
                    color: loading ? "var(--text-3)" : "#fff",
                    fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                    boxShadow: loading ? "none" : "0 0 16px var(--accent-glow)",
                    transition: "all 0.2s",
                  }}
                >
                  {loading ? (
                    <><RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} /> Analyzing…</>
                  ) : (
                    <><Zap size={15} /> Analyze Location</>
                  )}
                </button>
              </div>

              {error && (
                <div style={{
                  marginTop: 14, padding: "10px 14px", borderRadius: 10,
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                  color: "#ef4444", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                }}>
                  <AlertTriangle size={14} /> {error}
                </div>
              )}
            </motion.div>

            {/* ── Loading skeleton ─────────────────────────────────────── */}
            {loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    height: 120, borderRadius: 16,
                    background: "linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s infinite",
                  }} />
                ))}
              </div>
            )}

            {/* ── Results ──────────────────────────────────────────────── */}
            <AnimatePresence>
              {result && !loading && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ display: "flex", flexDirection: "column", gap: 20 }}
                >
                  {/* ── Top: location + verdict ──────────────────────── */}
                  <div style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 16, padding: "20px 24px",
                    display: "flex", alignItems: "center", gap: 20,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <MapPin size={14} style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                          {result.location?.formatted_address || result.location?.address || pin}
                        </span>
                        {result._cache === "hit" && (
                          <span style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 4,
                            background: "rgba(132,204,22,0.12)", color: "#84cc16",
                            border: "1px solid rgba(132,204,22,0.25)", fontWeight: 600,
                          }}>CACHED</span>
                        )}
                      </div>
                      <p style={{
                        margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6,
                        maxWidth: 600,
                      }}>
                        {result.decision_summary}
                      </p>
                    </div>

                    {rec && (
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        padding: "16px 24px", borderRadius: 14,
                        background: rec.bg, border: `1px solid ${rec.color}40`,
                        flexShrink: 0,
                      }}>
                        <RecIcon size={28} style={{ color: rec.color, marginBottom: 6 }} />
                        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>VERDICT</span>
                        <span style={{ fontSize: 16, fontWeight: 900, color: rec.color, marginTop: 2 }}>
                          {rec.label.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 24, fontWeight: 900, color: rec.color, lineHeight: 1 }}>
                          {result.scores?.overall_score}/100
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Scores row ─────────────────────────────────────── */}
                  <div style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 16, padding: "24px",
                  }}>
                    <h3 style={{ margin: "0 0 20px", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                      LOCATION SCORES
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
                      <ScoreRing score={result.scores?.demand_score}      label="Demand Score"    color="#3b82f6" delay={0}   />
                      <ScoreRing score={result.scores?.market_saturation}  label="Market Saturation" color="#f59e0b" delay={150} />
                      <ScoreRing score={result.scores?.demographic_fit}   label="Demographic Fit" color="#22c55e" delay={300} />
                      <ScoreRing score={result.scores?.growth_trajectory}  label="Growth Trajectory" color="#a855f7" delay={450} />
                    </div>
                  </div>

                  {/* ── Revenue + Data Stats ─────────────────────────── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Revenue prediction */}
                    <div style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 16, padding: "20px 24px",
                    }}>
                      <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                        REVENUE PREDICTION
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                        <div style={{
                          background: "var(--surface-2)", borderRadius: 12, padding: "14px",
                          border: "1px solid var(--border)",
                        }}>
                          <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, marginBottom: 4 }}>
                            CONSERVATIVE (MONTHLY)
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>
                            {result.revenue_prediction?.conservative_estimate}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                            {result.revenue_prediction?.annual_conservative}/yr
                          </div>
                        </div>
                        <div style={{
                          background: "var(--surface-2)", borderRadius: 12, padding: "14px",
                          border: "1px solid var(--border)",
                        }}>
                          <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, marginBottom: 4 }}>
                            OPTIMISTIC (MONTHLY)
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#3b82f6" }}>
                            {result.revenue_prediction?.optimistic_estimate}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                            {result.revenue_prediction?.annual_optimistic}/yr
                          </div>
                        </div>
                      </div>
                      {/* Confidence bar */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>CONFIDENCE</span>
                          <span style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 700 }}>
                            {result.revenue_prediction?.confidence}%
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "var(--surface-3)", overflow: "hidden" }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${result.revenue_prediction?.confidence || 0}%` }}
                            transition={{ duration: 1, delay: 0.5 }}
                            style={{
                              height: "100%", borderRadius: 3,
                              background: "linear-gradient(90deg, var(--accent), #f4576a)",
                            }}
                          />
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
                          {result.revenue_prediction?.confidence_reason}
                        </p>
                      </div>
                    </div>

                    {/* Real Data Stats */}
                    <div style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 16, padding: "20px 24px",
                    }}>
                      <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                        REAL DATA SIGNALS
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <StatPill
                          label="People (1km)"
                          value={result.raw_data?.people_1km?.toLocaleString("en-IN") || "—"}
                          icon={Users} color="#3b82f6"
                        />
                        <StatPill
                          label="People (5km)"
                          value={result.raw_data?.people_5km?.toLocaleString("en-IN") || "—"}
                          icon={Users} color="#6366f1"
                        />
                        <StatPill
                          label="Businesses (1km)"
                          value={result.raw_data?.biz_1km?.toLocaleString("en-IN") || "—"}
                          icon={Building2} color="#f59e0b"
                        />
                        <StatPill
                          label="Avg Area Rating"
                          value={result.raw_data?.avg_rating ? `${result.raw_data.avg_rating}/5` : "N/A"}
                          icon={BarChart3} color="#22c55e"
                        />
                      </div>

                      {result.raw_data?.top_jobs?.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>
                            TOP OCCUPATIONS NEARBY
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {result.raw_data.top_jobs.map((j, i) => (
                              <span key={i} style={{
                                fontSize: 10, padding: "3px 8px", borderRadius: 5,
                                background: "var(--surface-2)", border: "1px solid var(--border)",
                                color: "var(--text-2)",
                              }}>{j.title}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Competitive + Nearby ───────────────────────────── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Competitive analysis */}
                    <div style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 16, padding: "20px 24px",
                    }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                        COMPETITIVE ANALYSIS
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                        {[
                          { label: "1km", value: result.competitive_analysis?.competitors_1km },
                          { label: "3km", value: result.competitive_analysis?.competitors_3km },
                          { label: "5km", value: result.competitive_analysis?.competitors_5km },
                        ].map(({ label, value }) => (
                          <div key={label} style={{
                            background: "var(--surface-2)", borderRadius: 10, padding: "12px",
                            border: "1px solid var(--border)", textAlign: "center",
                          }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{value ?? "—"}</div>
                            <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600 }}>Biz within {label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{
                        padding: "10px 12px", borderRadius: 10,
                        background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                      }}>
                        <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, marginBottom: 4 }}>
                          <Target size={11} style={{ display: "inline", marginRight: 5 }} />
                          MARKET OPPORTUNITY: {result.competitive_analysis?.market_share_opportunity}/100
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                          {result.competitive_analysis?.opportunity_summary}
                        </p>
                      </div>
                    </div>

                    {/* Nearby businesses */}
                    <div style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 16, padding: "20px 24px",
                    }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                        NEARBY BUSINESSES (3KM)
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                        {(result.raw_data?.nearby_biz || []).length === 0 && (
                          <p style={{ fontSize: 12, color: "var(--text-3)" }}>No businesses found nearby</p>
                        )}
                        {(result.raw_data?.nearby_biz || []).map((b, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "8px 10px", borderRadius: 8,
                            background: "var(--surface-2)", border: "1px solid var(--border)",
                          }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{b.name}</div>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>{b.industry || "General"}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>{b.dist_km}km</div>
                              {b.rating && (
                                <div style={{ fontSize: 10, color: "#f59e0b" }}>★ {b.rating}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── Risk Assessment ────────────────────────────────── */}
                  <div style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 16, padding: "20px 24px",
                  }}>
                    <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                      RISK ASSESSMENT
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                      {(result.risk_assessment || []).map((risk, i) => (
                        <RiskCard key={i} risk={risk} />
                      ))}
                    </div>
                  </div>

                  {/* ── Demographic Analysis ───────────────────────────── */}
                  <div style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 16, padding: "20px 24px",
                  }}>
                    <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                      DEMOGRAPHIC ANALYSIS
                    </h3>
                    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 4 }}>
                          PRIMARY DEMOGRAPHIC
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
                          {result.demographic_analysis?.primary_demographic || "—"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 4 }}>
                          PROFESSIONAL DENSITY
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                          {result.demographic_analysis?.professional_density || "—"}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 4 }}>
                          FIT FOR {category.toUpperCase()}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <div style={{
                            flex: 1, height: 8, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden",
                          }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${result.demographic_analysis?.fit_for_business || 0}%` }}
                              transition={{ duration: 1, delay: 0.3 }}
                              style={{
                                height: "100%", borderRadius: 4,
                                background: "linear-gradient(90deg, #22c55e, #84cc16)",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#22c55e" }}>
                            {result.demographic_analysis?.fit_for_business}%
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 4 }}>
                          AI RECOMMENDATION
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
                          {result.demographic_analysis?.recommendation}
                        </div>
                      </div>
                    </div>
                  </div>

                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* ══════════════ HISTORY TAB ══════════════ */}
        {tab === "history" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 16, overflow: "hidden",
            }}
          >
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Query History</h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-3)" }}>
                  {histTotal} location{histTotal !== 1 ? "s" : ""} scored
                </p>
              </div>
              <button
                onClick={() => loadHistory(histPage)}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--surface-2)", color: "var(--text-2)",
                  fontSize: 12, cursor: "pointer", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {histLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
                <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 13 }}>Loading history…</p>
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center" }}>
                <MapPin size={32} style={{ color: "var(--text-3)", marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-3)" }}>No locations scored yet</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-3)" }}>Go to Score Location to analyze your first PIN</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      {["Location", "Category", "Score", "Verdict", "Actions"].map(h => (
                        <th key={h} style={{
                          padding: "10px 12px", textAlign: "left",
                          fontSize: 10, fontWeight: 700, color: "var(--text-3)",
                          textTransform: "uppercase", letterSpacing: "0.08em",
                          borderBottom: "1px solid var(--border)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(item => (
                      <HistoryRow key={item._id} item={item} onLoad={loadHistoryItem} onDelete={deleteItem} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {Math.ceil(histTotal / 20) > 1 && (
              <div style={{
                padding: "14px 24px", borderTop: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {Array.from({ length: Math.ceil(histTotal / 20) }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => loadHistory(p)}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: histPage === p ? "var(--accent)" : "var(--surface-2)",
                      color: histPage === p ? "#fff" : "var(--text-2)",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}
                  >{p}</button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
