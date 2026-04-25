import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: ".",
  plugins: [react()],

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
            if (id.includes("/recharts/")) {
              return "vendor-charts";
            }
            if (id.includes("/lucide-react/")) {
              return "vendor-icons";
            }
            if (id.includes("/react-markdown/") || id.includes("/remark") || id.includes("/rehype")) {
              return "vendor-markdown";
            }
            if (id.includes("/jspdf") || id.includes("/xlsx/")) {
              return "vendor-export";
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
