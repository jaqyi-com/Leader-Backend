import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Cpu, CalendarClock, Sheet, Trophy,
  Target, Globe, MapPin, Database, Bot, ChevronLeft, ChevronRight,
  Zap, Settings, Share2, MessageSquare, Sparkles,
} from "lucide-react";

const MAIN_LINKS = [
  { to: "/app",              label: "Overview",       icon: LayoutDashboard, end: true },
  { to: "/app/pipeline",     label: "Pipeline",       icon: Cpu },
  { to: "/app/icp",          label: "ICP Config",     icon: Target },
  { to: "/app/scheduler",    label: "Scheduler",      icon: CalendarClock },
  { to: "/app/sheets",       label: "Data",           icon: Sheet },
  { to: "/app/leads",        label: "Lead Scores",    icon: Trophy },
  { to: "/app/autonomousagents", label: "Autonomous SDR", icon: Bot },
  { to: "/app/settings",     label: "Settings",       icon: Settings },
];

const CRAWLER_LINKS = [
  { to: "/app/crawler",      label: "Web Crawler",   icon: Globe     },
  { to: "/app/websites",    label: "Website Intel",  icon: Database  },
  { to: "/app/auto-scraper",label: "Auto Scraper",   icon: Sparkles  },
  { to: "/app/places",      label: "Places Scraper", icon: MapPin    },
];

const SOCIAL_LINKS = [
  { to: "/app/social", label: "Social Media", icon: Share2 },
];

const AI_LINKS = [
  { to: "/app/chatbot", label: "AI ChatBot", icon: MessageSquare },
];

function NavItem({ to, label, icon: Icon, collapsed, end }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <motion.div
          whileHover={{ x: collapsed ? 0 : 2 }}
          whileTap={{ scale: 0.97 }}
          title={collapsed ? label : undefined}
          className={isActive ? "nav-item-active" : "nav-item"}
        >
          <Icon size={16} className="flex-shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden whitespace-nowrap"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          {isActive && !collapsed && (
            <motion.div
              layoutId="active-indicator"
              className="ml-auto w-1.5 h-1.5 rounded-full bg-accent"
            />
          )}
        </motion.div>
      )}
    </NavLink>
  );
}

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

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 220 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className="relative h-screen flex flex-col flex-shrink-0 overflow-hidden z-30"
      style={{
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Subtle glow top */}
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(108,99,255,0.12) 0%, transparent 70%)",
        }}
      />

      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 h-16 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)",
            boxShadow: "0 0 16px var(--accent-glow)",
          }}
        >
          <Zap size={15} className="text-white" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <span className="font-bold text-base tracking-tight" style={{ color: "var(--text)" }}>
                Leader
              </span>
              <span
                className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--accent-2)" }}
              >
                AI
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5 overflow-y-auto no-scrollbar">
        {MAIN_LINKS.map(({ to, label, icon, end }) => (
          <NavItem key={to} to={to} label={label} icon={icon} collapsed={collapsed} end={end} />
        ))}

        <SectionLabel label="Crawler" collapsed={collapsed} />

        {CRAWLER_LINKS.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} collapsed={collapsed} end={false} />
        ))}

        <SectionLabel label="Outreach" collapsed={collapsed} />

        {SOCIAL_LINKS.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} collapsed={collapsed} end={false} />
        ))}

        <SectionLabel label="AI" collapsed={collapsed} />

        {AI_LINKS.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} collapsed={collapsed} end={false} />
        ))}
      </nav>

      {/* Status dot */}
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 pulse-dot"
          style={{ background: "var(--emerald)" }}
        />
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs font-medium"
              style={{ color: "var(--text-3)" }}
            >
              API Online
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[72px] w-6 h-6 rounded-full flex items-center justify-center z-50"
        style={{
          background: "var(--surface-3)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
        }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  );
}
