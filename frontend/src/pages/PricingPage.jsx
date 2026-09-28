import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, Zap, Database, Mail, Phone, Download, Brain, Globe, Shield } from "lucide-react";
import doottLogo from "../assets/doott-logo.png";

const FEATURES = [
  { icon: Database, text: "43.9M+ verified B2B contact records" },
  { icon: Mail,     text: "Filter to contacts with verified emails" },
  { icon: Phone,    text: "Filter to contacts with phone numbers" },
  { icon: Download, text: "Unlimited CSV export — no row limits" },
  { icon: Globe,    text: "Company intelligence database" },
  { icon: Brain,    text: "AI-powered RAG chatbot" },
  { icon: Zap,      text: "City & Category explorer" },
  { icon: Shield,   text: "Lifetime access — pay once, use forever" },
];

export default function PricingPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background glow */}
      <div style={{ position:"absolute", top:"10%", left:"50%", transform:"translateX(-50%)", width:600, height:400, borderRadius:"50%", background:"radial-gradient(ellipse, rgba(226,55,68,0.08) 0%, transparent 70%)", pointerEvents:"none" }} />

      {/* Logo */}
      <motion.div initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}
        style={{ display:"flex", alignItems:"center", gap:10, marginBottom:40 }}>
        <img src={doottLogo} alt="Doott" style={{ width:36, height:36, borderRadius:10 }} />
        <span style={{ fontFamily:"serif", fontSize:22, fontWeight:700, color:"var(--text)", letterSpacing:"-0.5px" }}>Doott</span>
      </motion.div>

      {/* Heading */}
      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5, delay:0.05 }}
        style={{ textAlign:"center", marginBottom:40, maxWidth:560 }}>
        <p style={{ fontFamily:"monospace", fontSize:11, textTransform:"uppercase", letterSpacing:"0.2em", color:"var(--accent)", marginBottom:12 }}>
          ◆ Lifetime Access
        </p>
        <h1 style={{ fontSize:42, fontWeight:800, color:"var(--text)", margin:0, lineHeight:1.1, letterSpacing:"-1.5px" }}>
          One price.<br />Everything included.
        </h1>
        <p style={{ color:"var(--text-3)", fontSize:15, marginTop:14, lineHeight:1.6 }}>
          No monthly fees. No per-seat limits. No hidden charges.<br />
          Pay once and access Doott forever.
        </p>
      </motion.div>

      {/* Pricing card */}
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5, delay:0.1 }}
        className="card card-glow"
        style={{ width:"100%", maxWidth:460, padding:36, position:"relative" }}>

        {/* Badge */}
        <div style={{ position:"absolute", top:-14, left:"50%", transform:"translateX(-50%)",
          background:"linear-gradient(135deg, var(--accent), #f4576a)", borderRadius:99,
          padding:"5px 16px", fontSize:12, fontWeight:700, color:"#fff", whiteSpace:"nowrap",
          boxShadow:"0 4px 20px rgba(226,55,68,0.4)" }}>
          🔥 Most Popular — Limited Spots
        </div>

        {/* Plan name */}
        <p style={{ fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.25em", color:"var(--text-3)", marginBottom:6, marginTop:8 }}>
          Lifetime Plan
        </p>

        {/* Price */}
        <div style={{ display:"flex", alignItems:"flex-end", gap:6, marginBottom:4 }}>
          <span style={{ fontSize:54, fontWeight:900, color:"var(--text)", lineHeight:1, letterSpacing:"-2px" }}>
            ₹179
          </span>
          <span style={{ fontSize:14, color:"var(--text-3)", marginBottom:8 }}>one-time</span>
        </div>
        <p style={{ fontSize:13, color:"var(--text-3)", marginBottom:28 }}>
          No recurring charges ever. Includes all future updates.
        </p>

        {/* Features */}
        <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:32 }}>
          {FEATURES.map(({ icon: Icon, text }, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:"rgba(226,55,68,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Icon size={13} color="var(--accent)" />
              </div>
              <span style={{ fontSize:13.5, color:"var(--text-2)" }}>{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link to="/join" style={{ textDecoration:"none" }}>
          <motion.button
            whileHover={{ scale:1.02 }}
            whileTap={{ scale:0.98 }}
            className="btn-primary"
            style={{ width:"100%", justifyContent:"center", height:50, fontSize:15, fontWeight:700, gap:10 }}
          >
            <Zap size={16} />
            Get Lifetime Access — ₹179
          </motion.button>
        </Link>

        <p style={{ textAlign:"center", fontSize:12, color:"var(--text-3)", marginTop:14 }}>
          🔒 Secured by Razorpay · UPI, Cards, Net Banking accepted
        </p>
      </motion.div>

      {/* Comparison note */}
      <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
        style={{ fontSize:12, color:"var(--text-3)", marginTop:28, textAlign:"center", maxWidth:400, lineHeight:1.6 }}>
        ZoomInfo costs ₹15,000+/month. Apollo starts at ₹3,000+/month.<br />
        <strong style={{ color:"var(--text-2)" }}>Doott is ₹179 once — forever.</strong>
      </motion.p>

      <p style={{ marginTop:20, fontSize:13, color:"var(--text-3)" }}>
        Already have an account?{" "}
        <Link to="/login" style={{ color:"var(--accent-2)", textDecoration:"none", fontWeight:500 }}>Sign in</Link>
      </p>
    </div>
  );
}
