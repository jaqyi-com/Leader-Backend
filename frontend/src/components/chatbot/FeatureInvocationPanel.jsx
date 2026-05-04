import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink, Play, Loader2, Check, AlertCircle,
  X, Plus, ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";

// API imports
import {
  lgLinkedInSearch, lgEmailFind, lgCompanySearch, lgResearchStart,
  generateSocialPost, runFull, startAutoScraper,
} from "../../api";

// ── Mini tag input ──────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder }) {
  const [val, setVal] = useState("");
  const add = (v = val) => {
    const t = v.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setVal("");
  };
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 10px",
      background: "var(--overlay-1)", border: "1px solid var(--border)",
      borderRadius: 9, minHeight: 36, alignItems: "center",
    }}>
      {tags.map((t) => (
        <span key={t} style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "rgba(108,99,255,0.15)", color: "var(--accent)",
          borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600,
        }}>
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}>
            <X size={9} />
          </button>
        </span>
      ))}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={() => add()}
        placeholder={tags.length ? "" : placeholder}
        style={{
          flex: 1, minWidth: 100, background: "transparent", border: "none", outline: "none",
          fontSize: 12, color: "var(--text)",
        }}
      />
    </div>
  );
}

// ── Mini text input ─────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "7px 10px", background: "var(--overlay-1)",
          border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)",
          fontSize: 12, outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// ── Platform pill selector ──────────────────────────────────────
function PlatformPicker({ value, onChange }) {
  const platforms = ["linkedin", "twitter", "instagram", "facebook"];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {platforms.map((p) => (
        <button key={p} onClick={() => onChange(p)}
          style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
            border: `1px solid ${value === p ? "var(--accent)" : "var(--border)"}`,
            background: value === p ? "rgba(108,99,255,0.15)" : "var(--overlay-1)",
            color: value === p ? "var(--accent)" : "var(--text-2)",
            cursor: "pointer", textTransform: "capitalize",
          }}>
          {p}
        </button>
      ))}
    </div>
  );
}

