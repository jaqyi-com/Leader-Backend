import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useFeatureFlags } from "../context/FeatureFlagContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight,
  Settings, MessageSquare,
  Users2, Building2, BookOpen,
  ShieldCheck, ChevronDown, LogOut, Sun, Moon,
  Mail, Phone, Grid3x3, MapPin, Database, Sparkles,
  Globe, Contact, Linkedin, AtSign, Briefcase, Zap,
  Bot, Cpu, Globe2, Search, Compass, Share2, Send,
  GitBranch, Target, Calendar, FileSpreadsheet, Bookmark,
  BarChart3, Kanban, CheckSquare, FileText, Receipt,
  Calculator, Package, DollarSign, BookMarked, EyeOff
} from "lucide-react";

// Navigation definition with feature keys
const NAV_SECTIONS = [
  {
    id: "lead_gen",
    label: "Lead Gen & Data",
    links: [
      { key: "companies",         to: "/app/companies",         label: "Companies",         icon: Building2 },
      { key: "people",            to: "/app/people",            label: "People",            icon: Users2 },
      { key: "emails",            to: "/app/email",             label: "Emails",            icon: Mail },
      { key: "numbers",           to: "/app/number",            label: "Numbers",           icon: Phone },
      { key: "categories",        to: "/app/categories",        label: "Categories",        icon: Grid3x3 },
      { key: "cities",            to: "/app/cities",            label: "Cities",            icon: MapPin },
      { key: "inbuild_db",        to: "/app/inbuild-db",        label: "In-Build DB",       icon: Database },
      { key: "db_intelligence",   to: "/app/db-intelligence",   label: "DB Intelligence",   icon: Sparkles },
      { key: "india_data",        to: "/app/india-data",        label: "India Data",        icon: Globe },
      { key: "public_data",       to: "/app/public-data",       label: "Public Contacts",   icon: Contact },
      { key: "lg_linkedin",       to: "/app/lg/linkedin",       label: "LinkedIn Finder",   icon: Linkedin },
      { key: "lg_email",          to: "/app/lg/email",          label: "Email Finder",      icon: AtSign },
      { key: "lg_companies",      to: "/app/lg/companies",      label: "Company Intel",     icon: Briefcase },
      { key: "lg_auto_lead_gen",  to: "/app/lg/auto-lead-gen",  label: "Auto Lead Gen",     icon: Zap },
    ]
  },
  {
    id: "ai_automation",
    label: "AI & SDR Automation",
    links: [
      { key: "chatbot",           to: "/app/chatbot",           label: "Ask Doott",         icon: MessageSquare },
      { key: "chatbot_data",      to: "/app/chatbot/data",      label: "AI Knowledge Base", icon: BookOpen },
      { key: "autonomous_agents", to: "/app/autonomousagents",  label: "Autonomous SDR",    icon: Bot },
      { key: "lg_research",       to: "/app/lg/research",       label: "Deep Research",     icon: Cpu },
    ]
  },
  {
    id: "crawlers",
    label: "Scrapers & Crawlers",
    links: [
      { key: "places_scraper",    to: "/app/places",            label: "Google Places",     icon: MapPin },
      { key: "websites_crawler",  to: "/app/websites",          label: "Web Scraper",       icon: Globe2 },
      { key: "auto_scraper",      to: "/app/auto-scraper",      label: "Auto Scraper",      icon: Search },
      { key: "crawler",           to: "/app/crawler",           label: "Web Crawler",       icon: Compass },
    ]
  },
  {
    id: "outreach_social",
    label: "Outreach & Social",
    links: [
      { key: "social_media",      to: "/app/social",            label: "Social Media",      icon: Share2 },
      { key: "smart_outreach",    to: "/app/outreach",          label: "Smart Outreach",    icon: Send },
      { key: "pipeline",          to: "/app/pipeline",          label: "Sales Pipeline",    icon: GitBranch },
      { key: "icp",               to: "/app/icp",               label: "ICP Target",        icon: Target },
      { key: "scheduler",         to: "/app/scheduler",         label: "Scheduler",         icon: Calendar },
      { key: "sheets",            to: "/app/sheets",            label: "Google Sheets",     icon: FileSpreadsheet },
      { key: "leads",             to: "/app/leads",             label: "Saved Leads",       icon: Bookmark },
    ]
  },
  {
    id: "crm_suite",
    label: "CRM Suite",
    links: [
      { key: "crm_dashboard",     to: "/app/crm/dashboard",     label: "CRM Dashboard",     icon: BarChart3 },
      { key: "crm_pipeline",      to: "/app/crm/pipeline",      label: "Deals Pipeline",    icon: Kanban },
      { key: "crm_activities",    to: "/app/crm/activities",    label: "Activities",        icon: CheckSquare },
      { key: "crm_quotations",    to: "/app/crm/quotations",    label: "Quotations",        icon: FileText },
      { key: "crm_invoices",      to: "/app/crm/invoices",      label: "Invoices",          icon: Receipt },
    ]
  },
  {
    id: "erp_suite",
    label: "ERP Suite",
    links: [
      { key: "accounting",        to: "/app/accounting",        label: "Accounting",        icon: Calculator },
      { key: "inventory",         to: "/app/inventory",         label: "Inventory",         icon: Package },
      { key: "payroll",           to: "/app/payroll",           label: "Payroll",           icon: DollarSign },
    ]
  }
];

