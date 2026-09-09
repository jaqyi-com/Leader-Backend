import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFeatureFlags } from "../../context/FeatureFlagContext";
import toast from "react-hot-toast";
import {
  ShieldCheck, Check, X, Lock, Eye, EyeOff, Search, Sparkles,
  RefreshCw, RotateCcw, Sliders, Layers, Building2, Users2,
  Mail, Phone, Grid3x3, MapPin, Database, Contact, Linkedin,
  AtSign, Briefcase, Zap, MessageSquare, BookOpen, Bot, Cpu,
  Globe, Globe2, Compass, Share2, Send, GitBranch, Target,
  Calendar, FileSpreadsheet, Bookmark, BarChart3, Kanban,
  CheckSquare, FileText, Receipt, Calculator, Package, DollarSign,
  BookMarked, Settings, Tag, AlertCircle, Info, ChevronRight
} from "lucide-react";

// Icon mapping lookup
const ICON_MAP = {
  Building2, Users2, Mail, Phone, Grid3x3, MapPin, Database,
  Sparkles, Globe, Contact, Linkedin, AtSign, Briefcase, Zap,
  MessageSquare, BookOpen, Bot, Cpu, Globe2, Search, Compass,
  Share2, Send, GitBranch, Target, Calendar, FileSpreadsheet,
  Bookmark, BarChart3, Kanban, CheckSquare, FileText, Receipt,
  Calculator, Package, DollarSign, BookMarked, Settings, ShieldCheck,
  Layers,
};

const CATEGORIES = [
  { key: "all", label: "All Modules" },
  { key: "lead_gen", label: "Lead Gen & Data" },
  { key: "ai_automation", label: "AI & SDR" },
  { key: "crawlers", label: "Scrapers & Crawlers" },
  { key: "outreach_social", label: "Outreach & Social" },
  { key: "crm_suite", label: "CRM Suite" },
  { key: "erp_suite", label: "ERP Suite" },
  { key: "system", label: "System & Core" },
];

const BADGE_OPTIONS = ["", "NEW", "BETA", "HOT", "PRO", "AI", "POPULAR", "ENTERPRISE"];

