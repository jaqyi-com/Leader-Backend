import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, Zap, ArrowRight, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) setError("Invalid or missing reset token. Please request a new link.");
  }, [token]);

  function getStrength(pw) {
    if (!pw) return { score: 0, label: "", color: "" };
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return { score: s, label: ["", "Weak", "Fair", "Good", "Strong"][s], color: ["", "var(--rose)", "var(--ember)", "#facc15", "var(--emerald)"][s] };
  }
  const strength = getStrength(password);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Reset failed."); return; }
      setDone(true);
      setTimeout(() => navigate("/login?verified=1"), 3000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(108,99,255,0.10) 0%, transparent 70%)", pointerEvents: "none" }} />

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg, var(--accent), #8b5cf6)", boxShadow: "0 0 32px var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Zap size={24} color="#fff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.5px" }}>
            {done ? "Password reset!" : "Set new password"}
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: 14, marginTop: 6 }}>
            {done ? "Redirecting you to login…" : "Choose a strong password for your account."}
          </p>
        </div>

        <div className="card card-glow" style={{ padding: 32 }}>
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(16,185,129,0.1)", border: "2px solid var(--emerald)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                  <CheckCircle size={28} color="var(--emerald)" />
                </div>
                <p style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 24 }}>Your password has been updated. Redirecting to login in 3 seconds…</p>
                <Link to="/login" style={{ color: "var(--accent-2)", fontSize: 13, textDecoration: "none" }}>Go to login now →</Link>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: -6, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      style={{ padding: "11px 14px", borderRadius: 12, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", color: "var(--rose)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertCircle size={14} /> {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* New password */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-2)", marginBottom: 6 }}>New Password</label>
                  <div style={{ position: "relative" }}>
                    <Lock size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
                    <input id="reset-password" type={showPw ? "text" : "password"} className="input" placeholder="Min. 8 characters"
                      value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingLeft: 40, paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-3)", cursor: "pointer" }}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {/* Strength bar */}
                  {password && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[1,2,3,4].map(i => (
                          <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= strength.score ? strength.color : "var(--border)", transition: "background 0.3s" }} />
                        ))}
                      </div>
                      <p style={{ fontSize: 11, color: strength.color, marginTop: 4 }}>{strength.label}</p>
                    </motion.div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-2)", marginBottom: 6 }}>Confirm Password</label>
                  <div style={{ position: "relative" }}>
                    <Lock size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
                    <input id="reset-confirm" type={showPw ? "text" : "password"} className="input" placeholder="Re-enter password"
                      value={confirm} onChange={e => setConfirm(e.target.value)} required style={{ paddingLeft: 40 }} />
                  </div>
                  {confirm && password !== confirm && (
                    <p style={{ fontSize: 11, color: "var(--rose)", marginTop: 4 }}>Passwords don't match</p>
                  )}
                  {confirm && password === confirm && confirm.length >= 8 && (
                    <p style={{ fontSize: 11, color: "var(--emerald)", marginTop: 4 }}>✓ Passwords match</p>
                  )}
                </div>

                <motion.button type="submit" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                  disabled={loading || !token} className="btn-primary" style={{ width: "100%", justifyContent: "center", height: 44, fontSize: 14, marginTop: 4 }}>
                  {loading ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.6s linear infinite" }} /> Resetting…
                    </span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Reset Password <ArrowRight size={15} /></span>
                  )}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text)"} onMouseLeave={e => e.currentTarget.style.color = "var(--text-3)"}>
            <ArrowLeft size={14} /> Back to login
          </Link>
        </div>
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
