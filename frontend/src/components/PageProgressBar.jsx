import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * YouTube/GitHub-style slim progress bar at the very top of the page.
 * Animates on every route change.
 */
export default function PageProgressBar() {
  const { pathname } = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const completeRef = useRef(null);

  useEffect(() => {
    // Start the bar on route change
    setProgress(0);
    setVisible(true);

    // Quickly jump to ~30%, then slowly crawl toward 85%
    timerRef.current = setTimeout(() => setProgress(30), 50);

    const crawl = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) { clearInterval(crawl); return 85; }
        return prev + Math.random() * 8;
      });
    }, 200);

    // Complete after a short delay
    completeRef.current = setTimeout(() => {
      clearInterval(crawl);
      setProgress(100);
      // Hide after the transition
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 500);
    }, 600);

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(completeRef.current);
      clearInterval(crawl);
    };
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, var(--accent) 0%, #a78bfa 50%, var(--teal) 100%)",
          boxShadow: "0 0 12px var(--accent), 0 0 24px var(--accent-glow)",
          borderRadius: "0 9999px 9999px 0",
          transition: progress === 100
            ? "width 0.3s ease, opacity 0.4s ease 0.3s"
            : "width 0.3s ease",
          opacity: progress === 100 ? 0 : 1,
        }}
      />
      {/* Glowing tip */}
      <div
        style={{
          position: "absolute",
          right: `${100 - progress}%`,
          top: "50%",
          transform: "translateY(-50%)",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--accent)",
          boxShadow: "0 0 8px 3px var(--accent-glow)",
          opacity: progress > 0 && progress < 100 ? 1 : 0,
          transition: "right 0.3s ease, opacity 0.3s",
        }}
      />
    </div>
  );
}