/* ── Nav item with dynamic badge & status indicator ─────────── */
function NavItem({ to, label, icon: Icon, collapsed, end, badge, isAdminOnly }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <motion.div
          whileHover={{ x: collapsed ? 0 : 2 }}
          whileTap={{ scale: 0.97 }}
          title={collapsed ? label : undefined}
          className={isActive ? "nav-item-active" : "nav-item"}
        >
          {Icon && <Icon size={15} style={{ flexShrink: 0 }} />}
          
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden whitespace-nowrap flex items-center gap-1.5 flex-1 min-w-0"
              >
                <span className="truncate">{label}</span>
                {badge && (
                  <span
                    className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider text-white flex-shrink-0"
                    style={{
                      background:
                        badge === "PRO" ? "var(--purple)" :
                        badge === "AI" ? "var(--teal)" :
                        badge === "HOT" ? "var(--accent)" :
                        badge === "BETA" ? "var(--amber)" :
                        "var(--blue)"
                    }}
                  >
                    {badge}
                  </span>
                )}
                {isAdminOnly && (
                  <span
                    className="px-1 py-0.2 rounded text-[7px] font-bold uppercase tracking-wider text-black bg-[var(--amber)] flex-shrink-0"
                  >
                    ADMIN
                  </span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
          {isActive && !collapsed && (
            <motion.div
              layoutId="active-indicator"
              className="ml-auto w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "var(--teal)" }}
            />
          )}
        </motion.div>
      )}
    </NavLink>
  );
}

/* ── Section label ────────────────────────────────────────── */
function SectionLabel({ label, collapsed }) {
  return (
    <AnimatePresence initial={false}>
      {!collapsed ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="px-3 mb-1 mt-3 text-[10px] font-semibold uppercase tracking-[0.15em]"
          style={{ color: "var(--text-3)" }}
        >
          {label}
        </motion.p>
      ) : (
        <div className="mt-3 mx-3 h-px" style={{ background: "var(--border)" }} />
      )}
    </AnimatePresence>
  );
}

