import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import {
  AlertTriangle, RefreshCw, ArrowLeft, Zap, ShieldAlert, WifiOff, ServerCrash
} from "lucide-react";

// ── Floating particle background ────────────────────────────────────────────
function Particles() {
  const pts = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    dur: Math.random() * 6 + 4,
    delay: Math.random() * 4,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pts.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full opacity-20"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: "var(--accent)",
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ── Spinner ring ─────────────────────────────────────────────────────────────
function SpinnerRing() {
  return (
    <div className="relative w-16 h-16 mx-auto">
      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-full blur-md opacity-40"
        style={{ background: "var(--accent)" }}
      />
      {/* Ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-[2.5px]"
        style={{
          borderColor: "transparent",
          borderTopColor: "var(--accent)",
          borderRightColor: "var(--accent-2)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      />
      {/* Logo center */}
      <div
        className="absolute inset-[6px] rounded-full flex items-center justify-center"
        style={{ background: "var(--surface-2)" }}
      >
        <Zap size={16} style={{ color: "var(--accent)" }} />
      </div>
    </div>
  );
}

// ── Error icon variants ───────────────────────────────────────────────────────
const ERROR_CONFIG = {
  server: {
    Icon: ServerCrash,
    title: "Server Error",
    desc: "Our authentication server ran into a problem. This is temporary — please try again.",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    glow: "rgba(239,68,68,0.15)",
  },
  network: {
    Icon: WifiOff,
    title: "Connection Lost",
    desc: "Couldn't reach the authentication server. Check your network and try again.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    glow: "rgba(245,158,11,0.15)",
  },
  auth: {
    Icon: ShieldAlert,
    title: "Authentication Failed",
    desc: "Google sign-in was denied or the session expired. Please try signing in again.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    glow: "rgba(139,92,246,0.15)",
  },
  default: {
    Icon: AlertTriangle,
    title: "Something Went Wrong",
    desc: "An unexpected error occurred during sign-in. Please try again.",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    glow: "rgba(239,68,68,0.15)",
  },
};

function classifyError(errorParam) {
  if (!errorParam) return "server";
  const e = errorParam.toLowerCase();
  if (e.includes("network") || e.includes("timeout") || e.includes("fetch")) return "network";
  if (e.includes("google") || e.includes("oauth") || e.includes("denied") || e.includes("cancel")) return "auth";
  if (e.includes("server") || e.includes("500") || e.includes("internal")) return "server";
  return "default";
}

// ── Error Card ───────────────────────────────────────────────────────────────
function ErrorCard({ errorParam, onRetry }) {
  const [retrying, setRetrying] = useState(false);
  const kind = classifyError(errorParam);
  const cfg = ERROR_CONFIG[kind];
  const { Icon } = cfg;

  const handleRetry = async () => {
    setRetrying(true);
    await new Promise((r) => setTimeout(r, 600));
    onRetry();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-md mx-auto"
    >
      {/* Card glow */}
      <div
        className="absolute -inset-px rounded-2xl pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${cfg.glow} 0%, transparent 60%)`,
        }}
      />

      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 32px 64px -12px rgba(0,0,0,0.5)",
        }}
      >
        {/* Top accent strip */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, var(--accent), var(--accent-2), transparent)`,
          }}
        />

        <div className="p-8 space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
              className={`w-16 h-16 rounded-2xl flex items-center justify-center ${cfg.bg} border ${cfg.border}`}
            >
              <Icon size={28} className={cfg.color} />
            </motion.div>
          </div>

          {/* Text */}
          <div className="text-center space-y-2">
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl font-bold"
              style={{ color: "var(--text)" }}
            >
              {cfg.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="text-sm leading-relaxed"
              style={{ color: "var(--text-3)" }}
            >
              {cfg.desc}
            </motion.p>
            {errorParam && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.36 }}
                className="text-[11px] font-mono px-3 py-1.5 rounded-lg inline-block mt-1"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-3)",
                  border: "1px solid var(--border)",
                }}
              >
                error: {errorParam}
              </motion.p>
            )}
          </div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38 }}
            className="flex flex-col gap-3"
          >
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl font-semibold text-sm text-white transition-all duration-200 disabled:opacity-70"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
                boxShadow: retrying ? "none" : "0 0 24px var(--accent-glow)",
              }}
            >
              <RefreshCw
                size={15}
                className={retrying ? "animate-spin" : ""}
              />
              {retrying ? "Retrying…" : "Try Again with Google"}
            </button>

            <a
              href="/login"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-80"
              style={{
                color: "var(--text-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <ArrowLeft size={14} />
              Back to Login
            </a>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center"
          >
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              If this keeps happening, contact{" "}
              <a
                href="mailto:support@leader.ai"
                className="underline hover:opacity-70 transition-opacity"
                style={{ color: "var(--accent)" }}
              >
                support@leader.ai
              </a>
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Loading State ─────────────────────────────────────────────────────────────
function LoadingCard() {
  const steps = ["Verifying with Google", "Authenticating", "Loading your workspace"];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 800);
    const t2 = setTimeout(() => setStep(2), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-sm mx-auto"
    >
      <div
        className="relative rounded-2xl overflow-hidden p-8 space-y-7 text-center"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 32px 64px -12px rgba(0,0,0,0.5)",
        }}
      >
        {/* Top glow strip */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--accent), var(--accent-2), transparent)",
          }}
        />

        <SpinnerRing />

        <div className="space-y-2">
          <AnimatePresence mode="wait">
            <motion.p
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="font-semibold text-sm"
              style={{ color: "var(--text)" }}
            >
              {steps[step]}…
            </motion.p>
          </AnimatePresence>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            This only takes a moment
          </p>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-2">
          {steps.map((_, i) => (
            <motion.div
              key={i}
              animate={{
                scale: i === step ? 1.3 : 1,
                opacity: i <= step ? 1 : 0.3,
              }}
              transition={{ duration: 0.2 }}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: i <= step ? "var(--accent)" : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AuthCallbackPage() {
  const { handleOAuthCallback } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState("loading"); // "loading" | "error"
  const [errorParam, setErrorParam] = useState(null);

  const doCallback = () => {
    const token = params.get("token");
    const error = params.get("error");

    if (error) {
      setErrorParam(error);
      setStatus("error");
      return;
    }

    if (token) {
      handleOAuthCallback(token);
      navigate("/app", { replace: true });
    } else {
      setErrorParam("google_failed");
      setStatus("error");
    }
  };

  useEffect(() => { doCallback(); }, []);

  const handleRetry = () => {
    // Redirect to Google OAuth — navigate to login which will trigger Google sign-in
    navigate("/login", { replace: true });
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <Particles />

      {/* Ambient background glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none blur-3xl opacity-20 rounded-full"
        style={{ background: "var(--accent)" }}
      />

      <div className="relative w-full max-w-md z-10">
        {/* Logo pill */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-center gap-2 mb-8"
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)",
              boxShadow: "0 0 16px var(--accent-glow)",
            }}
          >
            <Zap size={13} className="text-white" />
          </div>
          <span
            className="font-bold text-base tracking-tight"
            style={{ color: "var(--text)" }}
          >
            Leader
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--accent-2)" }}
          >
            AI
          </span>
        </motion.div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {status === "loading" && (
            <motion.div key="loading">
              <LoadingCard />
            </motion.div>
          )}
          {status === "error" && (
            <motion.div key="error">
              <ErrorCard errorParam={errorParam} onRetry={handleRetry} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
