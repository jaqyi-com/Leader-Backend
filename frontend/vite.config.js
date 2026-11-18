import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { PEOPLE_TOTAL, PEOPLE_M, PEOPLE_MILLION } from "./src/siteStats.js";

// index.html uses %DOOTT_PEOPLE_M% / %DOOTT_PEOPLE_MILLION% for the headline count (src/siteStats.js,
// from countries.json totals made by the count job), so the number is never typed by hand.
function siteStatsInHtml() {
  return {
    name: "doott-site-stats",
    // "pre": before Vite's own %ENV% replacement, which would warn about unknown names
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!PEOPLE_TOTAL) throw new Error("frontend/src/countries.json has no totals: run node scripts/refresh_counts.js --only countries --files");
        return html.replaceAll("%DOOTT_PEOPLE_MILLION%", PEOPLE_MILLION).replaceAll("%DOOTT_PEOPLE_M%", PEOPLE_M);
      },
    },
  };
}

export default defineConfig({
  envDir: ".",
  plugins: [react(), siteStatsInHtml()],

  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },

  build: {
    // Raise warning threshold — our app is intentionally large
    chunkSizeWarningLimit: 600,
    // Source maps for error tracking in production (set to false if you want smaller build)
    sourcemap: false,
    rollupOptions: {
      output: {
        // Manual chunking as function — required by Vite 8 / rolldown
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/react-router-dom/")) {
              return "vendor-react";
            }
            if (id.includes("/framer-motion/")) {
              return "vendor-motion";
            }
            if (id.includes("/lucide-react/")) {
              return "vendor-icons";
            }
          }
        },
      },
    },
  },

  // Optimize dependencies at dev time for faster HMR
  optimizeDeps: {
    include: ["react", "react-dom", "framer-motion", "lucide-react"],
  },
});
