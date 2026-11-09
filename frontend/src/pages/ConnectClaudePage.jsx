import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Loader2, ShieldCheck, Search, Mail, X, Check, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import doottLogo from "../assets/doott-logo.png";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

/**
 * OAuth consent screen for the Doott MCP connector.
 * Claude sends the user to /oauth/authorize on the API, which redirects here with a signed `request`.
 * The user is already signed in (ProtectedRoute); Allow / Deny returns them to Claude.
 */
export default function ConnectClaudePage() {
  const [params] = useSearchParams();
  const request = params.get("request") || "";
  const { token, user, logout } = useAuth();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // "allow" | "deny" | null

  useEffect(() => {
    if (!request) { setError("This link is missing its connection request. Start again from Claude."); return; }
    fetch(`${API}/mcp/consent?request=${encodeURIComponent(request)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Could not load this connection request.");
        setInfo(d);
      })
      .catch((e) => setError(e.message));
  }, [request, token]);

  async function decide(approve) {
    setBusy(approve ? "allow" : "deny");
    setError("");
    try {
      const r = await fetch(`${API}/mcp/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ request, approve }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.redirect) throw new Error(d.error || "Could not complete the connection.");
      window.location.assign(d.redirect);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 440, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <img src={doottLogo} alt="Doott" style={{ width: 40, height: 40, borderRadius: "50%" }} />
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>
              {info ? `Connect ${info.clientName} to Doott` : "Connect to Doott"}
            </h1>
            {info?.redirectHost && (
              <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Requested by {info.redirectHost}</p>
            )}
          </div>
        </div>

        {error && (
          <div style={{ display: "flex", gap: 8, padding: 12, borderRadius: 10, background: "rgba(226,55,68,0.08)", color: "var(--text)", fontSize: 13, marginBottom: 16 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1, color: "var(--accent)" }} />
            <span>{error}</span>
          </div>
        )}

        {!info && !error && (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}

        {info && (
          <>
            <p style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 12 }}>
              <strong style={{ color: "var(--text)" }}>{info.clientName}</strong> wants to use your Doott account
              {" "}(<span style={{ color: "var(--text)" }}>{info.email || user?.email}</span>). It will be able to:
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                [<Search size={15} key="s" />, "Search Doott people and companies, with their emails and phone numbers"],
                [<Mail size={15} key="m" />, "Check whether an email address is deliverable"],
                [<ShieldCheck size={15} key="r" />, "Read only: it cannot change your account or your data"],
              ].map(([icon, text]) => (
                <li key={text} style={{ display: "flex", gap: 10, fontSize: 13, color: "var(--text-2)" }}>
                  <span style={{ color: "var(--accent-2)", marginTop: 1 }}>{icon}</span>{text}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 20 }}>
              Searches count toward your normal Doott limits. You can disconnect at any time in{" "}
              <Link to="/app/settings" style={{ color: "var(--accent-2)" }}>Settings → Claude</Link>.
              Only allow this if you started the connection yourself.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn-secondary" onClick={() => decide(false)} disabled={Boolean(busy)} style={{ gap: 6 }}>
                {busy === "deny" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Deny
              </button>
              <button className="btn-primary" onClick={() => decide(true)} disabled={Boolean(busy)} style={{ gap: 6 }}>
                {busy === "allow" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Allow
              </button>
            </div>
          </>
        )}

        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 20, marginBottom: 0 }}>
          Not {user?.email}?{" "}
          <button onClick={logout} style={{ background: "none", border: "none", padding: 0, color: "var(--accent-2)", cursor: "pointer", fontSize: 12 }}>
            Sign in with a different account
          </button>
        </p>
      </div>
    </div>
  );
}
