import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Indeterminate sweeping progress bar — shows on every route change.
 * No logo, no text. Just the animated gradient bar at the very top.
 */
export default function PageProgressBar() {
  const { pathname } = useLocation();
  const [visible, setVisible]   = useState(false);
  const showRef  = useRef(null);
  const hideRef  = useRef(null);

  useEffect(() => {
    clearTimeout(showRef.current);
    clearTimeout(hideRef.current);

    // Show bar immediately
    setVisible(true);

    // Auto-hide after 800ms (enough for most route transitions)
    hideRef.current = setTimeout(() => setVisible(false), 800);

    return () => {
      clearTimeout(showRef.current);
      clearTimeout(hideRef.current);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <>
      {/* Top bar container */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          zIndex: 99999,
          pointerEvents: "none",
          background: "var(--surface-3, #1d1d28)",
          overflow: "hidden",
        }}
      >
        {/* Sweeping gradient fill — same style as loading screen */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            background: "linear-gradient(90deg, #6c63ff, #a78bfa, #22d3ee)",
            boxShadow: "0 0 12px rgba(108,99,255,0.8), 0 0 24px rgba(108,99,255,0.4)",
            borderRadius: 9999,
            animation: "ppb-sweep 1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes ppb-sweep {
          0%   { width: 0%;   margin-left: 0%; }
          50%  { width: 65%;  margin-left: 17%; }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
    </>
  );
}
