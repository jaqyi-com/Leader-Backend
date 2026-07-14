import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import NProgress from "nprogress";

/**
 * PageProgressBar — NProgress-powered top navigation bar.
 * Fires on every route change. Clean, slim, professional.
 */

// Configure NProgress globally once
NProgress.configure({
  showSpinner: false,      // no spinning circle
  minimum: 0.15,
  easing: "ease",
  speed: 400,
  trickleSpeed: 180,
});

export default function PageProgressBar() {
  const { pathname } = useLocation();

  useEffect(() => {
    NProgress.start();
    const timer = setTimeout(() => NProgress.done(), 500);
    return () => {
      clearTimeout(timer);
      NProgress.done();
    };
  }, [pathname]);

  return (
    <style>{`
      /* ── NProgress bar ───────────────────────────────────── */
      #nprogress {
        pointer-events: none;
      }

      #nprogress .bar {
        background: #E23744;
        position: fixed;
        z-index: 99999;
        top: 0;
        left: 0;
        width: 100%;
        height: 2.5px;
      }

      /* Glowing tip at the leading edge */
      #nprogress .peg {
        display: block;
        position: absolute;
        right: 0px;
        width: 100px;
        height: 100%;
        box-shadow: 0 0 10px #E23744, 0 0 5px #E23744;
        opacity: 1;
        transform: rotate(3deg) translate(0px, -4px);
      }

      /* Hide the spinner entirely */
      #nprogress .spinner { display: none !important; }
    `}</style>
  );
}
