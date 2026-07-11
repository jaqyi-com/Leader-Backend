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

        {/* Animated logo */}
        {/* Logo circle */}
        <div style={{
            width: 80, height: 80, borderRadius: 18,
            overflow: "hidden",
            animation: "logo-float 3s ease-in-out infinite",
          }}>
            <img src={doottLogo} alt="Doott" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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

        {/* Progress bar */}
        <div style={{
          width: 200, height: 3, background: "var(--surface-3)",
          borderRadius: 9999, overflow: "hidden", position: "relative",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            background: "linear-gradient(90deg, #E23744, #f47a88, #22d3ee)",
            borderRadius: 9999,
            animation: "bar-slide 1.6s ease-in-out infinite",
          }} />
        </div>

        <style>{`
          @keyframes ring-pulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50%       { opacity: 0.8; transform: scale(1.08); }
          }
          @keyframes logo-float {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-6px); }
          }
          @keyframes bar-slide {
            0%   { width: 0%;   margin-left: 0%; }
            50%  { width: 70%;  margin-left: 15%; }
            100% { width: 0%;   margin-left: 100%; }
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