// ── Result renderer ─────────────────────────────────────────────
function ResultCard({ feature, result }) {
  if (!result) return null;

  if (result.navigated) {
    return (
      <div style={{
        background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
        borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
        fontSize: 12, color: "var(--emerald)", marginTop: 10,
      }}>
        <Check size={14} /> Navigated to {feature.name} with your parameters pre-applied!
      </div>
    );
  }

  if (result.started) {
    return (
      <div style={{
        background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
        borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--emerald)",
        marginTop: 10, display: "flex", alignItems: "center", gap: 8,
      }}>
        <Check size={14} /> {result.message}
      </div>
    );
  }

  if (result.post) {
    return (
      <div style={{
        background: "var(--overlay-1)", border: "1px solid var(--border)",
        borderRadius: 10, padding: 12, marginTop: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 8 }}>
          ✨ Generated Post
        </div>
        <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {result.post}
        </div>
      </div>
    );
  }

  if (result.emails?.length) {
    return (
      <div style={{ marginTop: 10 }}>
        {result.emails.map((e, i) => (
          <div key={i} style={{
            background: "var(--overlay-1)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 12px", marginBottom: 6,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 12, color: "var(--text)",
          }}>
            <span>{e.email}</span>
            <span style={{ fontSize: 10, color: e.score > 80 ? "var(--emerald)" : "var(--ember)" }}>
              {e.score}% confidence
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (result.people?.length) {
    return (
      <div style={{ marginTop: 10 }}>
        {result.people.slice(0, 4).map((p, i) => (
          <div key={i} style={{
            background: "var(--overlay-1)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 12px", marginBottom: 6, fontSize: 12,
          }}>
            <div style={{ fontWeight: 600, color: "var(--text)" }}>{p.name}</div>
            <div style={{ color: "var(--text-3)", marginTop: 2 }}>{p.title} · {p.company}</div>
          </div>
        ))}
        {result.people.length > 4 && (
          <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", marginTop: 4 }}>
            +{result.people.length - 4} more results
          </div>
        )}
      </div>
    );
  }

  if (result.companies?.length) {
    return (
      <div style={{ marginTop: 10 }}>
        {result.companies.slice(0, 3).map((c, i) => (
          <div key={i} style={{
            background: "var(--overlay-1)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 12px", marginBottom: 6, fontSize: 12,
          }}>
            <div style={{ fontWeight: 600, color: "var(--text)" }}>{c.name}</div>
            <div style={{ color: "var(--text-3)", marginTop: 2 }}>
              {c.industry} · {c.size} employees
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Generic JSON fallback
  return (
    <div style={{
      background: "var(--overlay-1)", border: "1px solid var(--border)",
      borderRadius: 10, padding: 10, marginTop: 10,
      fontSize: 11, color: "var(--text-2)", fontFamily: "monospace",
      maxHeight: 120, overflowY: "auto",
    }}>
      {JSON.stringify(result, null, 2).slice(0, 500)}
    </div>
  );
}

// ── Feature-specific forms ──────────────────────────────────────
function FeatureForm({ feature, params, onChange }) {
  const p = params;
  const set = (key) => (val) => onChange({ ...p, [key]: val });

  switch (feature.id) {
    case "auto_scraper":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>
              Industry / Keywords
            </label>
            <TagInput
              tags={p.industryKeywords || []}
              onChange={set("industryKeywords")}
              placeholder="e.g. automobile, fintech, retail..."
            />
          </div>
          <Field label="Location (optional)" value={p.location || ""} onChange={set("location")} placeholder="e.g. Mumbai, Delhi, Bangalore" />
        </div>
      );

    case "linkedin":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Field label="Person Name" value={p.name || `${p.firstName || ""} ${p.lastName || ""}`.trim()} onChange={set("name")} placeholder="e.g. Rahul Sharma" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Company" value={p.company || ""} onChange={set("company")} placeholder="e.g. Google" />
            <Field label="Job Title" value={p.title || ""} onChange={set("title")} placeholder="e.g. CTO" />
          </div>
        </div>
      );

    case "email_finder":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="First Name" value={p.firstName || ""} onChange={set("firstName")} placeholder="John" />
            <Field label="Last Name" value={p.lastName || ""} onChange={set("lastName")} placeholder="Doe" />
          </div>
          <Field label="Domain" value={p.domain || ""} onChange={set("domain")} placeholder="example.com" />
        </div>
      );

    case "company_intel":
      return <Field label="Company Name" value={p.company || ""} onChange={set("company")} placeholder="e.g. Tesla, Infosys..." />;

    case "ai_research":
      return (
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>
            Research Prompt
          </label>
          <textarea
            value={p.prompt || ""}
            onChange={(e) => onChange({ ...p, prompt: e.target.value })}
            rows={3}
            placeholder="Describe what you want researched..."
            style={{
              width: "100%", padding: "7px 10px", background: "var(--overlay-1)",
              border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)",
              fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
      );

    case "places":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Field label="Search Keyword" value={p.keyword || ""} onChange={set("keyword")} placeholder="e.g. restaurants, pharmacies..." />
          <Field label="Location" value={p.location || ""} onChange={set("location")} placeholder="e.g. Andheri Mumbai" />
        </div>
      );

    case "crawler":
      return <Field label="Website URL" value={p.url || ""} onChange={set("url")} placeholder="https://example.com" type="url" />;

    case "social":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Platform</label>
            <PlatformPicker value={p.platform || "linkedin"} onChange={set("platform")} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Topic / Keywords</label>
            <TagInput tags={p.keywords || []} onChange={set("keywords")} placeholder="e.g. AI, automation, growth..." />
          </div>
        </div>
      );

    case "pipeline":
      return (
        <div style={{
          background: "var(--overlay-1)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--text-2)",
        }}>
          This will run the complete lead generation pipeline: Scrape → Enrich → Score → Outreach.
        </div>
      );

    default:
      return (
        <div style={{
          background: "var(--overlay-1)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--text-2)",
        }}>
          Click "Open Full Page" to use this feature with all its options.
        </div>
      );
  }
}

// ── Execute feature API call ────────────────────────────────────
async function executeFeature(featureId, params, navigate) {
  switch (featureId) {
    case "auto_scraper": {
      if (!params.industryKeywords?.length) throw new Error("Add at least one industry keyword");
      const { data } = await startAutoScraper({
        industryKeywords: params.industryKeywords,
        location: params.location || null,
      });
      return { started: true, message: `Auto Scraper started! Session ID: ${data.sessionId}. Check the Auto Scraper page for live progress.`, sessionId: data.sessionId };
    }
    case "linkedin": {
      const { data } = await lgLinkedInSearch(params);
      return data;
    }
    case "email_finder": {
      const { data } = await lgEmailFind(params);
      return data;
    }
    case "company_intel": {
      if (!params.company) throw new Error("Enter a company name");
      const { data } = await lgCompanySearch({ name: params.company });
      return data;
    }
    case "ai_research": {
      if (!params.prompt) throw new Error("Enter a research prompt");
      const { data } = await lgResearchStart(params.prompt);
      return { started: true, message: `Research agent started! Check the AI Research page for results.` };
    }
    case "social": {
      const kws = Array.isArray(params.keywords) ? params.keywords.join(", ") : params.keywords || "";
      const { data } = await generateSocialPost(kws, params.platform || "linkedin");
      return { post: data.content || data.post || JSON.stringify(data) };
    }
    case "pipeline": {
      await runFull();
      return { started: true, message: "Full pipeline started! Check the Pipeline page for status." };
    }
    default:
      navigate(FEATURE_REGISTRY_MAP[featureId]?.route || "/app");
      return { navigated: true };
  }
}

// local registry map for navigation
import { FEATURE_REGISTRY } from "../../lib/intentClassifier";
const FEATURE_REGISTRY_MAP = Object.fromEntries(FEATURE_REGISTRY.map((f) => [f.id, f]));

// ── Main Component ──────────────────────────────────────────────
export default function FeatureInvocationPanel({ feature, params: initialParams, explanation, onDismiss }) {
  const navigate = useNavigate();
  const [params, setParams] = useState(initialParams || {});
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const needsNavigationOnly = ["places", "crawler", "outreach", "leads", "websites"].includes(feature.id);

  const handleRun = async () => {
    setStatus("running");
    setResult(null);
    setErrorMsg("");
    try {
      const res = await executeFeature(feature.id, params, navigate);
      setResult(res);
      setStatus("done");
      toast.success(`${feature.name} executed successfully!`);
    } catch (err) {
      setErrorMsg(err?.response?.data?.error || err?.message || "Something went wrong");
      setStatus("error");
      toast.error("Feature execution failed");
    }
  };

  const handleNavigate = () => navigate(feature.route);

  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        overflow: "hidden",
        maxWidth: "100%",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        background: "linear-gradient(135deg, rgba(108,99,255,0.12), rgba(139,92,246,0.08))",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg,var(--accent),#8b5cf6)",
            fontSize: 18,
          }}>
            {feature.emoji}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{feature.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>AI Command Center</div>
          </div>
        </div>
        <button
          onClick={() => { setDismissed(true); onDismiss?.(); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Explanation */}
      {explanation && (
        <div style={{
          padding: "10px 16px",
          background: "rgba(108,99,255,0.05)",
          borderBottom: "1px solid var(--border)",
          fontSize: 12, color: "var(--text-2)", lineHeight: 1.5,
        }}>
          <div className="markdown-content"><ReactMarkdown>{explanation}</ReactMarkdown></div>
        </div>
      )}

      {/* Form */}
      <div style={{ padding: "14px 16px" }}>
        <FeatureForm feature={feature} params={params} onChange={setParams} />

        {/* Error */}
        <AnimatePresence>
          {status === "error" && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 8, padding: "8px 10px", marginTop: 10,
                fontSize: 12, color: "#ef4444",
              }}>
              <AlertCircle size={12} /> {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <ResultCard feature={feature} result={result} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {status !== "done" && !needsNavigationOnly && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleRun}
              disabled={status === "running"}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "linear-gradient(135deg,var(--accent),#8b5cf6)",
                border: "none", borderRadius: 10, padding: "9px 14px",
                cursor: status === "running" ? "not-allowed" : "pointer",
                color: "white", fontSize: 13, fontWeight: 600,
                opacity: status === "running" ? 0.8 : 1,
              }}
            >
              {status === "running"
                ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Running…</>
                : <><Play size={13} /> Run {feature.name}</>
              }
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNavigate}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--overlay-2)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "9px 14px",
              cursor: "pointer", color: "var(--text-2)", fontSize: 12, fontWeight: 500,
            }}
          >
            <ExternalLink size={12} /> Open Full Page
          </motion.button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}
