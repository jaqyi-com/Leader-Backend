import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

const PAGE_META = {
  "/app":                 { title: "Overview",        sub: "Real-time pipeline intelligence" },
  "/app/pipeline":        { title: "Pipeline",        sub: "Run and monitor scrape phases" },
  "/app/icp":             { title: "ICP Config",      sub: "Configure ideal customer profile" },
  "/app/scheduler":       { title: "Scheduler",       sub: "Automate pipeline phases" },
  "/app/sheets":          { title: "Data",            sub: "Browse and manage all records" },
  "/app/leads":           { title: "Lead Scores",     sub: "Prioritized contacts by AI score" },
  "/app/autonomousagents":{ title: "Autonomous SDR",  sub: "One-on-one AI outreach agent" },
  "/app/crawler":         { title: "Web Crawler",     sub: "Crawl websites and extract intelligence" },
  "/app/places":          { title: "Places Scraper",  sub: "Discover local businesses near any location" },
  "/app/websites":        { title: "Website Intel",   sub: "Technology & contact data from crawled sites" },
  "/app/settings":        { title: "Settings",        sub: "Manage org, members and credentials" },
  "/app/docs":            { title: "How It Works",    sub: "Complete platform documentation" },
  "/app/chatbot":         { title: "Personal Chat Bot", sub: "Your AI assistant powered by your knowledge base" },
  "/app/people":          { title: "People",          sub: "Browse and filter people records" },
  "/app/companies":       { title: "Companies",       sub: "Browse and filter company records" },
  "/app/admin":           { title: "Admin Analytics", sub: "Website traffic & application metrics" },
};

export default function Topbar() {
  const { pathname } = useLocation();

  const meta = Object.entries(PAGE_META).find(([path]) =>
    path === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(path)
  )?.[1] ?? { title: "", sub: "" };

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between h-16 px-6 flex-shrink-0"
      style={{
        background: "var(--topbar-bg)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* ── Left: Doott brand identity ────────────────────────────── */}
      <div className="flex items-center gap-3">
        <motion.div
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, #f4576a 100%)",
            boxShadow: "0 0 18px var(--accent-glow)",
          }}
        >
          <Zap size={16} className="text-white" />
        </motion.div>

        <div className="flex items-baseline gap-1">
          <span
            className="font-bold text-xl tracking-tight select-none"
            style={{ color: "var(--text)", letterSpacing: "-0.5px" }}
          >
            Doott
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--accent-2)" }}
          >
            AI
          </span>
        </div>
      </div>

      {/* ── Right: current page context ──────────────────────────── */}
      {meta.title && (
        <AnimatePresence mode="wait">
          <motion.div
            key={meta.title}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-end"
          >
            <span
              className="text-sm font-semibold leading-tight"
              style={{ color: "var(--text)" }}
            >
              {meta.title}
            </span>
            {meta.sub && (
              <span className="text-[11px] leading-tight" style={{ color: "var(--text-3)" }}>
                {meta.sub}
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </header>
  );
}
