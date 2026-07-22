import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import doottLogo from "../assets/doott-logo.png";

/**
 * Wraps a route and redirects to /login if the user is not authenticated.
 * Preserves the intended destination so after login the user is returned there.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          gap: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background aurora blobs */}
        <div style={{
          position: "absolute", top: "-20%", left: "-10%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(226,55,68,0.08) 0%, transparent 70%)",
          filter: "blur(60px)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-20%", right: "-10%",
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)",
          filter: "blur(60px)", pointerEvents: "none",
        }} />

        {/* Animated logo — circle with spinning ring around it */}
        <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Spinning SVG ring */}
          <svg
            width="100" height="100"
            viewBox="0 0 100 100"
            style={{ position: "absolute", top: 0, left: 0, animation: "ring-spin 1.6s linear infinite" }}
          >
            <circle
              cx="50" cy="50" r="46"
              fill="none"
              stroke="rgba(226,55,68,0.15)"
              strokeWidth="3"
            />
            <circle
              cx="50" cy="50" r="46"
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray="72 217"
              strokeDashoffset="0"
            />
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E23744" />
                <stop offset="100%" stopColor="#ff8a96" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
          {/* Logo */}
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            overflow: "hidden",
            animation: "logo-float 3s ease-in-out infinite",
          }}>
            <img src={doottLogo} alt="Doott" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        </div>

        {/* Brand name */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px",
            color: "var(--text)", marginBottom: 4,
          }}>
            Doott
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500 }}>
            Initializing workspace<span className="dot-1">.</span><span className="dot-2">.</span><span className="dot-3">.</span>
          </div>
        </div>

        <style>{`
          @keyframes ring-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes logo-float {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-6px); }
          }
          @keyframes dot-flash {
            0%   { opacity: 0.2; }
            20%  { opacity: 1; }
            100% { opacity: 0.2; }
          }
          .dot-1 { animation: dot-flash 1.4s infinite; }
          .dot-2 { animation: dot-flash 1.4s infinite 0.2s; }
          .dot-3 { animation: dot-flash 1.4s infinite 0.4s; }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

