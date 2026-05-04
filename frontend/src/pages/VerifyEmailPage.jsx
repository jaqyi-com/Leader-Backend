import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, AlertCircle, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

/**
 * Email verification landing page.
 * User arrives here via the link in their verification email.
 * Route: /verify-email?token=<token>
 */
export default function VerifyEmailPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found in the link.");
      return;
    }
    verify(token);
  }, []);

  async function verify(token) {
    try {
      const res = await fetch(`${API}/auth/verify-email?token=${token}`);
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Verification failed.");
        return;
      }

      // Auto-login the user
      login({ token: data.token, user: data.user, org: data.org });
      setStatus("success");
      setTimeout(() => navigate("/app", { replace: true }), 2000);
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: 400, width: "100%", textAlign: "center" }}
      >
        {/* Logo */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
            boxShadow: "0 0 32px var(--accent-glow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 28px",
          }}
        >
          <Zap size={24} color="#fff" />
        </div>

        {status === "verifying" && (
          <>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "2px solid var(--border)",
                borderTopColor: "var(--accent)",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 20px",
              }}
            />
            <p style={{ color: "var(--text-2)", fontSize: 15 }}>Verifying your email…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(16,185,129,0.1)",
                border: "2px solid var(--emerald)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <CheckCircle size={28} color="var(--emerald)" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              Email Verified!
            </h2>
            <p style={{ color: "var(--text-3)", fontSize: 14 }}>
              Redirecting you to your workspace…
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(244,63,94,0.1)",
                border: "2px solid var(--rose)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <AlertCircle size={28} color="var(--rose)" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              Verification Failed
            </h2>
            <p style={{ color: "var(--text-3)", fontSize: 14, marginBottom: 24 }}>{errorMsg}</p>
            <Link
              to="/login"
              style={{
                display: "inline-block",
                padding: "11px 24px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--text-2)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Back to Login
            </Link>
          </>
        )}
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