/* ── Dropdown menu item ───────────────────────────────────── */
function MenuButton({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 8, border: "none",
        background: "transparent",
        color: danger ? "var(--rose)" : "var(--text-2)",
        fontSize: 13, cursor: "pointer", textAlign: "left",
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "rgba(244,63,94,0.08)" : "var(--surface-3)";
        e.currentTarget.style.color = danger ? "var(--rose)" : "var(--text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = danger ? "var(--rose)" : "var(--text-2)";
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Profile section (card + dropdown) ───────────────────── */
function ProfileSection({ collapsed }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  /* Close when clicking outside */
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  function handleLogout() {
    setOpen(false);
    logout();
    navigate("/login");
  }

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const [dropPos, setDropPos] = useState({ top: 0, right: 0, minWidth: 220 });
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.top - 8,
        right: window.innerWidth - rect.right,
        minWidth: Math.max(rect.width, 220),
      });
    }
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? (user?.name || "Profile") : undefined}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 8,
          padding: collapsed ? "6px 8px" : "6px 10px 6px 6px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: open ? "var(--surface-3)" : "var(--surface-2)",
          cursor: "pointer",
          transition: "border-color 0.2s, background 0.15s",
          justifyContent: collapsed ? "center" : "flex-start",
          textAlign: "left",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: "linear-gradient(135deg, var(--accent), #f4576a)",
              color: "#fff", fontSize: 11, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 8px var(--accent-glow)",
            }}
          >
            {initials}
          </div>
        )}

        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: "var(--text)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {user?.name || "User"}
              </div>
            </div>
            <ChevronDown
              size={13}
              style={{
                color: "var(--text-3)", flexShrink: 0,
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              top: dropPos.top,
              right: dropPos.right,
              minWidth: dropPos.minWidth,
              transform: "translateY(-100%)",
              borderRadius: 14,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)",
              overflow: "hidden",
              zIndex: 9999,
            }}
          >
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{user?.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{user?.email}</div>
            </div>

            <div style={{ padding: 6 }}>
              <MenuButton
                icon={dark ? <Sun size={14} /> : <Moon size={14} />}
                label={dark ? "Light Mode" : "Dark Mode"}
                onClick={() => { setOpen(false); toggle(); }}
              />
              <MenuButton
                icon={<Settings size={14} />}
                label="Settings"
                onClick={() => { setOpen(false); navigate("/app/settings"); }}
              />
              <MenuButton
                icon={<LogOut size={14} />}
                label="Sign out"
                danger
                onClick={handleLogout}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Main Dynamic Sidebar ───────────────────────────────────── */
export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  const { isFeatureEnabled, features, isAdmin, simulationMode } = useFeatureFlags();
  const navigate = useNavigate();

  // Check if Ask Doott chatbot is enabled
  const isChatbotActive = isFeatureEnabled("chatbot");

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 220 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className="relative h-screen flex flex-col flex-shrink-0 z-30"
      style={{
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      {/* Subtle glow top */}
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(226,55,68,0.12) 0%, transparent 70%)",
        }}
      />

      {/* ── Header: profile + Ask Doott (if enabled) ─────────── */}
      <div
        className="flex flex-col gap-2 px-2 pt-3 pb-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <ProfileSection collapsed={collapsed} />

        {/* Ask Doott button — only shown if chatbot feature is enabled */}
        {isChatbotActive && (
          <motion.button
            onClick={() => navigate("/app/chatbot")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            title={collapsed ? "Ask Doott" : undefined}
            className="relative flex items-center gap-2 rounded-xl overflow-hidden cursor-pointer"
            style={{
              width: "100%",
              padding: collapsed ? "8px" : "8px 12px",
              justifyContent: collapsed ? "center" : "flex-start",
              background: "linear-gradient(135deg, rgba(226,55,68,0.12) 0%, rgba(244,87,106,0.06) 100%)",
              border: "1px solid rgba(226,55,68,0.25)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <MessageSquare size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden whitespace-nowrap font-bold"
                >
                  Ask Doott
                </motion.span>
              )}
            </AnimatePresence>
            <span
              className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
          </motion.button>
        )}
      </div>

      {/* ── Dynamic Navigation Sections ── */}
      <nav className="flex-1 px-2 pt-2 pb-4 flex flex-col gap-0.5 overflow-y-auto no-scrollbar">
        {NAV_SECTIONS.map((section) => {
          // Filter section links by active feature flags
          const visibleLinks = section.links.filter(link => isFeatureEnabled(link.key));
          if (visibleLinks.length === 0) return null;

          return (
            <div key={section.id} className="flex flex-col gap-0.5">
              <SectionLabel label={section.label} collapsed={collapsed} />
              {visibleLinks.map((link) => {
                const feat = features[link.key];
                const badge = feat?.badge || "";
                const isAdminOnly = feat?.status === "admin_only";

                return (
                  <NavItem
                    key={link.to}
                    to={link.to}
                    label={link.label}
                    icon={link.icon}
                    collapsed={collapsed}
                    badge={badge}
                    isAdminOnly={isAdminOnly}
                    end={false}
                  />
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div
        className="px-2 py-2 flex flex-col gap-1 flex-shrink-0"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {isFeatureEnabled("docs") && (
          <NavItem to="/app/docs" label="How It Works" icon={BookMarked} collapsed={collapsed} end={false} />
        )}

        {isFeatureEnabled("settings") && (
          <NavItem to="/app/settings" label="Settings" icon={Settings} collapsed={collapsed} end={false} />
        )}

        {/* Simulation Mode Indicator Pill */}
        {simulationMode && !collapsed && (
          <div
            className="mt-1 px-2 py-1 rounded-lg text-[10px] font-bold text-center flex items-center justify-center gap-1.5"
            style={{ background: "rgba(245,158,11,0.15)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            <EyeOff size={11} /> User Preview Active
          </div>
        )}
      </div>

      {/* ── Collapse toggle ── */}
      <button
        onClick={onToggle}
        className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center z-50 transition-all duration-200 hover:scale-110 hover:brightness-110 cursor-pointer"
        style={{
          background: "linear-gradient(135deg, var(--accent) 0%, #f4576a 100%)",
          border: "2px solid var(--overlay-border)",
          color: "#ffffff",
          boxShadow: "0 0 12px var(--accent-glow), 0 2px 8px rgba(0,0,0,0.6)",
        }}
      >
        {collapsed ? <ChevronLeft size={14} strokeWidth={3} /> : <ChevronRight size={14} strokeWidth={3} />}
      </button>
    </motion.aside>
  );
}
