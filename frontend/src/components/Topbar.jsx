import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, ChevronDown, LogOut, Settings, Building2, MessageSquare } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const PAGE_META = {
  "/app":                { title: "Overview",       sub: "Real-time pipeline intelligence" },
  "/app/pipeline":       { title: "Pipeline",       sub: "Run and monitor scrape phases" },
  "/app/icp":            { title: "ICP Config",     sub: "Configure ideal customer profile" },
  "/app/scheduler":      { title: "Scheduler",      sub: "Automate pipeline phases" },
  "/app/sheets":         { title: "Data",           sub: "Browse and manage all records" },
  "/app/leads":          { title: "Lead Scores",    sub: "Prioritized contacts by AI score" },
  "/app/autonomousagents":{ title: "Autonomous SDR", sub: "One-on-one AI outreach agent" },
  "/app/crawler":        { title: "Web Crawler",    sub: "Crawl websites and extract intelligence" },
  "/app/places":         { title: "Places Scraper", sub: "Discover local businesses near any location" },
  "/app/websites":       { title: "Website Intel",  sub: "Technology & contact data from crawled sites" },
  "/app/settings":       { title: "Settings",       sub: "Manage org, members and credentials" },
};

export default function Topbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, org, logout } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const meta = Object.entries(PAGE_META).find(([path]) =>
    path === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(path)
  )?.[1] ?? { title: "Dashboard", sub: "" };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Build avatar initials
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between h-16 px-6 flex-shrink-0"
      style={{
        background: "rgba(10,10,15,0.85)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Page title */}
      <div className="flex flex-col gap-0">
        <motion.h1
          key={meta.title}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-lg font-bold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          {meta.title}
        </motion.h1>
        {meta.sub && (
          <motion.p
            key={meta.sub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs"
            style={{ color: "var(--text-3)" }}
          >
            {meta.sub}
          </motion.p>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* AI ChatBot Button */}
        <motion.button
          onClick={() => navigate("/app/chatbot")}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="h-9 px-3 rounded-xl flex items-center justify-center gap-2 relative"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <MessageSquare size={15} style={{ color: "var(--accent)" }} />
          AI ChatBot
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        </motion.button>

        {/* User menu */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px 5px 5px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              cursor: "pointer",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            {/* Avatar */}
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 8px var(--accent-glow)",
                }}
              >
                {initials}
              </div>
            )}
            <div style={{ textAlign: "left", lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name || "User"}
              </div>
              {org && (
                <div style={{ fontSize: 11, color: "var(--text-3)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {org.name}
                </div>
              )}
            </div>
            <ChevronDown
              size={13}
              style={{
                color: "var(--text-3)",
                transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </motion.button>

          {/* Dropdown */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: 220,
                  borderRadius: 14,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                  zIndex: 100,
                }}
              >
                {/* User info header */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {user?.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                    {user?.email}
                  </div>
                </div>

                {/* Org info */}
                {org && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Building2 size={13} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Organization
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500 }}>
                        {org.name}
                      </div>
                    </div>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        padding: "2px 7px",
                        borderRadius: 20,
                        background: "rgba(108,99,255,0.15)",
                        color: "var(--accent-2)",
                      }}
                    >
                      {org.plan || "free"}
                    </span>
                  </div>
                )}

                {/* Menu items */}
                <div style={{ padding: 6 }}>
                  <MenuButton
                    icon={<Settings size={14} />}
                    label="Settings"
                    onClick={() => { setMenuOpen(false); navigate("/app/settings"); }}
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
        </div>
      </div>
    </header>
  );
}

function MenuButton({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        border: "none",
        background: "transparent",
        color: danger ? "var(--rose)" : "var(--text-2)",
        fontSize: 13,
        cursor: "pointer",
        textAlign: "left",
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
