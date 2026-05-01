import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />

        <main
          className="flex-1 overflow-y-auto p-6"
          style={{ background: "var(--bg)" }}
        >
          {/* Subtle background grid */}
          <div
            className="fixed inset-0 pointer-events-none z-0"
            style={{
              backgroundImage: `
                linear-gradient(var(--overlay-1) 1px, transparent 1px),
                linear-gradient(90deg, var(--overlay-1) 1px, transparent 1px)
              `,
              backgroundSize: "40px 40px",
            }}
          />

          {/* Aurora glow blobs in background */}
          <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            <div
              className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.04]"
              style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)", filter: "blur(80px)" }}
            />
            <div
              className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.04]"
              style={{ background: "radial-gradient(circle, var(--teal) 0%, transparent 70%)", filter: "blur(80px)" }}
            />
          </div>

          <div className="relative z-10 max-w-[1600px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
