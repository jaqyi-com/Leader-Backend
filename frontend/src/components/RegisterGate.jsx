import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle } from "lucide-react";
import RegisterPage from "../pages/RegisterPage";

const SECRET = "2420074#Akshat";
const SESSION_KEY = "rg_unlocked";

export default function RegisterGate() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === "1"
  );
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (password === SECRET) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setUnlocked(true);
    } else {
      setError("Incorrect password. Access denied.");
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setPassword("");
    }
  }

  if (unlocked) return <RegisterPage />;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0a0a0f 0%, #0f0c1a 50%, #080d12 100%)",
        fontFamily: "'Inter', sans-serif",
        padding: 16,
      }}
    >
      {/* Ambient blobs */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0,
      }}>
        <div style={{
          position: "absolute", top: "15%", left: "10%",
          width: 380, height: 380, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,61,255,0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
        <div style={{
          position: "absolute", bottom: "10%", right: "8%",
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,72,153,0.14) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
      </div>

      <motion.div
        animate={shaking ? { x: [0, -12, 12, -10, 10, -6, 6, 0] } : {}}
        transition={{ duration: 0.45 }}
        style={{ zIndex: 1, width: "100%", maxWidth: 420 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 20,
            padding: "40px 36px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Icon */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 64, height: 64, borderRadius: 18,
              background: "linear-gradient(135deg, rgba(99,61,255,0.3), rgba(236,72,153,0.2))",
              border: "1px solid rgba(99,61,255,0.4)",
              marginBottom: 16,
            }}>
              <Lock size={28} color="#a78bfa" />
            </div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.4 }}>
              Internal Access Only
            </h1>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              This area is restricted. Enter the access password to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Password field */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500, display: "block", marginBottom: 8 }}>
                ACCESS PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                  color: "rgba(255,255,255,0.35)", pointerEvents: "none",
                }}>
                  <Lock size={15} />
                </div>
                <input
                  autoFocus
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter password"
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: "11px 42px 11px 40px",
                    color: "#fff",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "rgba(255,255,255,0.4)", padding: 2,
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 8, padding: "9px 12px", marginBottom: 14,
                    color: "#fca5a5", fontSize: 13,
                  }}
                >
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                color: "#fff",
                background: "linear-gradient(135deg, #6332ff, #a855f7)",
                boxShadow: "0 4px 24px rgba(99,61,255,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <ShieldCheck size={16} />
              Unlock Access
            </motion.button>
          </form>
        </motion.div>
      </motion.div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input::placeholder { color: rgba(255,255,255,0.25); }
      `}</style>
    </div>
  );
}
