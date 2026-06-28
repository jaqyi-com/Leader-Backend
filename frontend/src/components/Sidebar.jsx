import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight,
  Settings, MessageSquare,
  Users2, Building2, BookOpen,
  ShieldCheck,
  ChevronDown, LogOut, Sun, Moon,
  Mail, Phone, MapPin, Globe,
} from "lucide-react";

const LEAD_GEN_LINKS = [
  { to: "/app/people",        label: "People",    icon: Users2,    sub: false },
  { to: "/app/people-email",  label: "Email",     icon: Mail,      sub: true  },
  { to: "/app/people-number", label: "Number",    icon: Phone,     sub: true  },
  { to: "/app/companies",     label: "Companies", icon: Building2, sub: false },
];

/* ── Nav item ─────────────────────────────────────────────── */
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
  const { user, org, logout } = useAuth();
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
    // Use a short timeout so the click that opened it doesn't immediately close it
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

  /* Compute dropdown position — right-anchored so it never overflows on right-side sidebar */
  const [dropPos, setDropPos] = useState({ top: 0, right: 0, minWidth: 220 });
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.top - 8,                          // 8px gap above trigger
        right: window.innerWidth - rect.right,       // align right edge to trigger right edge
        minWidth: Math.max(rect.width, 220),
      });
    }
  }, [open]);

  return (
    <>
      {/* Trigger */}
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
        {/* Avatar */}
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

      {/* Dropdown — rendered as fixed overlay so it's never clipped */}
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
              transform: "translateY(-100%)",   /* float above trigger */
              borderRadius: 14,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)",
              overflow: "hidden",
              zIndex: 9999,
            }}
          >
            {/* User info */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{user?.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{user?.email}</div>
            </div>

            {/* Actions */}
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

/* ── Sidebar ────────────────────────────────────────────────── */
export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.email?.toLowerCase() === "akshatv00001@gmail.com";

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

      {/* ── Header: profile + chatbot ─────────────────────────── */}
      <div
        className="flex flex-col gap-2 px-2 pt-3 pb-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <ProfileSection collapsed={collapsed} />

        {/* Ask Doott button */}
        <motion.button
          onClick={() => navigate("/app/chatbot")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          title={collapsed ? "Ask Doott" : undefined}
          className="relative flex items-center gap-2 rounded-xl overflow-hidden"
          style={{
            width: "100%",
            padding: collapsed ? "8px" : "8px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            background: "linear-gradient(135deg, rgba(226,55,68,0.12) 0%, rgba(244,87,106,0.06) 100%)",
            border: "1px solid rgba(226,55,68,0.25)",
            color: "var(--text)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
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
                className="overflow-hidden whitespace-nowrap"
              >
                Ask Doott
              </motion.span>
            )}
          </AnimatePresence>
          {/* Live dot */}
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        </motion.button>
      </div>

      <nav className="flex-1 px-2 pt-2 pb-4 flex flex-col gap-0.5 overflow-y-auto no-scrollbar">
        {/* LocationIQ — Featured */}
        <NavItem to="/app/locationiq"         label="Location IQ"       icon={MapPin} collapsed={collapsed} end={false} />
        <NavItem to="/app/location-analysis"  label="Location Analysis" icon={Globe}  collapsed={collapsed} end={false} />

        {LEAD_GEN_LINKS.map(({ to, label, icon, sub }) => (
          sub ? (
            <div key={to} className={collapsed ? "" : "pl-3"} style={{ opacity: 0.85 }}>
              <NavItem to={to} label={label} icon={icon} collapsed={collapsed} end={false} />
            </div>
          ) : (
            <NavItem key={to} to={to} label={label} icon={icon} collapsed={collapsed} end={false} />
          )
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div
        className="px-2 py-3 flex flex-col gap-1"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <NavItem to="/app/docs" label="How It Works" icon={BookOpen} collapsed={collapsed} end={false} />
        {isAdmin && (
          <NavItem to="/app/admin" label="Admin Analytics" icon={ShieldCheck} collapsed={collapsed} end={false} />
        )}
        <NavItem to="/app/settings" label="Settings" icon={Settings} collapsed={collapsed} end={false} />
      </div>

      {/* ── Collapse toggle — positioned at vertical center ────── */}
      <button
        onClick={onToggle}
        className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center z-50 transition-all duration-200 hover:scale-110 hover:brightness-110"
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
