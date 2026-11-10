import { useState } from "react";
import { useOutlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const outlet = useOutlet();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />

        <main
          className="flex-1 overflow-y-auto p-6"
          style={{ background: "var(--bg)" }}
        >
          {/* Aurora glow blobs */}
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
            {/* Fade the new page in; the old one is removed at once. (An exit animation here kept old
                pages in the DOM as invisible copies on top of the current one, which swallowed clicks.) */}
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {outlet}
            </motion.div>
          </div>
        </main>
      </div>

      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
    </div>
  );
}
