import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, User, ArrowRight, AlertCircle, CheckCircle, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import doottLogo from "../assets/doott-logo.png";
import { BASE } from "../api/index";

const API = BASE;  // same URL resolution as the rest of the app
const RAZORPAY_KEY_ID = "rzp_live_ThZtzVX8tHPpj4";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#f43f5e", "#f97316", "#facc15", "#22c55e"];
  return { score, label: labels[score], color: colors[score] };
}

export default function JoinPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]               = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [step, setStep]               = useState("form"); // form | processing | success

  useEffect(() => {
    if (isAuthenticated) navigate("/app/categories", { replace: true });
  }, [isAuthenticated]);

  const strength = getPasswordStrength(form.password);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    try {
      // Step 1: Load Razorpay SDK
      const loaded = await loadRazorpayScript();
      if (!loaded) { setError("Failed to load payment gateway. Please check your internet connection."); setLoading(false); return; }

      // Step 2: Create order on backend
      const orderRes = await fetch(`${API}/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) { setError(orderData.error || "Failed to initiate payment."); setLoading(false); return; }

      // Step 3: Open Razorpay checkout modal
      const options = {
        key:         orderData.keyId || RAZORPAY_KEY_ID,
        amount:      orderData.amount,
        currency:    orderData.currency,
        name:        "Doott",
        description: "Lifetime Access — B2B Contact Database",
        image:       "https://doott.jaqyi.com/doott-logo.png",
        order_id:    orderData.orderId,
        prefill:     orderData.prefill,
        theme:       { color: "#e23744" },
        modal: {
          ondismiss: () => { setLoading(false); setError("Payment cancelled. You have not been charged."); },
        },
        handler: async (response) => {
          // Step 4: Verify payment + create account
          setStep("processing");
          try {
            const verifyRes = await fetch(`${API}/payments/verify-and-register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                name:     form.name,
                email:    form.email,
                password: form.password,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) { setError(verifyData.error || "Account creation failed. Contact support with your payment ID."); setStep("form"); setLoading(false); return; }

            // Step 5: Auto-login
            setStep("success");
            setTimeout(() => {
              login({ token: verifyData.token, user: verifyData.user, org: verifyData.org });
              navigate("/app/categories", { replace: true });
            }, 1800);
          } catch {
            setError("Network error during account creation. Your payment was received — contact support with your email.");
            setStep("form");
            setLoading(false);
          }
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (step === "success") {
    return (
      <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} style={{ textAlign:"center", padding:40 }}>
          <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring", delay:0.1 }}
            style={{ width:72, height:72, borderRadius:"50%", background:"rgba(34,197,94,0.15)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>
            <CheckCircle size={36} color="#22c55e" />
          </motion.div>
          <h2 style={{ fontSize:26, fontWeight:700, color:"var(--text)", marginBottom:8 }}>Payment successful!</h2>
          <p style={{ color:"var(--text-3)", fontSize:14 }}>Your account is ready. Signing you in…</p>
        </motion.div>
      </div>
    );
  }

  if (step === "processing") {
    return (
      <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ textAlign:"center", padding:40 }}>
          <div style={{ width:48, height:48, borderRadius:"50%", border:"3px solid rgba(226,55,68,0.2)", borderTopColor:"var(--accent)", animation:"spin 0.8s linear infinite", margin:"0 auto 20px" }} />
          <p style={{ color:"var(--text-2)", fontSize:15 }}>Verifying payment &amp; creating your account…</p>
        </motion.div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:"5%", right:"15%", width:500, height:500, borderRadius:"50%", background:"radial-gradient(ellipse, rgba(226,55,68,0.08) 0%, transparent 70%)", pointerEvents:"none" }} />

      <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}
        style={{ width:"100%", maxWidth:460, position:"relative", zIndex:1 }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <Link to="/pricing" style={{ display:"inline-flex", alignItems:"center", gap:8, textDecoration:"none", marginBottom:20 }}>
            <img src={doottLogo} alt="Doott" style={{ width:32, height:32, borderRadius:8 }} />
            <span style={{ fontFamily:"serif", fontSize:19, color:"var(--text)", fontWeight:700 }}>Doott</span>
          </Link>
          <h1 style={{ fontSize:26, fontWeight:800, color:"var(--text)", margin:0, letterSpacing:"-0.5px" }}>
            Create your account
          </h1>
          <p style={{ color:"var(--text-3)", fontSize:13, marginTop:6 }}>
            Lifetime access for a one-time payment of{" "}
            <strong style={{ color:"var(--accent)" }}>₹179</strong>
          </p>
        </div>

        {/* Card */}
        <div className="card card-glow" style={{ padding:32 }}>
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity:0, y:-8, height:0 }} animate={{ opacity:1, y:0, height:"auto" }} exit={{ opacity:0, height:0 }}
                style={{ marginBottom:20, padding:"12px 14px", borderRadius:12, background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.2)", color:"var(--rose)", fontSize:13, display:"flex", alignItems:"flex-start", gap:8 }}>
                <AlertCircle size={15} style={{ flexShrink:0, marginTop:1 }} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Name */}
            <div>
              <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--text-2)", marginBottom:6 }}>Full Name</label>
              <div style={{ position:"relative" }}>
                <User size={14} style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", color:"var(--text-3)", pointerEvents:"none" }} />
                <input id="join-name" name="name" type="text" className="input" placeholder="Jane Smith"
                  value={form.name} onChange={handleChange} required style={{ paddingLeft:38 }} />
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--text-2)", marginBottom:6 }}>Work Email</label>
              <div style={{ position:"relative" }}>
                <Mail size={14} style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", color:"var(--text-3)", pointerEvents:"none" }} />
                <input id="join-email" name="email" type="email" className="input" placeholder="you@company.com"
                  value={form.email} onChange={handleChange} required style={{ paddingLeft:38 }} />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--text-2)", marginBottom:6 }}>Password</label>
              <div style={{ position:"relative" }}>
                <Lock size={14} style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", color:"var(--text-3)", pointerEvents:"none" }} />
                <input id="join-password" name="password" type={showPassword ? "text" : "password"} className="input"
                  placeholder="Minimum 8 characters" value={form.password} onChange={handleChange}
                  required style={{ paddingLeft:38, paddingRight:44 }} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"var(--text-3)", cursor:"pointer" }}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.password && (
                <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ marginTop:8 }}>
                  <div style={{ display:"flex", gap:4 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ flex:1, height:3, borderRadius:99, background: i <= strength.score ? strength.color : "var(--border)", transition:"background 0.3s" }} />
                    ))}
                  </div>
                  <p style={{ fontSize:11, color:strength.color, marginTop:4 }}>{strength.label}</p>
                </motion.div>
              )}
            </div>

            {/* Payment summary */}
            <div style={{ background:"rgba(226,55,68,0.06)", border:"1px solid rgba(226,55,68,0.15)", borderRadius:12, padding:"14px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"var(--text-2)", margin:0 }}>Doott Lifetime Access</p>
                  <p style={{ fontSize:11, color:"var(--text-3)", margin:"2px 0 0" }}>One-time payment · No recurring fees</p>
                </div>
                <span style={{ fontSize:20, fontWeight:900, color:"var(--accent)" }}>₹179</span>
              </div>
            </div>

            <p style={{ fontSize:12, color:"var(--text-3)", lineHeight:1.5, margin:0 }}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>

            <motion.button type="submit" whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }} disabled={loading}
              className="btn-primary" style={{ width:"100%", justifyContent:"center", height:48, fontSize:14, fontWeight:700 }}>
              {loading ? (
                <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ width:14, height:14, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", animation:"spin 0.6s linear infinite" }} />
                  Opening payment…
                </span>
              ) : (
                <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Zap size={15} /> Pay ₹179 &amp; Create Account <ArrowRight size={15} />
                </span>
              )}
            </motion.button>

            <p style={{ textAlign:"center", fontSize:11, color:"var(--text-3)", margin:0 }}>
              🔒 Secured by Razorpay · UPI · Cards · Net Banking · Wallets
            </p>
          </form>
        </div>

        <p style={{ textAlign:"center", color:"var(--text-3)", fontSize:13, marginTop:20 }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color:"var(--accent-2)", textDecoration:"none", fontWeight:500 }}>Sign in</Link>
        </p>
        <p style={{ textAlign:"center", color:"var(--text-3)", fontSize:12, marginTop:8 }}>
          <Link to="/pricing" style={{ color:"var(--text-3)", textDecoration:"none" }}>← Back to pricing</Link>
        </p>
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
