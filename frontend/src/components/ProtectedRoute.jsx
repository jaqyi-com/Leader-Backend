import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Zap } from "lucide-react";

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
          background: "radial-gradient(circle, rgba(108,99,255,0.08) 0%, transparent 70%)",
          filter: "blur(60px)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-20%", right: "-10%",
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)",
          filter: "blur(60px)", pointerEvents: "none",
        }} />

        {/* Animated logo */}
        <div style={{ position: "relative" }}>
          {/* Outer ring pulse */}
          <div style={{
            position: "absolute", inset: -12,
            borderRadius: "50%",
            border: "1px solid rgba(108,99,255,0.3)",
            animation: "ring-pulse 2s ease-in-out infinite",
          }} />
          {/* Logo circle */}
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "linear-gradient(135deg, #6c63ff 0%, #8b5cf6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 32px rgba(108,99,255,0.4), 0 0 64px rgba(108,99,255,0.15)",
            animation: "logo-float 3s ease-in-out infinite",
          }}>
            <Zap size={28} color="#fff" />
          </div>
        </div>

        {/* Brand name */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px",
            color: "var(--text)", marginBottom: 4,
          }}>
            Leader<span style={{ color: "var(--accent)" }}>AI</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500 }}>
            Initializing workspace…
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          width: 200, height: 3, background: "var(--surface-3)",
          borderRadius: 9999, overflow: "hidden", position: "relative",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            background: "linear-gradient(90deg, #6c63ff, #a78bfa, #22d3ee)",
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
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

