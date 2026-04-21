import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Cpu, CalendarClock, Sheet, Trophy,
  Radio, Target, Globe, MapPin, Database, Bot, CheckSquare
} from "lucide-react";

const links = [
  { to: "/app",          label: "Overview",       icon: LayoutDashboard },
  { to: "/app/pipeline",  label: "Pipeline",       icon: Cpu },
  { to: "/app/icp",       label: "ICP Config",     icon: Target },
  { to: "/app/scheduler", label: "Scheduler",      icon: CalendarClock },
  { to: "/app/sheets",    label: "Sheets",         icon: Sheet },
  { to: "/app/leads",     label: "Lead Scores",    icon: Trophy },
  { to: "/app/autonomousagents", label: "Autonomous SDR", icon: Bot },
];

const crawlerLinks = [
  { to: "/app/crawler",   label: "Web Crawler",    icon: Globe },
  { to: "/app/places",    label: "Places Scraper", icon: MapPin },
  { to: "/app/websites",  label: "Website Intel",  icon: Database },
];

function NavItem({ to, label, icon: Icon, collapsed, end }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <motion.div
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.97 }}
          className={isActive ? "nav-item-active" : "nav-item"}
        >
          <Icon size={18} className="flex-shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden whitespace-nowrap text-sm"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </NavLink>
  );
}

export default function Sidebar({ collapsed }) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 224 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-screen sticky top-0 flex flex-col bg-background border-r border-border z-30 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <div className="w-8 h-8 shrink-0 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 22 22" className="text-foreground">
            <rect x="0.5" y="0.5" width="21" height="21" rx="3" stroke="currentColor" fill="none" />
            <path d="M5 16 L5 6 L11 12 L17 6 L17 16" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <p className="font-serif text-lg text-foreground leading-none">Leader</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-1 overflow-y-auto no-scrollbar">
        {links.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} collapsed={collapsed} end={to === "/app"} />
        ))}

        {/* Divider + Crawler section */}
        <div className="my-2 px-3">
          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                <div className="flex-1 h-px bg-border" />
                <span className="eyebrow tracking-widest whitespace-nowrap">
                  Crawler
                </span>
                <div className="flex-1 h-px bg-border" />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-px bg-border mx-1"
              />
            )}
          </AnimatePresence>
        </div>

        {crawlerLinks.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} collapsed={collapsed} end={false} />
        ))}
      </nav>

      {/* Footer status */}
      <div className="px-2 py-3 border-t border-border">
        <div className={`flex items-center gap-2.5 px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-foreground flex-shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="eyebrow overflow-hidden whitespace-nowrap"
              >
                API Online
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
