/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Map CSS vars for Tailwind usage
        background: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        teal: "var(--teal)",
        emerald: "var(--emerald)",
        ember: "var(--ember)",
        rose: "var(--rose)",
        violet: "var(--violet)",
        // Legacy compat
        muted: "var(--surface-2)",
        "muted-foreground": "var(--text-2)",
        card: "var(--surface)",
        "card-foreground": "var(--text)",
        foreground: "var(--text)",
        "brand-500": "var(--accent)",
        "brand-400": "var(--accent-2)",
        "brand-600": "#5b52d9",
        "accent-cyan": "var(--teal)",
        "accent-green": "var(--emerald)",
        "accent-orange": "#f97316",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      animation: {
        "fade-in":    "fadeIn 0.4s ease-out forwards",
        "slide-up":   "slideUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards",
        "float":      "float 6s ease-in-out infinite",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
        "shimmer":    "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn:    { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp:   { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        float:     {
          "0%,100%": { transform: "translateY(0px)" },
          "50%":     { transform: "translateY(-8px)" },
        },
        glowPulse: {
          "0%,100%": { boxShadow: "0 0 12px var(--accent-glow)" },
          "50%":     { boxShadow: "0 0 32px var(--accent-glow), 0 0 64px var(--accent-glow)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition: "200% 0" },
        },
      },
      boxShadow: {
        glow:       "0 0 24px var(--accent-glow)",
        "glow-teal":"0 0 24px var(--teal-glow)",
        "glow-lg":  "0 0 48px var(--accent-glow)",
        card:       "0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04) inset",
      },
    },
  },
  plugins: [],
};
