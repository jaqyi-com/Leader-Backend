import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const PAGE_TITLES = {
  "/app":          "Overview",
  "/app/pipeline":  "Pipeline Control",
  "/app/scheduler": "Automation Scheduler",
  "/app/sheets":    "Google Sheets Data",
  "/app/leads":     "Lead Scores",
  "/app/settings":  "Settings",
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();

  const title = Object.entries(PAGE_TITLES).find(([path]) => 
    path === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(path)
  )?.[1] || "Dashboard";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar collapsed={collapsed} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} title={title} />
        <main className="flex-1 overflow-y-auto p-6 bg-muted">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
