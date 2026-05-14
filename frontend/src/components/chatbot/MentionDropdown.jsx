import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { searchFeaturesByMention, FEATURE_REGISTRY } from "../../lib/intentClassifier";

const CATEGORY_COLORS = {
  "Lead Gen": "rgba(226,55,68,0.15)",
  "Outreach": "rgba(14,165,233,0.15)",
  "Tools": "rgba(16,185,129,0.15)",
};

export default function MentionDropdown({ query, onSelect, onClose }) {
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    const q = query.replace(/^@/, "").toLowerCase();
    const found = q.length === 0 ? FEATURE_REGISTRY : searchFeaturesByMention(q);
    setResults(found.slice(0, 8));
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); if (results[activeIdx]) onSelect(results[activeIdx]); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [results, activeIdx, onSelect, onClose]);

  if (results.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        right: 0,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 16px 48px rgba(0,0,0,0.3), 0 0 0 1px var(--border)",
        zIndex: 1000,
        maxHeight: 320,
        overflowY: "auto",
      }}
      ref={listRef}
    >
      {/* Header */}
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 6,
        background: "var(--overlay-1)",
      }}>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>
          ⚡ FEATURES — use @mention to invoke
        </span>
      </div>

      {results.map((feature, idx) => (
        <motion.button
          key={feature.id}
          whileHover={{ background: "var(--overlay-2)" }}
          onClick={() => onSelect(feature)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", background: idx === activeIdx ? "var(--overlay-2)" : "transparent",
            border: "none", cursor: "pointer", textAlign: "left",
            borderBottom: idx < results.length - 1 ? "1px solid var(--border)" : "none",
            transition: "background 0.1s",
          }}
        >
          {/* Icon */}
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: CATEGORY_COLORS[feature.category] || "var(--overlay-2)",
            fontSize: 16, flexShrink: 0,
          }}>
            {feature.emoji}
          </span>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {feature.name}
              </span>
              <span style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 20,
                background: "var(--overlay-2)", color: "var(--text-3)", fontWeight: 500,
              }}>
                {feature.category}
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginTop: 1 }}>
              {feature.description}
            </span>
          </div>

          {/* Mention hint */}
          <span style={{
            fontSize: 11, color: "var(--accent)", fontFamily: "monospace",
            background: "var(--overlay-1)", padding: "2px 6px", borderRadius: 4, flexShrink: 0,
          }}>
            @{feature.mention}
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}
