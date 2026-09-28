import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Zap, Database, Mail, Phone, Download, Brain, Globe, Shield, Lock, ArrowRight } from "lucide-react";
import doottLogo from "../assets/doott-logo.png";

const FEATURES = [
  { icon: Database, title: "43.9M+ Verified Contacts", desc: "Complete B2B database across India & global markets" },
  { icon: Mail,     title: "Verified Email Addresses", desc: "Direct work emails with deliverability verification" },
  { icon: Phone,    title: "Direct Phone Numbers", desc: "Mobile & direct dial numbers for decision makers" },
  { icon: Download, title: "Unlimited CSV Exports", desc: "Export unlimited leads with zero row limits" },
  { icon: Globe,    title: "Company Intelligence", desc: "Filter by city, industry, category, revenue & size" },
  { icon: Brain,    title: "AI RAG Lead Assistant", desc: "Smart AI chatbot to search and filter leads naturally" },
  { icon: Zap,      title: "City & Category Explorer", desc: "Hyper-local business lead generation across India" },
  { icon: Shield,   title: "Lifetime Access Included", desc: "Pay ₹179 once — enjoy all future database updates" },
];

export default function PricingPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#08080c",
      color: "#f8fafc",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 20px",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Dynamic ambient background glow */}
      <div style={{
        position: "absolute",
        top: "5%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "700px",
        height: "450px",
        borderRadius: "50%",
        background: "radial-gradient(ellipse at center, rgba(226, 55, 68, 0.14) 0%, rgba(226, 55, 68, 0.03) 50%, transparent 75%)",
        pointerEvents: "none",
        filter: "blur(40px)",
      }} />

      {/* Header Logo */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}
      >
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src={doottLogo} alt="Doott" style={{ width: 38, height: 38, borderRadius: 10, boxShadow: "0 4px 14px rgba(226,55,68,0.3)" }} />
          <span style={{ fontFamily: "serif", fontSize: 24, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.5px" }}>Doott</span>
        </Link>
      </motion.div>

      {/* Title & Eyebrow */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        style={{ textAlign: "center", marginBottom: 36, maxWidth: 600 }}
      >
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 14px",
          borderRadius: 99,
          background: "rgba(226, 55, 68, 0.12)",
          border: "1px solid rgba(226, 55, 68, 0.3)",
          color: "#f43f5e",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          marginBottom: 16,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#e23744", display: "inline-block" }} />
          Lifetime Deal · One-Time Payment
        </div>

        <h1 style={{ fontSize: "clamp(32px, 5vw, 46px)", fontWeight: 800, color: "#ffffff", margin: 0, lineHeight: 1.15, letterSpacing: "-1.2px" }}>
          One Price. <span style={{ background: "linear-gradient(135deg, #ffffff 30%, #f47a88 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Everything Included.</span>
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 16, marginTop: 14, lineHeight: 1.6 }}>
          No monthly subscriptions. No per-seat limits. No hidden export fees.<br />
          Pay once and access the entire B2B contact database forever.
        </p>
      </motion.div>

      {/* Pricing Card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "linear-gradient(180deg, rgba(20, 20, 30, 0.95) 0%, rgba(14, 14, 22, 0.98) 100%)",
          border: "1px solid rgba(226, 55, 68, 0.3)",
          borderRadius: 24,
          padding: "36px 32px",
          position: "relative",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(226, 55, 68, 0.12)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Floating Popular Badge */}
        <div style={{
          position: "absolute",
          top: -15,
          left: "50%",
          transform: "translateX(-50%)",
          background: "linear-gradient(135deg, #e23744 0%, #f43f5e 100%)",
          borderRadius: 99,
          padding: "6px 18px",
          fontSize: 12,
          fontWeight: 700,
          color: "#ffffff",
          whiteSpace: "nowrap",
          boxShadow: "0 6px 20px rgba(226, 55, 68, 0.45)",
          letterSpacing: "0.02em",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          🔥 Limited Spots — ₹179 Lifetime Access
        </div>

        {/* Pricing Header */}
        <div style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: 24, marginBottom: 24, marginTop: 8 }}>
          <p style={{ fontFamily: "monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", color: "#f47a88", fontWeight: 700, marginBottom: 8 }}>
            Lifetime Subscription
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 56, fontWeight: 900, color: "#ffffff", lineHeight: 1, letterSpacing: "-2px" }}>
              ₹179
            </span>
            <span style={{ fontSize: 16, color: "#94a3b8", fontWeight: 600 }}>/ one-time</span>
          </div>
          <p style={{ fontSize: 13.5, color: "#cbd5e1", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={15} color="#22c55e" /> Pay once, no recurring billing ever.
          </p>
        </div>

        {/* Feature List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "rgba(226, 55, 68, 0.12)",
                border: "1px solid rgba(226, 55, 68, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 2,
              }}>
                <Icon size={16} color="#f4576a" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", lineHeight: 1.3 }}>
                  {title}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, lineHeight: 1.4 }}>
                  {desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <Link to="/join" style={{ textDecoration: "none", display: "block" }}>
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: "0 10px 30px rgba(226, 55, 68, 0.5)" }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #e23744 0%, #f43f5e 100%)",
              border: "none",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(226, 55, 68, 0.35)",
              transition: "all 0.2s ease",
            }}
          >
            <Zap size={18} />
            Get Lifetime Access Now — ₹179
            <ArrowRight size={18} />
          </motion.button>
        </Link>

        {/* Security badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "#94a3b8", marginTop: 16 }}>
          <Lock size={13} color="#22c55e" />
          <span>Secured by <strong>Razorpay</strong> · Instant Activation</span>
        </div>
      </motion.div>

      {/* Comparison Callout */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{
          marginTop: 36,
          padding: "16px 24px",
          borderRadius: 16,
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "center",
          maxWidth: 480,
        }}
      >
        <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>
          💡 <strong style={{ color: "#ffffff" }}>Compare:</strong> ZoomInfo costs ₹15,000+/mo · Apollo costs ₹3,000+/mo.<br />
          <span style={{ color: "#22c55e", fontWeight: 700 }}>Doott gives you 43.9M+ contacts for ₹179 lifetime.</span>
        </p>
      </motion.div>

      {/* Footer Sign-in link */}
      <p style={{ marginTop: 24, fontSize: 14, color: "#94a3b8" }}>
        Already have an account?{" "}
        <Link to="/login" style={{ color: "#f47a88", textDecoration: "none", fontWeight: 600 }}>Sign in here</Link>
      </p>
    </div>
  );
}
