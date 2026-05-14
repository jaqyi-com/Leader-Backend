import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ChevronDown } from "lucide-react";
import { FEATURE_REGISTRY } from "../../lib/intentClassifier";

const CATEGORIES = ["Lead Gen", "Outreach", "Tools"];

const CATEGORY_STYLE = {
  "Lead Gen": { bg: "rgba(226,55,68,0.12)", color: "var(--accent)" },
  "Outreach": { bg: "rgba(14,165,233,0.12)", color: "#0ea5e9" },
  "Tools": { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
};

export default function FeatureDropdown({ onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = FEATURE_REGISTRY.filter((f) => f.category === cat);
    return acc;
  }, {});

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          background: open ? "var(--accent)" : "var(--overlay-2)",
          border: "1px solid var(--border)",
          borderRadius: 10, padding: "7px 11px",
          cursor: "pointer",
          color: open ? "var(--bg)" : "var(--text-2)",
          fontSize: 12, fontWeight: 600,
          transition: "all 0.2s",
        }}
      >
        <Zap size={13} />
        Features
        <ChevronDown size={11} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 10px)",
              left: 0,
              width: 320,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px var(--border)",
              zIndex: 1000,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--border)",
              background: "var(--overlay-1)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Zap size={14} color="var(--accent)" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Feature Launcher</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>Select a feature to invoke inline</div>
              </div>
            </div>

            {/* Categories */}
            <div style={{ maxHeight: 380, overflowY: "auto", padding: "8px 0" }}>
              {CATEGORIES.map((cat) => (
                <div key={cat}>
                  <div style={{
                    padding: "6px 14px 4px",
                    fontSize: 10, fontWeight: 700,
                    color: CATEGORY_STYLE[cat]?.color || "var(--text-3)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>
                    {cat}
                  </div>
                  {grouped[cat].map((feature) => (
                    <motion.button
                      key={feature.id}
                      whileHover={{ background: "var(--overlay-2)" }}
                      onClick={() => { onSelect(feature); setOpen(false); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 14px", background: "transparent",
                        border: "none", cursor: "pointer", textAlign: "left",
                        transition: "background 0.1s",
                      }}
                    >
                      <span style={{
                        width: 30, height: 30, borderRadius: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: CATEGORY_STYLE[cat]?.bg || "var(--overlay-2)",
                        fontSize: 15, flexShrink: 0,
                      }}>
                        {feature.emoji}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                          {feature.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                          {feature.description}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontFamily: "monospace",
                        color: "var(--text-3)", flexShrink: 0,
                      }}>
                        @{feature.mention}
                      </span>
                    </motion.button>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
