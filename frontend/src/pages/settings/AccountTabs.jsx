import { useEffect, useState } from "react";
import {
  User, Lock, KeyRound, LogOut, Trash2, Loader2, Save, Copy, Check, Eye, EyeOff,
  Mail, AlertTriangle, Plus, ShieldCheck, ExternalLink,
} from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
// Absolute API base for code examples (VITE_API_URL may be relative in some builds).
const API_ABS = /^https?:\/\//.test(API) ? API.replace(/\/$/, "") : "https://leader-backend.vercel.app/api";

function useAccountApi() {
  const { token } = useAuth();
  return async (path, opts = {}) => {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };
}

/** Loads GET /api/account; shared by the tabs below. */
function useAccount() {
  const apiFetch = useAccountApi();
  const [account, setAccount] = useState(null);
  async function reload() {
    try { setAccount((await apiFetch("/account")).account); }
    catch (err) { toast.error(err.message); }
  }
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [account, reload];
}

// ── shared bits ─────────────────────────────────────────────────────────────
const h2 = { fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" };
const sub = { fontSize: 13, color: "var(--text-3)", margin: "0 0 18px" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-3)", marginBottom: 6 };

function Card({ icon: Icon, title, desc, children, danger }) {
  return (
    <div className="card" style={{ padding: 28, ...(danger ? { borderColor: "rgba(244,63,94,0.35)" } : {}) }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 4 }}>
        {Icon && <Icon size={17} style={{ marginTop: 2, color: danger ? "var(--rose)" : "var(--accent-2)", flexShrink: 0 }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={h2}>{title}</h2>
          {desc && <p style={sub}>{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Label({ children, htmlFor }) {
  return <label htmlFor={htmlFor} style={labelStyle}>{children}</label>;
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id} className="input" type={show ? "text" : "password"} value={value} placeholder={placeholder}
        autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} style={{ paddingRight: 40 }}
      />
      <button
        type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4, display: "flex" }}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = [["Too short", "var(--rose)"], ["Weak", "var(--rose)"], ["Fair", "var(--amber)"], ["Good", "#10b981"], ["Strong", "#10b981"]];

function StrengthMeter({ password }) {
  if (!password) return null;
  const s = password.length < 8 ? 0 : strength(password);
  const [label, color] = STRENGTH[s];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= s ? color : "var(--border)" }} />
        ))}
      </div>
      <p style={{ fontSize: 11, color, margin: "4px 0 0" }}>{label}</p>
    </div>
  );
}

function CopyBox({ value, mono = true }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      <code style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: mono ? "nowrap" : "pre", padding: "9px 11px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text)" }}>{value}</code>
      <button
        className="btn-secondary" style={{ gap: 6, flexShrink: 0 }}
        onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => toast.error("Copy failed"))}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