export default function AdminFeatureManager() {
  const {
    rawFlags,
    summary,
    presets,
    loading,
    simulationMode,
    setSimulationMode,
    updateFeature,
    applyPreset,
    resetDefaults,
    refreshFeatures,
  } = useFeatureFlags();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [savingKey, setSavingKey] = useState(null);
  const [presetLoading, setPresetLoading] = useState(false);

  // Filtered list
  const filteredFlags = useMemo(() => {
    return (rawFlags || []).filter(flag => {
      const matchCat = selectedCategory === "all" || flag.category === selectedCategory;
      const q = search.toLowerCase().trim();
      const matchSearch = !q ||
        flag.title?.toLowerCase().includes(q) ||
        flag.key?.toLowerCase().includes(q) ||
        flag.path?.toLowerCase().includes(q) ||
        flag.description?.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [rawFlags, selectedCategory, search]);

  // Handle single status switch
  const handleStatusChange = async (key, nextStatus) => {
    setSavingKey(key);
    const res = await updateFeature(key, { status: nextStatus });
    setSavingKey(null);
    if (res.success) {
      toast.success(`Updated ${key} -> ${nextStatus.toUpperCase()}`);
    } else {
      toast.error(res.error || "Failed to update feature");
    }
  };

  // Handle badge switch
  const handleBadgeChange = async (key, nextBadge) => {
    setSavingKey(key);
    const res = await updateFeature(key, { badge: nextBadge });
    setSavingKey(null);
    if (res.success) {
      toast.success(`Badge updated for ${key}`);
    } else {
      toast.error(res.error || "Failed to update badge");
    }
  };

  // Handle preset application
  const handleApplyPreset = async (presetKey, presetName) => {
    if (!confirm(`Apply preset "${presetName}"? This will update feature visibility.`)) return;
    setPresetLoading(true);
    const res = await applyPreset(presetKey);
    setPresetLoading(false);
    if (res.success) {
      toast.success(`Applied preset: ${presetName}`);
    } else {
      toast.error(res.error || "Failed to apply preset");
    }
  };

  // Handle factory reset
  const handleReset = async () => {
    if (!confirm("Reset ALL feature flags to factory default settings?")) return;
    setPresetLoading(true);
    const res = await resetDefaults();
    setPresetLoading(false);
    if (res.success) {
      toast.success("Reset all feature flags to factory defaults");
    } else {
      toast.error(res.error || "Failed to reset");
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Hero & Simulation Banner ── */}
      <div
        className="p-6 rounded-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        style={{
          background: "linear-gradient(135deg, var(--surface-2) 0%, var(--surface-3) 100%)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, var(--accent) 0%, #f4576a 100%)" }}
            >
              <Sliders size={18} />
            </div>
            <h2 className="text-xl font-bold text-[var(--text)]">Doott Feature Control Matrix</h2>
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white"
              style={{ background: "var(--accent)" }}
            >
              Live Controller
            </span>
          </div>
          <p className="text-sm text-[var(--text-3)] max-w-xl">
            Turn features ON or OFF in real-time. Changes immediately update user navigation sidebars and lock direct URL access.
          </p>
        </div>

        {/* Live Simulation Mode Toggle */}
        <div
          className="z-10 flex items-center gap-3 p-3 rounded-xl"
          style={{
            background: simulationMode ? "rgba(226,55,68,0.15)" : "var(--surface)",
            border: `1px solid ${simulationMode ? "rgba(226,55,68,0.4)" : "var(--border)"}`,
          }}
        >
          <div className="text-right">
            <div className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5 justify-end">
              {simulationMode ? <EyeOff size={14} className="text-[var(--accent)]" /> : <Eye size={14} className="text-[var(--teal)]" />}
              {simulationMode ? "Simulating Regular User" : "Admin View Active"}
            </div>
            <div className="text-[11px] text-[var(--text-3)]">
              {simulationMode ? "Disabled/Admin modules hidden" : "Viewing all modules with admin privileges"}
            </div>
          </div>
          <button
            onClick={() => setSimulationMode(p => !p)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{
              background: simulationMode ? "var(--accent)" : "var(--surface-3)",
              color: simulationMode ? "#fff" : "var(--text-2)",
              border: "1px solid var(--border)",
            }}
          >
            {simulationMode ? "Exit Simulation" : "Preview User View"}
          </button>
        </div>
      </div>

      {/* ── Quick Stats Metric Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium text-[var(--text-3)] mb-1">Total Modules</div>
          <div className="text-2xl font-black text-[var(--text)]">{summary.total || rawFlags.length}</div>
          <div className="text-[11px] text-[var(--text-3)] mt-1">Configured platform-wide</div>
        </div>

        <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium text-[var(--teal)] mb-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--teal)] animate-pulse" />
            Publicly Enabled
          </div>
          <div className="text-2xl font-black text-[var(--teal)]">{summary.enabled}</div>
          <div className="text-[11px] text-[var(--text-3)] mt-1">Visible to all users</div>
        </div>

        <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium text-[var(--amber)] mb-1 flex items-center gap-1">
            <ShieldCheck size={13} />
            Admin Staging
          </div>
          <div className="text-2xl font-black text-[var(--amber)]">{summary.admin_only}</div>
          <div className="text-[11px] text-[var(--text-3)] mt-1">Visible to owner only</div>
        </div>

        <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium text-[var(--rose)] mb-1 flex items-center gap-1">
            <Lock size={13} />
            Disabled / Hidden
          </div>
          <div className="text-2xl font-black text-[var(--rose)]">{summary.disabled}</div>
          <div className="text-[11px] text-[var(--text-3)] mt-1">Locked from sidebar & URL</div>
        </div>
      </div>

      {/* ── Preset Fast-Action Bar ── */}
      <div className="p-4 rounded-xl space-y-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--accent)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Quick Presets & Master Profiles</span>
          </div>
          <button
            onClick={handleReset}
            disabled={presetLoading}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-[var(--text-3)] hover:text-[var(--rose)] transition-colors"
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
          >
            <RotateCcw size={13} />
            Reset Factory Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(presets || []).map(p => (
            <button
              key={p.key}
              onClick={() => handleApplyPreset(p.key, p.name)}
              disabled={presetLoading}
              className="p-3 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] group cursor-pointer"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                  {p.name}
                </span>
                <ChevronRight size={14} className="text-[var(--text-3)] group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-[11px] text-[var(--text-3)] line-clamp-2 leading-relaxed">
                {p.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map(c => {
            const isActive = selectedCategory === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setSelectedCategory(c.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer"
                style={{
                  background: isActive ? "var(--accent)" : "var(--surface-2)",
                  color: isActive ? "#fff" : "var(--text-2)",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Search Box */}
        <div className="relative min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="text"
            placeholder="Search module or route..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
        </div>
      </div>

      {/* ── Feature Cards Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredFlags.map((flag) => {
            const IconComponent = ICON_MAP[flag.icon] || Layers;
            const isSaving = savingKey === flag.key;

            return (
              <motion.div
                key={flag.key}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden"
                style={{
                  background: "var(--surface-2)",
                  border: `1px solid ${
                    flag.status === "enabled"
                      ? "var(--border)"
                      : flag.status === "admin_only"
                      ? "rgba(245,158,11,0.3)"
                      : "rgba(244,63,94,0.3)"
                  }`,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                }}
              >
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background: flag.status === "enabled"
                            ? "rgba(20,184,166,0.1)"
                            : flag.status === "admin_only"
                            ? "rgba(245,158,11,0.1)"
                            : "rgba(244,63,94,0.1)",
                          color: flag.status === "enabled"
                            ? "var(--teal)"
                            : flag.status === "admin_only"
                            ? "var(--amber)"
                            : "var(--rose)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <IconComponent size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[var(--text)] truncate">
                            {flag.title}
                          </h3>
                          {flag.badge && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-white"
                              style={{
                                background:
                                  flag.badge === "PRO" ? "var(--purple)" :
                                  flag.badge === "AI" ? "var(--teal)" :
                                  flag.badge === "HOT" ? "var(--accent)" :
                                  "var(--blue)"
                              }}
                            >
                              {flag.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-3)] truncate">
                          {flag.path}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text-3)] leading-relaxed mb-4 min-h-[36px]">
                    {flag.description}
                  </p>
                </div>

                {/* Controls Area */}
                <div className="pt-3 border-t border-[var(--border)] flex flex-col gap-2.5">
                  {/* 3-Way Status Switcher */}
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                    <button
                      onClick={() => handleStatusChange(flag.key, "enabled")}
                      disabled={isSaving}
                      className="py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      style={{
                        background: flag.status === "enabled" ? "var(--teal)" : "transparent",
                        color: flag.status === "enabled" ? "#fff" : "var(--text-3)",
                      }}
                    >
                      <Check size={12} />
                      Enabled
                    </button>

                    <button
                      onClick={() => handleStatusChange(flag.key, "admin_only")}
                      disabled={isSaving}
                      className="py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      style={{
                        background: flag.status === "admin_only" ? "var(--amber)" : "transparent",
                        color: flag.status === "admin_only" ? "#000" : "var(--text-3)",
                      }}
                    >
                      <ShieldCheck size={12} />
                      Admin
                    </button>

                    <button
                      onClick={() => handleStatusChange(flag.key, "disabled")}
                      disabled={isSaving}
                      className="py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      style={{
                        background: flag.status === "disabled" ? "var(--rose)" : "transparent",
                        color: flag.status === "disabled" ? "#fff" : "var(--text-3)",
                      }}
                    >
                      <Lock size={12} />
                      Hidden
                    </button>
                  </div>

                  {/* Badge selector & Category tag */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--text-3)] capitalize">{flag.categoryLabel || flag.category}</span>
                    
                    <div className="flex items-center gap-1.5">
                      <Tag size={12} className="text-[var(--text-3)]" />
                      <select
                        value={flag.badge || ""}
                        onChange={(e) => handleBadgeChange(flag.key, e.target.value)}
                        disabled={isSaving}
                        className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-[var(--surface)] text-[var(--text-2)] border border-[var(--border)] cursor-pointer"
                      >
                        <option value="">No Badge</option>
                        {BADGE_OPTIONS.filter(Boolean).map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredFlags.length === 0 && (
        <div className="p-12 text-center text-[var(--text-3)] rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
          <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold">No modules match your search query "{search}".</p>
        </div>
      )}
    </div>
  );
}
