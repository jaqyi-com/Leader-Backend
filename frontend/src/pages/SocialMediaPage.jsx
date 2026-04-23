import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2, Linkedin, Instagram, Twitter, Facebook,
  Sparkles, Loader2, X, Check, Send, Eye,
  TrendingUp, Hash, Clock, CheckCircle2, XCircle,
  Globe, Trash2, RefreshCw, AlertCircle, ChevronRight,
  Zap, ArrowRight, Mail,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getSocialConnections, getSocialIntegrations, createSocialConnectLink,
  deleteSocialConnection, generateSocialPost, createSocialPost,
  getSocialPosts, publishSocialPost, deleteSocialPost,
} from "../api";

// ── Platform meta ─────────────────────────────────────────────────────────────
const PLATFORM_META = {
  linkedin: {
    label: "LinkedIn",    color: "#0A66C2", bg: "rgba(10,102,194,0.12)",
    border: "rgba(10,102,194,0.3)", icon: Linkedin,  gradient: "from-blue-600 to-blue-800",
  },
  instagram: {
    label: "Instagram",   color: "#E1306C", bg: "rgba(225,48,108,0.12)",
    border: "rgba(225,48,108,0.3)", icon: Instagram, gradient: "from-pink-500 to-purple-600",
  },
  facebook: {
    label: "Facebook",   color: "#1877F2", bg: "rgba(24,119,242,0.12)",
    border: "rgba(24,119,242,0.3)", icon: Facebook,  gradient: "from-blue-500 to-blue-700",
  },
  x: {
    label: "X (Twitter)", color: "#f0f0f8", bg: "rgba(240,240,248,0.08)",
    border: "rgba(240,240,248,0.2)", icon: Twitter,  gradient: "from-gray-600 to-gray-800",
  },
};

const STATUS_META = {
  draft:            { label: "Draft",            color: "var(--text-3)",   bg: "var(--surface-3)"           },
  pending_approval: { label: "Pending Approval",  color: "var(--ember)",    bg: "rgba(245,158,11,0.12)"      },
  approved:         { label: "Approved",          color: "var(--emerald)",  bg: "rgba(16,185,129,0.12)"      },
  rejected:         { label: "Rejected",          color: "var(--rose)",     bg: "rgba(244,63,94,0.12)"       },
  published:        { label: "Published",         color: "var(--teal)",     bg: "rgba(34,211,238,0.12)"      },
  failed:           { label: "Failed",            color: "var(--rose)",     bg: "rgba(244,63,94,0.12)"       },
};