const fmtWhen = (d) => (d ? new Date(d).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never");

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════════
export function ProfileTab() {
  const apiFetch = useAccountApi();
  const { refetch } = useAuth();
  const [account, reload] = useAccount();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (account) setName(account.name || ""); }, [account]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/account/profile", { method: "PATCH", body: JSON.stringify({ name }) });
      toast.success("Profile saved");
      reload();
      refetch?.();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  if (!account) return <div className="card" style={{ padding: 28 }}><Loader2 size={18} className="animate-spin" /></div>;
  const initials = (account.name || account.email).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card icon={User} title="Profile" desc="Your name is shown to members of your organization.">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          {account.avatar
            ? <img src={account.avatar} alt="" style={{ width: 52, height: 52, borderRadius: "50%" }} referrerPolicy="no-referrer" />
            : <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent),#f4576a)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{initials}</div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "var(--text)" }}>{account.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis" }}>{account.email}</div>
          </div>
        </div>
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label htmlFor="acc-name">Full name</Label>
            <input id="acc-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="acc-email">Email</Label>
            <input id="acc-email" className="input" value={account.email} disabled style={{ opacity: 0.7 }} />
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 0" }}>Your email is your sign-in and cannot be changed here.</p>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn-primary" disabled={saving || !name.trim() || name.trim() === account.name} style={{ gap: 8 }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
        </form>
      </Card>

      <Card icon={ShieldCheck} title="Plan and account">
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, margin: 0 }}>
          {[
            ["Plan", account.plan === "lifetime" ? "Lifetime access" : "Free"],
            ["Paid on", account.paidAt ? fmtDate(account.paidAt) : "—"],
            ["Member since", fmtDate(account.createdAt)],
            ["Sign-in methods", [account.hasPassword && "Email and password", account.googleLinked && "Google"].filter(Boolean).join(", ") || "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{v}</dd>
            </div>
          ))}
        </dl>
        {account.plan !== "lifetime" && (
          <p style={{ fontSize: 13, margin: "16px 0 0" }}>
            <Link to="/pricing" style={{ color: "var(--accent-2)" }}>Get lifetime access →</Link>
          </p>
        )}
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY
// ══════════════════════════════════════════════════════════════════════════════
export function SecurityTab() {
  const apiFetch = useAccountApi();
  const { login, user, org } = useAuth();
  const [account, reload] = useAccount();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(null);

  function adoptToken(token) {
    if (token) login({ token, user, org }); // keep this device signed in with the new session
  }

  async function changePassword(e) {
    e.preventDefault();
    if (next !== confirm) return toast.error("The new passwords don't match.");
    setBusy("password");
    try {
      const d = await apiFetch("/account/password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      adoptToken(d.token);
      toast.success(d.message || "Password changed");
      setCurrent(""); setNext(""); setConfirm("");
      reload();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  async function sendResetLink() {
    setBusy("reset");
    try { toast.success((await apiFetch("/account/password/reset-link", { method: "POST" })).message, { duration: 6000 }); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  async function signOutOthers() {
    if (!window.confirm("Sign out of Doott on every other browser and device? This one stays signed in.")) return;
    setBusy("sessions");
    try {
      const d = await apiFetch("/account/sessions/revoke-others", { method: "POST" });
      adoptToken(d.token);
      toast.success(d.message);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  if (!account) return <div className="card" style={{ padding: 28 }}><Loader2 size={18} className="animate-spin" /></div>;
  const hasPw = account.hasPassword;
  const canSubmit = next.length >= 8 && next === confirm && (!hasPw || current);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card
        icon={Lock}
        title={hasPw ? "Change password" : "Set a password"}
        desc={hasPw
          ? "Use at least 8 characters. Changing your password signs you out on your other devices."
          : "You sign in with Google. Set a password to also sign in with your email address."}
      >
        <form onSubmit={changePassword} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
          <input type="text" name="username" autoComplete="username" value={account.email} readOnly hidden />
          {hasPw && (
            <div>
              <Label htmlFor="pw-current">Current password</Label>
              <PasswordInput id="pw-current" value={current} onChange={setCurrent} autoComplete="current-password" />
            </div>
          )}
          <div>
            <Label htmlFor="pw-new">New password</Label>
            <PasswordInput id="pw-new" value={next} onChange={setNext} autoComplete="new-password" />
            <StrengthMeter password={next} />
          </div>
          <div>
            <Label htmlFor="pw-confirm">Confirm new password</Label>
            <PasswordInput id="pw-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {confirm && next !== confirm && <p style={{ fontSize: 12, color: "var(--rose)", margin: "6px 0 0" }}>Passwords don't match.</p>}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="submit" className="btn-primary" disabled={!canSubmit || Boolean(busy)} style={{ gap: 8 }}>
              {busy === "password" ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {hasPw ? "Change password" : "Set password"}
            </button>
          </div>
        </form>
      </Card>

      <Card icon={Mail} title="Forgot your password?" desc={`We'll email a reset link to ${account.email}. The link works for 1 hour.`}>
        <button className="btn-secondary" onClick={sendResetLink} disabled={Boolean(busy)} style={{ gap: 8 }}>
          {busy === "reset" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Email me a reset link
        </button>
      </Card>

      <Card icon={LogOut} title="Sessions" desc="Signed in on a shared or lost device? Sign out everywhere else. This browser stays signed in.">
        <button className="btn-secondary" onClick={signOutOthers} disabled={Boolean(busy)} style={{ gap: 8 }}>
          {busy === "sessions" ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Sign out of all other devices
        </button>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: "12px 0 0" }}>
          Claude connections and API keys are separate: manage them in the Claude and API keys tabs.
        </p>
      </Card>

      <DangerZone account={account} />
    </div>
  );
}

function DangerZone({ account }) {
  const apiFetch = useAccountApi();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function del(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/account", { method: "DELETE", body: JSON.stringify({ confirmEmail: email, password }) });
      toast.success("Your account was deleted.");
      logout();
      navigate("/", { replace: true });
    } catch (err) { toast.error(err.message, { duration: 7000 }); setBusy(false); }
  }

  return (
    <Card icon={AlertTriangle} title="Delete account" danger
      desc="Permanently deletes your account, your API keys, your Claude connections and any organization you own alone. This cannot be undone.">
      {account.plan === "lifetime" && (
        <p style={{ fontSize: 13, color: "var(--rose)", margin: "0 0 14px" }}>You have lifetime access. Deleting the account ends it, and it is not refunded.</p>
      )}
      {!open ? (
        <button className="btn-secondary" onClick={() => setOpen(true)} style={{ gap: 8, color: "var(--rose)", borderColor: "rgba(244,63,94,0.4)" }}>
          <Trash2 size={14} /> Delete my account…
        </button>
      ) : (
        <form onSubmit={del} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
          <div>
            <Label htmlFor="del-email">Type <b style={{ color: "var(--text)" }}>{account.email}</b> to confirm</Label>
            <input id="del-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          {account.hasPassword && (
            <div>
              <Label htmlFor="del-pw">Password</Label>
              <PasswordInput id="del-pw" value={password} onChange={setPassword} autoComplete="current-password" />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn-secondary" onClick={() => { setOpen(false); setEmail(""); setPassword(""); }} disabled={busy}>Cancel</button>
            <button
              type="submit" className="btn-primary"
              disabled={busy || email.trim().toLowerCase() !== account.email || (account.hasPassword && !password)}
              style={{ gap: 8, background: "var(--rose)" }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete permanently
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// API KEYS
// ══════════════════════════════════════════════════════════════════════════════
export function ApiKeysTab() {
  const apiFetch = useAccountApi();
  const [keys, setKeys] = useState(null);
  const [max, setMax] = useState(10);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState(null); // { key, name } — shown once

  async function load() {
    try { const d = await apiFetch("/account/api-keys"); setKeys(d.keys); setMax(d.max); }
    catch (err) { toast.error(err.message); setKeys([]); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const d = await apiFetch("/account/api-keys", { method: "POST", body: JSON.stringify({ name }) });
      setFresh({ key: d.key, name: d.apiKey.name });
      setName("");
      load();
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  }

  async function revoke(k) {
    if (!window.confirm(`Revoke “${k.name}”? Anything using this key stops working right away.`)) return;
    try {
      await apiFetch(`/account/api-keys/${k.id}`, { method: "DELETE" });
      toast.success("Key revoked");
      load();
    } catch (err) { toast.error(err.message); }
  }

  const sample = fresh?.key || "doott_YOUR_KEY";
  const curl = `curl "${API_ABS}/final-people?f_city=Pune&f_job_title=HR%20Manager&limit=25" \\\n  -H "Authorization: Bearer ${sample}"`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card icon={KeyRound} title="API keys" desc="Use Doott data in your own code, scripts, CRM or spreadsheets. A key acts as you: searches count toward your limits and follow your plan.">
        {fresh && (
          <div style={{ border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.07)", borderRadius: 10, padding: 16, marginBottom: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: "0 0 4px" }}>“{fresh.name}” is ready. Copy the key now.</p>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 10px" }}>For your security we only show it once. If you lose it, revoke it and create a new one.</p>
            <CopyBox value={fresh.key} />
            <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => setFresh(null)}>I've saved it</button>
          </div>
        )}

        <form onSubmit={create} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <input
            className="input" style={{ flex: "1 1 220px" }} value={name} maxLength={60}
            onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. CRM sync" aria-label="Key name"
          />
          <button type="submit" className="btn-primary" disabled={creating || !name.trim() || (keys && keys.length >= max)} style={{ gap: 8 }}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create key
          </button>
        </form>

        {keys === null && <Loader2 size={18} className="animate-spin" />}
        {keys?.length === 0 && <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>No keys yet.</p>}
        {keys?.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <th style={{ padding: "8px 8px 8px 0", fontWeight: 600 }}>Name</th>
                  <th style={{ padding: 8, fontWeight: 600 }}>Key</th>
                  <th style={{ padding: 8, fontWeight: 600 }}>Created</th>
                  <th style={{ padding: 8, fontWeight: 600 }}>Last used</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 8px 10px 0", fontWeight: 600, color: "var(--text)" }}>{k.name}</td>
                    <td style={{ padding: 8 }}><code style={{ fontSize: 12, color: "var(--text-2)" }}>{k.prefix}…</code></td>
                    <td style={{ padding: 8, color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtDate(k.createdAt)}</td>
                    <td style={{ padding: 8, color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtWhen(k.lastUsedAt)}</td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>
                      <button className="btn-secondary" style={{ gap: 6 }} onClick={() => revoke(k)}><Trash2 size={13} /> Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "10px 0 0" }}>{keys.length} of {max} keys used.</p>
          </div>
        )}
      </Card>

      <Card icon={ExternalLink} title="Quick start" desc="Send the key in the Authorization header (or as X-API-Key). Keys work only with the data API, never with account settings.">
        <CopyBox value={curl} mono={false} />
        <ul style={{ fontSize: 13, color: "var(--text-2)", margin: "14px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <li><code>GET /final-people</code>: people, with filters such as <code>f_city</code>, <code>f_job_title</code></li>
          <li><code>country</code>: any country name or ISO code, e.g. <code>country=IN</code>, <code>country=US</code>, <code>country=CA</code>, <code>country=GB</code></li>
          <li><code>GET /final-companies</code>: companies, with <code>f_city</code>, <code>f_industry</code>, <code>f_country</code></li>
          <li><code>GET /final-people-email</code> and <code>/final-people-number</code>: only people with an email or a phone number</li>
          <li><code>POST /verify-email</code> with <code>{"{"}"email": "…"{"}"}</code>: check whether an address is deliverable</li>
          <li>Pages: <code>page</code> and <code>limit</code> (up to 500 per page)</li>
        </ul>
        <p style={{ fontSize: 13, margin: "14px 0 0" }}>
          <a href="/api-docs" style={{ color: "var(--accent-2)" }}>Full API reference →</a>
        </p>
      </Card>
    </div>
  );
}
