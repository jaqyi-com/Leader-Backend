import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Bell } from "lucide-react";

const PAGE_META = {
  "/app":                { title: "Overview",       sub: "Real-time pipeline intelligence" },
  "/app/pipeline":       { title: "Pipeline",       sub: "Run and monitor scrape phases" },
  "/app/icp":            { title: "ICP Config",     sub: "Configure ideal customer profile" },
  "/app/scheduler":      { title: "Scheduler",      sub: "Automate pipeline phases" },
  "/app/sheets":         { title: "Data",            sub: "Browse and manage all records" },
  "/app/leads":          { title: "Lead Scores",    sub: "Prioritized contacts by AI score" },
  "/app/autonomousagents":{ title: "Autonomous SDR", sub: "One-on-one AI outreach agent" },
  "/app/crawler":        { title: "Web Crawler",    sub: "Crawl websites and extract intelligence" },
  "/app/places":         { title: "Places Scraper", sub: "Discover local businesses near any location" },
  "/app/websites":       { title: "Website Intel",  sub: "Technology & contact data from crawled sites" },
};

export default function Topbar() {
  const { pathname } = useLocation();
  const meta = Object.entries(PAGE_META).find(([path]) =>
    path === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(path)
  )?.[1] ?? { title: "Dashboard", sub: "" };

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
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-9 h-9 rounded-xl flex items-center justify-center relative"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-2)",
          }}
        >
          <Bell size={15} />
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        </motion.button>

        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm"
          style={{
            background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
            color: "#fff",
            boxShadow: "0 0 12px var(--accent-glow)",
          }}
        >
          L
        </div>
      </div>
    </header>
  );
}
