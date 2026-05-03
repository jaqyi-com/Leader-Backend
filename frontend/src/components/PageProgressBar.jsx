import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * NProgress/YouTube-style page progress bar.
 * Placed at the BrowserRouter level so it fires on EVERY route — public and protected.
 *
 * Visual: 4px bar at the very top of the viewport.
 * Glow tip: 10px pulsing dot at the leading edge.
 * Gradient: accent → violet → teal sweeping left to right.
 */
export default function PageProgressBar() {
  const { pathname } = useLocation();
  const [pct, setPct]         = useState(0);
  const [opacity, setOpacity] = useState(0);
  const [done, setDone]       = useState(false);
  const crawlRef    = useRef(null);
  const completeRef = useRef(null);
  const startRef    = useRef(null);
  const hideRef     = useRef(null);

  const clearAll = () => {
    clearTimeout(startRef.current);
    clearTimeout(completeRef.current);
    clearInterval(crawlRef.current);
    clearTimeout(hideRef.current);
  };

  useEffect(() => {
    clearAll();

    // Reset state
    setPct(0);
    setDone(false);

    // Fade in immediately
    setOpacity(1);

    // Jump to 20% right away, then crawl
    startRef.current = setTimeout(() => {
      setPct(20);

      // Crawl from 20 → 80 randomly
      crawlRef.current = setInterval(() => {
        setPct(prev => {
          if (prev >= 80) {
            clearInterval(crawlRef.current);
            return 80;
          }
          // Slow down as it gets closer to 80
          const step = Math.random() * (prev < 50 ? 10 : 4);
          return Math.min(prev + step, 80);
        });
      }, 280);
    }, 60);

    // Complete at 700ms
    completeRef.current = setTimeout(() => {
      clearInterval(crawlRef.current);
      setPct(100);
      setDone(true);

      // Fade out after bar reaches 100%
      hideRef.current = setTimeout(() => {
        setOpacity(0);
        // Full reset after fade
        setTimeout(() => { setPct(0); setDone(false); }, 400);
      }, 300);
    }, 700);

    return clearAll;
  }, [pathname]);

  return (
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
        opacity,
        transition: opacity === 0 ? "opacity 0.4s ease" : "none",
      }}
    >
      {/* Track */}
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Bar fill */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, #6c63ff 0%, #a78bfa 40%, #22d3ee 100%)",
            boxShadow: "0 0 10px rgba(108,99,255,0.9), 0 0 20px rgba(108,99,255,0.5)",
            borderRadius: "0 4px 4px 0",
            transition: done
              ? "width 0.25s cubic-bezier(0.4,0,0.2,1)"
              : "width 0.3s cubic-bezier(0.4,0,0.2,1)",
          }}
        />

        {/* Glowing tip dot */}
        {!done && pct > 0 && (
          <div
            style={{
              position: "absolute",
              left: `calc(${pct}% - 5px)`,
              top: "50%",
              transform: "translateY(-50%)",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#a78bfa",
              boxShadow: "0 0 6px 4px rgba(167,139,250,0.6), 0 0 12px 6px rgba(108,99,255,0.3)",
              transition: "left 0.3s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        )}

        {/* Shimmer sweep */}
        {!done && pct > 0 && pct < 100 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${pct}%`,
              height: "100%",
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
              backgroundSize: "50% 100%",
              animation: "ppb-shimmer 1.2s linear infinite",
              borderRadius: "0 4px 4px 0",
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes ppb-shimmer {
          0%   { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