// ── Tag Input ─────────────────────────────────────────────────────────────────
function TagInput({ tags, setTags, placeholder, disabled }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim().replace(/^#+/, "");
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setInput("");
  };
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl min-h-[46px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {tags.map((t, i) => (
        <span
          key={i}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: "rgba(108,99,255,0.15)", color: "var(--accent-2)" }}
        >
          <Hash size={10} /> {t}
          {!disabled && (
            <button onClick={() => setTags(tags.filter((_, j) => j !== i))} className="ml-1 opacity-60 hover:opacity-100">
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          onBlur={add}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
          style={{ color: "var(--text)", caretColor: "var(--accent)" }}
          placeholder={tags.length === 0 ? placeholder : "Add more + Enter"}
        />
      )}
    </div>
  );
}

// ── Platform Selector ─────────────────────────────────────────────────────────
function PlatformSelector({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(PLATFORM_META).map(([key, meta]) => {
        const Icon = meta.icon;
        const active = value === key;
        return (
          <motion.button
            key={key}
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={() => !disabled && onChange(key)}
            disabled={disabled}
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all border"
            style={{
              background:   active ? meta.bg    : "var(--surface)",
              borderColor:  active ? meta.color : "var(--border)",
              color:        active ? meta.color : "var(--text-3)",
              boxShadow:    active ? `0 0 12px ${meta.bg}` : "none",
            }}
          >
            <Icon size={16} />
            {meta.label}
            {active && <Check size={14} className="ml-auto" />}
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  const icons = {
    pending_approval: <Clock size={11} />,
    approved: <CheckCircle2 size={11} />,
    rejected: <XCircle size={11} />,
    published: <Check size={11} />,
    failed: <AlertCircle size={11} />,
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {icons[status]}
      {meta.label}
    </span>
  );
}

// ── Connection Card ───────────────────────────────────────────────────────────
function ConnectionCard({ platform, isConnected, connectionId, onConnect, onDisconnect, loading }) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.linkedin;
  const Icon = meta.icon;
  return (
    <motion.div
      whileHover={{ translateY: -2 }}
      className="relative overflow-hidden rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: isConnected ? meta.bg : "var(--surface)",
        border: `1px solid ${isConnected ? meta.border : "var(--border)"}`,
        boxShadow: isConnected ? `0 0 24px ${meta.bg}` : "none",
        transition: "all 0.3s",
      }}
    >
      {/* Glow effect when connected */}
      {isConnected && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 30% 0%, ${meta.bg} 0%, transparent 60%)` }}
        />
      )}
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: isConnected ? meta.color : "var(--surface-2)", color: isConnected ? "#fff" : "var(--text-3)" }}
        >
          <Icon size={20} />
        </div>
        {isConnected && (
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--emerald)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            Connected
          </span>
        )}
      </div>
      <div>
        <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{meta.label}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
          {isConnected ? "Ready to publish posts" : "Click to connect your account"}
        </p>
      </div>
      {isConnected ? (
        <button
          onClick={() => onDisconnect(connectionId)}
          disabled={loading}
          className="btn-ghost text-xs border justify-center"
          style={{ borderColor: "var(--border)", color: "var(--rose)" }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          Disconnect
        </button>
      ) : (
        <button
          onClick={() => onConnect(platform)}
          disabled={loading}
          className="btn-primary text-xs justify-center"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
          Connect {meta.label}
        </button>
      )}
    </motion.div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ["Keywords", "Generate", "Preview", "Approve", "Publish"];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const done    = i + 1 < step;
        const current = i + 1 === step;
        return (
          <div key={s} className="flex items-center gap-1">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: done ? "rgba(16,185,129,0.15)" : current ? "rgba(108,99,255,0.2)" : "var(--surface-2)",
                color:      done ? "var(--emerald)"        : current ? "var(--accent-2)"       : "var(--text-3)",
                border:     `1px solid ${done ? "rgba(16,185,129,0.3)" : current ? "rgba(108,99,255,0.35)" : "var(--border)"}`,
              }}
            >
              {done ? <Check size={10} /> : <span className="w-4 text-center">{i + 1}</span>}
              {s}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight size={10} style={{ color: "var(--text-3)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Post History Row ──────────────────────────────────────────────────────────
function PostRow({ post, onPublish, onDelete, publishing }) {
  const platformMeta = PLATFORM_META[post.platform] || PLATFORM_META.linkedin;
  const PIcon = platformMeta.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3 p-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: platformMeta.bg, color: platformMeta.color }}
        >
          <PIcon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
            {post.generatedContent?.slice(0, 80)}…
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
            {post.keywords?.join(", ")} · {new Date(post.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={post.status} />
          <button
            onClick={() => setExpanded(e => !e)}
            className="btn-ghost p-1.5"
            title="Preview"
          >
            <Eye size={14} />
          </button>
          {post.status === "approved" && (
            <button
              onClick={() => onPublish(post.id || post._id)}
              disabled={publishing}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {publishing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              Publish
            </button>
          )}
          <button onClick={() => onDelete(post.id || post._id)} className="btn-ghost p-1.5" title="Delete">
            <Trash2 size={14} style={{ color: "var(--rose)" }} />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {post.trendSummary && (
                <div
                  className="rounded-lg p-3 text-xs"
                  style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)", color: "var(--teal)" }}
                >
                  <strong>Trend Analysis:</strong> {post.trendSummary}
                </div>
              )}
              <div
                className="rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
              >
                {post.generatedContent}
              </div>
              {post.hashtags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {post.hashtags.map((h, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(108,99,255,0.1)", color: "var(--accent-2)" }}>
                      #{h.replace(/^#/, "")}
                    </span>
                  ))}
                </div>
              )}
              {post.approvalEmail && (
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  <Mail size={11} className="inline mr-1" />
                  Approval sent to: {post.approvalEmail}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function SocialMediaPage() {
  // Connections state
  const [connections, setConnections]   = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [connLoading, setConnLoading]   = useState(false);
  const [connectingProvider, setConnectingProvider] = useState(null);

  // Pipeline state
  const [pipelineStep, setPipelineStep] = useState(1);
  const [keywords, setKeywords]         = useState([]);
  const [platform, setPlatform]         = useState("linkedin");
  const [generating, setGenerating]     = useState(false);
  const [generated, setGenerated]       = useState(null); // { content, trendSummary, hashtags }
  const [approvalEmail, setApprovalEmail] = useState("");
  const [submitting, setSubmitting]     = useState(false);

  // Posts state
  const [posts, setPosts]         = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [publishingId, setPublishingId] = useState(null);

  // Load data
  useEffect(() => {
    loadConnections();
    loadPosts();
  }, []);

  async function loadConnections() {
    setConnLoading(true);
    try {
      const [connRes, intRes] = await Promise.all([
        getSocialConnections(),
        getSocialIntegrations(),
      ]);
      setConnections(connRes.data.connections || []);
      setIntegrations(intRes.data.integrations || []);
    } catch (err) {
      setIntegrations([
        { type: "linkedin", name: "LinkedIn" },
        { type: "instagram", name: "Instagram" },
        { type: "facebook", name: "Facebook" },
        { type: "x", name: "X (Twitter)" },
      ]);
    } finally {
      setConnLoading(false);
    }
  }

  async function loadPosts() {
    setPostsLoading(true);
    try {
      const res = await getSocialPosts();
      setPosts(res.data.posts || []);
    } catch (err) {
      toast.error("Could not load posts history");
    } finally {
      setPostsLoading(false);
    }
  }

  async function handleConnect(provider) {
    setConnectingProvider(provider);
    try {
      const res = await createSocialConnectLink(provider, `${window.location.origin}/app/social?connected=${provider}`);
      const url = res.data.url || res.data.data?.url;
      if (url) {
        window.open(url, "_blank", "width=600,height=700");
        toast.success(`Opening ${provider} OAuth…`);
        setTimeout(loadConnections, 3000);
      } else {
        toast.error("Could not get OAuth URL. Check Unified.to configuration.");
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to initiate connection");
    } finally {
      setConnectingProvider(null);
    }
  }

  async function handleDisconnect(connectionId) {
    if (!confirm("Disconnect this account?")) return;
    try {
      await deleteSocialConnection(connectionId);
      toast.success("Account disconnected");
      loadConnections();
    } catch (err) {
      toast.error("Failed to disconnect");
    }
  }

  async function handleGenerate() {
    if (keywords.length === 0) { toast.error("Add at least one keyword"); return; }
    setGenerating(true);
    const toastId = toast.loading("Analyzing trends & generating post…");
    try {
      const res = await generateSocialPost(keywords, platform);
      setGenerated(res.data);
      setPipelineStep(3);
      toast.success("Post generated!", { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.error || "Generation failed", { id: toastId });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmitForApproval() {
    if (!approvalEmail || !approvalEmail.includes("@")) {
      toast.error("Enter a valid email for approval");
      return;
    }
    setSubmitting(true);
    const toastId = toast.loading("Saving post & sending approval email…");
    try {
      await createSocialPost({
        keywords,
        platform,
        connectionId: connections.find(c => c.integration_type === platform)?.id || null,
        generatedContent: generated.content,
        trendSummary:     generated.trendSummary,
        hashtags:         generated.hashtags,
        approvalEmail,
      });
      toast.success("Approval email sent! Check your inbox.", { id: toastId });
      setPipelineStep(5);
      loadPosts();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to submit", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(postId) {
    setPublishingId(postId);
    const toastId = toast.loading("Publishing via Unified.to…");
    try {
      await publishSocialPost(postId);
      toast.success("Post published successfully!", { id: toastId });
      loadPosts();
    } catch (err) {
      toast.error(err.response?.data?.error || "Publishing failed", { id: toastId });
    } finally {
      setPublishingId(null);
    }
  }

  async function handleDelete(postId) {
    if (!confirm("Delete this post?")) return;
    try {
      await deleteSocialPost(postId);
      toast.success("Post deleted");
      loadPosts();
    } catch (err) {
      toast.error("Failed to delete");
    }
  }

  const resetPipeline = () => {
    setPipelineStep(1);
    setKeywords([]);
    setPlatform("linkedin");
    setGenerated(null);
    setApprovalEmail("");
  };

  // Which platforms are connected
  const connectedMap = {};
  connections.forEach(c => { connectedMap[c.integration_type] = c; });

  return (
    <div className="flex flex-col gap-6 h-full max-w-7xl mx-auto">

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #6c63ff 0%, #a78bfa 100%)", boxShadow: "0 0 20px rgba(108,99,255,0.35)" }}
          >
            <Share2 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Automated Social Media</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              AI-powered trend analysis → content generation → email approval → publish
            </p>
          </div>
        </div>
        <button onClick={loadPosts} className="btn-ghost text-xs gap-1.5">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">

        {/* ── LEFT: Connect Accounts ──────────────────────────────── */}
        <div className="xl:col-span-1 flex flex-col gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm" style={{ color: "var(--text)" }}>Connected Accounts</h2>
              <button onClick={loadConnections} disabled={connLoading} className="btn-ghost p-1.5">
                <RefreshCw size={13} className={connLoading ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {Object.keys(PLATFORM_META).map(platform => {
                const conn = connectedMap[platform];
                return (
                  <ConnectionCard
                    key={platform}
                    platform={platform}
                    isConnected={!!conn}
                    connectionId={conn?.id}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    loading={connectingProvider === platform}
                  />
                );
              })}
            </div>

            <div
              className="mt-4 p-3 rounded-xl text-xs"
              style={{ background: "rgba(108,99,255,0.05)", border: "1px solid rgba(108,99,255,0.15)", color: "var(--text-3)" }}
            >
              <Globe size={12} className="inline mr-1.5" style={{ color: "var(--accent-2)" }} />
              Connect via Unified.to secure OAuth. Your credentials are never stored.
            </div>
          </div>
        </div>

        {/* ── RIGHT: Pipeline + History ───────────────────────────── */}
        <div className="xl:col-span-2 flex flex-col gap-5 min-h-0">

          {/* Pipeline Card */}
          <div className="card p-6">
            {/* Step bar */}
            <div className="mb-6 overflow-x-auto no-scrollbar">
              <StepBar step={pipelineStep} />
            </div>

            <AnimatePresence mode="wait">

              {/* Step 1 — Keywords */}
              {pipelineStep === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div>
                    <h3 className="font-bold text-base mb-1" style={{ color: "var(--text)" }}>
                      <Sparkles size={16} className="inline mr-2" style={{ color: "var(--accent)" }} />
                      Enter Keywords
                    </h3>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      Add keywords and our AI will analyze trending topics around them to generate a high-impact post.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Keywords</label>
                    <TagInput tags={keywords} setTags={setKeywords} placeholder="e.g. AI, SaaS, automation… press Enter" />
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>Press Enter or comma to add each keyword</p>
                  </div>

                  {/* Quick presets */}
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-3)" }}>Quick presets:</p>
                    <div className="flex flex-wrap gap-2">
                      {["AI + Productivity", "SaaS + Growth", "Marketing + Automation", "Tech + Startups", "Sales + CRM"].map(preset => (
                        <button
                          key={preset}
                          onClick={() => {
                            const kws = preset.split("+").map(k => k.trim()).filter(k => !keywords.includes(k));
                            setKeywords(prev => [...prev, ...kws]);
                          }}
                          className="text-xs px-3 py-1.5 rounded-full border transition-all"
                          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-2)" }}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Target Platform</label>
                    <PlatformSelector value={platform} onChange={setPlatform} />
                  </div>

                  <button
                    onClick={() => setPipelineStep(2)}
                    disabled={keywords.length === 0}
                    className="btn-primary w-full justify-center"
                  >
                    Continue <ArrowRight size={14} />
                  </button>
                </motion.div>
              )}

              {/* Step 2 — Generate */}
              {pipelineStep === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div>
                    <h3 className="font-bold text-base mb-1" style={{ color: "var(--text)" }}>
                      <TrendingUp size={16} className="inline mr-2" style={{ color: "var(--teal)" }} />
                      AI Trend Analysis
                    </h3>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      Our AI will research current trends for your keywords and craft an optimized {PLATFORM_META[platform]?.label} post.
                    </p>
                  </div>

                  {/* Summary of inputs */}
                  <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>KEYWORDS</p>
                        <div className="flex flex-wrap gap-1.5">
                          {keywords.map((k, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(108,99,255,0.15)", color: "var(--accent-2)" }}>#{k}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>PLATFORM</p>
                        <span className="text-sm font-semibold" style={{ color: PLATFORM_META[platform]?.color }}>{PLATFORM_META[platform]?.label}</span>
                      </div>
                    </div>
                  </div>

                  {/* What the AI will do */}
                  <div className="space-y-2">
                    {[
                      "Analyze current trending topics for your keywords",
                      `Craft a ${PLATFORM_META[platform]?.label}-optimized post with the right tone & length`,
                      "Generate relevant hashtags to maximize reach",
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-xs" style={{ color: "var(--text-2)" }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(108,99,255,0.15)", color: "var(--accent-2)" }}>
                          {i + 1}
                        </div>
                        {step}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setPipelineStep(1)} className="btn-secondary">← Back</button>
                    <button onClick={handleGenerate} disabled={generating} className="btn-primary flex-1 justify-center">
                      {generating ? (
                        <><Loader2 size={14} className="animate-spin" /> Generating…</>
                      ) : (
                        <><Sparkles size={14} /> Generate Post with AI</>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 3 — Preview */}
              {pipelineStep === 3 && generated && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div>
                    <h3 className="font-bold text-base mb-1" style={{ color: "var(--text)" }}>
                      <Eye size={16} className="inline mr-2" style={{ color: "var(--violet)" }} />
                      Review Generated Post
                    </h3>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      Review the AI-generated content before sending for approval.
                    </p>
                  </div>

                  {/* Trend summary */}
                  {generated.trendSummary && (
                    <div
                      className="rounded-xl p-4 text-sm"
                      style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.2)", color: "var(--teal)" }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-widest mb-1.5 opacity-70">Trend Analysis</p>
                      {generated.trendSummary}
                    </div>
                  )}

                  {/* Post content */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                        {PLATFORM_META[platform]?.label} Post
                      </p>
                      <span className="text-xs" style={{ color: "var(--text-3)" }}>
                        {generated.content?.length} chars
                      </span>
                    </div>
                    <div
                      className="rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                    >
                      {generated.content}
                    </div>
                  </div>

                  {/* Hashtags */}
                  {generated.hashtags?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-3)" }}>Hashtags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {generated.hashtags.map((h, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: "rgba(108,99,255,0.12)", color: "var(--accent-2)" }}>
                            #{h.replace(/^#/, "")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setPipelineStep(2)} className="btn-secondary">← Regenerate</button>
                    <button onClick={() => setPipelineStep(4)} className="btn-primary flex-1 justify-center">
                      <Mail size={14} /> Send for Approval
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 4 — Approval email */}
              {pipelineStep === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div>
                    <h3 className="font-bold text-base mb-1" style={{ color: "var(--text)" }}>
                      <Mail size={16} className="inline mr-2" style={{ color: "var(--ember)" }} />
                      Email Approval
                    </h3>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      Before publishing, the post needs review. We'll send an approval email with Approve/Reject links.
                    </p>
                  </div>

                  <div
                    className="rounded-xl p-4 space-y-2 text-xs"
                    style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", color: "var(--ember)" }}
                  >
                    <p className="font-semibold">How it works:</p>
                    <div className="space-y-1" style={{ color: "var(--text-2)" }}>
                      <p>1. We email the post to your approval address</p>
                      <p>2. Click <strong>Approve</strong> → post moves to "Approved" status</p>
                      <p>3. Return here and click <strong>Publish</strong> to send it live</p>
                      <p>4. Click <strong>Reject</strong> → post is discarded</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                      Approval Email Address
                    </label>
                    <input
                      type="email"
                      className="input"
                      value={approvalEmail}
                      onChange={e => setApprovalEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      The approval email will be sent to this address with Approve & Reject buttons.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setPipelineStep(3)} className="btn-secondary">← Back</button>
                    <button
                      onClick={handleSubmitForApproval}
                      disabled={submitting || !approvalEmail}
                      className="btn-primary flex-1 justify-center"
                    >
                      {submitting ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send Approval Email</>}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 5 — Awaiting / Done */}
              {pipelineStep === 5 && (
                <motion.div key="step5" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="py-8 text-center space-y-5">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                    style={{ background: "rgba(16,185,129,0.15)", border: "2px solid rgba(16,185,129,0.3)" }}
                  >
                    <Mail size={32} style={{ color: "var(--emerald)" }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2" style={{ color: "var(--text)" }}>Approval Email Sent!</h3>
                    <p className="text-sm" style={{ color: "var(--text-3)" }}>
                      Check <strong style={{ color: "var(--text-2)" }}>{approvalEmail}</strong> for the approval email.
                      <br />Once approved, come back here and click <strong style={{ color: "var(--emerald)" }}>Publish</strong> on the post below.
                    </p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button onClick={resetPipeline} className="btn-primary gap-2">
                      <Sparkles size={14} /> Create Another Post
                    </button>
                    <button onClick={loadPosts} className="btn-secondary gap-2">
                      <RefreshCw size={14} /> Refresh History
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* ── Post History ──────────────────────────────────────── */}
          <div className="card flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: "var(--text)" }}>
                <Clock size={14} style={{ color: "var(--accent)" }} />
                Post History
                {posts.length > 0 && (
                  <span className="ml-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(108,99,255,0.15)", color: "var(--accent-2)" }}>
                    {posts.length}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
                {posts.filter(p => p.status === "approved").length > 0 && (
                  <span className="flex items-center gap-1" style={{ color: "var(--emerald)" }}>
                    <CheckCircle2 size={12} />
                    {posts.filter(p => p.status === "approved").length} ready to publish
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {postsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
                </div>
              ) : posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <Share2 size={32} className="mb-3 opacity-20" style={{ color: "var(--text-3)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--text-3)" }}>No posts yet</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>Generate your first AI-powered social post above.</p>
                </div>
              ) : (
                posts.map(post => (
                  <PostRow
                    key={post.id || post._id}
                    post={post}
                    onPublish={handlePublish}
                    onDelete={handleDelete}
                    publishing={publishingId === (post.id || post._id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
