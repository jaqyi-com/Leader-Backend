import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Loader2, Plug, Copy, UserCircle, Lock, KeyRound } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { Link, useSearchParams } from "react-router-dom";
import { ProfileTab, SecurityTab, ApiKeysTab } from "./settings/AccountTabs";
import { MCP_URL, CLAUDE_CODE_COMMAND } from "../claudeConnector";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ── helper: authed fetch ────────────────────────────────────────────────────
function useApi() {
  const { token } = useAuth();
  return async (path, opts = {}) => {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };
}


// ── TABS ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: "profile",  label: "Profile",      icon: <UserCircle size={15} /> },
  { id: "security", label: "Security",     icon: <Lock size={15} /> },
  { id: "api",      label: "API keys",     icon: <KeyRound size={15} /> },
  { id: "claude",  label: "Claude",       icon: <Plug size={15} /> },
];

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "profile";
  const setTab = (id) => setParams(id === "profile" ? {} : { tab: id }, { replace: true });

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Settings</h1>
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>Manage your profile, password, API keys and the Claude connector.</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "var(--surface-2)", borderRadius: 12, padding: 4, border: "1px solid var(--border)", width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
              borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
              background: tab === t.id ? "var(--surface-3)" : "transparent",
              color: tab === t.id ? "var(--text)" : "var(--text-3)",
              boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
              transition: "all 0.15s",
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === "profile"  && <ProfileTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "api"      && <ApiKeysTab />}
          {tab === "claude"  && <ClaudeTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CLAUDE TAB — MCP connector URL, setup steps, connected apps
// ══════════════════════════════════════════════════════════════════════════════
function CopyRow({ value }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <code style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "nowrap", padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text)" }}>{value}</code>
      <button
        className="btn-secondary"
        style={{ gap: 6, flexShrink: 0 }}
        onClick={() => { navigator.clipboard?.writeText(value).then(() => toast.success("Copied"), () => toast.error("Copy failed")); }}
      >
        <Copy size={13} /> Copy
      </button>
    </div>
  );
}

function ClaudeTab() {
  const apiFetch = useApi();
  const [connections, setConnections] = useState(null);

  async function load() {
    try { setConnections((await apiFetch("/mcp/connections")).connections); }
    catch (err) { toast.error(err.message); setConnections([]); }
  }
  useEffect(() => { load(); }, []);

  async function disconnect(id) {
    try {
      await apiFetch(`/mcp/connections/${id}`, { method: "DELETE" });
      toast.success("Disconnected");
      load();
    } catch (err) { toast.error(err.message); }
  }

  const step = { fontSize: 13, color: "var(--text-2)", margin: "0 0 6px" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>Connect Doott to Claude</h2>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 18px" }}>
          Ask Claude to find people and companies in Doott, with emails and phone numbers. Claude signs in with your Doott account (read only).
        </p>

        <p style={{ ...step, fontWeight: 600, color: "var(--text)" }}>Connector URL</p>
        <CopyRow value={MCP_URL} />

        <p style={{ ...step, fontWeight: 600, color: "var(--text)", marginTop: 18 }}>Claude (web, desktop and mobile)</p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 4 }}>
          <li>Open Claude → <strong>Settings → Connectors</strong> → <strong>Add custom connector</strong>.</li>
          <li>Name it <strong>Doott</strong> and paste the connector URL above. Click <strong>Add</strong>.</li>
          <li>Click <strong>Connect</strong>, sign in to Doott and click <strong>Allow</strong>.</li>
          <li>In a chat, turn Doott on from the tools menu and ask, e.g. “Find 20 HR managers in Pune with a verified email”.</li>
        </ol>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 0" }}>On Team and Enterprise plans an owner may need to add the connector for the organization first.</p>

        <p style={{ ...step, fontWeight: 600, color: "var(--text)", marginTop: 18 }}>Claude Code</p>
        <CopyRow value={CLAUDE_CODE_COMMAND} />
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 0" }}>Then run <code>/mcp</code> in Claude Code and choose <strong>doott → Authenticate</strong>.</p>
        <p style={{ fontSize: 13, margin: "18px 0 0" }}>
          <Link to="/claude" style={{ color: "var(--accent-2)" }}>Full setup guide, example questions and troubleshooting →</Link>
        </p>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>Connected apps</h2>
        {connections === null && <Loader2 size={18} className="animate-spin" />}
        {connections?.length === 0 && <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>Nothing is connected yet.</p>}
        {connections?.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.clientName}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                Connected {new Date(c.connectedAt).toLocaleDateString()}
                {c.lastUsedAt ? ` · last used ${new Date(c.lastUsedAt).toLocaleString()}` : ""}
              </div>
            </div>
            <button className="btn-secondary" style={{ gap: 6 }} onClick={() => disconnect(c.id)}>
              <Trash2 size={13} /> Disconnect
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
