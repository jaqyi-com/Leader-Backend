import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Users, ShieldAlert, Mail, UserPlus, Trash2,
  AlertCircle, Save, Loader2, Crown, Shield, User,
  CheckCircle, X, ChevronDown, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { resetState, getEnv, saveEnv } from "../api";

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

const ROLE_META = {
  admin:  { label: "Admin",  icon: <Crown  size={13} />, color: "var(--accent-2)" },
  member: { label: "Member", icon: <Shield size={13} />, color: "var(--text-2)" },
  viewer: { label: "Viewer", icon: <User   size={13} />, color: "var(--text-3)" },
};

// ── TABS ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: "org",    label: "Organization", icon: <Building2  size={15} /> },
  { id: "members",label: "Members",      icon: <Users      size={15} /> },
  { id: "danger", label: "Danger Zone",  icon: <ShieldAlert size={15} /> },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("org");

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Settings</h1>
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>Manage your organization, team members, and credentials.</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "var(--surface-2)", borderRadius: 12, padding: 4, border: "1px solid var(--border)", width: "fit-content" }}>
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
          {tab === "org"     && <OrgTab />}
          {tab === "members" && <MembersTab />}
          {tab === "danger"  && <DangerTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ORG TAB
// ══════════════════════════════════════════════════════════════════════════════
function OrgTab() {
  const apiFetch = useApi();
  const { org } = useAuth();
  const [form, setForm] = useState({ name: "", website: "", industry: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (org) setForm({ name: org.name || "", website: org.website || "", industry: org.industry || "" });
  }, [org]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/org", { method: "PATCH", body: JSON.stringify(form) });
      toast.success("Organization updated!");
    } catch (err) {
      toast.error(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="card" style={{ padding: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,var(--accent),#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Building2 size={18} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>Organization Profile</h2>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Slug: <code style={{ color: "var(--accent-2)" }}>{org?.slug}</code> · Plan: <span style={{ color: "var(--accent-2)", fontWeight: 600, textTransform: "uppercase", fontSize: 11 }}>{org?.plan || "free"}</span></p>
        </div>
      </div>
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Organization Name" required>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Corp" required />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Website">
            <input className="input" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://acme.com" />
          </Field>
          <Field label="Industry">
            <input className="input" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="SaaS, FinTech…" />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn-primary" disabled={saving} style={{ gap: 8 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MEMBERS TAB
// ══════════════════════════════════════════════════════════════════════════════
function MembersTab() {
  const apiFetch = useApi();
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteDone, setInviteDone] = useState("");

  useEffect(() => { fetchMembers(); }, []);

  async function fetchMembers() {
    setLoading(true);
    try {
      const data = await apiFetch("/org/members");
      setMembers(data.members || []);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    setInviteDone("");
    try {
      await apiFetch("/org/members/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteDone(inviteEmail);
      setInviteEmail("");
      fetchMembers();
      toast.success(`Invite sent to ${inviteEmail}!`);
    } catch (err) { toast.error(err.message); }
    finally { setInviting(false); }
  }

  async function changeRole(userId, newRole) {
    try {
      await apiFetch(`/org/members/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
      toast.success("Role updated");
      fetchMembers();
    } catch (err) { toast.error(err.message); }
  }

  async function removeMember(userId, name) {
    if (!window.confirm(`Remove ${name} from the organization?`)) return;
    try {
      await apiFetch(`/org/members/${userId}`, { method: "DELETE" });
      toast.success(`${name} removed`);
      fetchMembers();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Invite card */}
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <UserPlus size={16} style={{ color: "var(--accent)" }} /> Invite Team Member
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>They'll receive an email with a link to join your organization.</p>
        <form onSubmit={handleInvite} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Mail size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
            <input
              id="invite-email"
              className="input"
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              required
              style={{ paddingLeft: 36 }}
            />
          </div>
          {/* Role selector */}
          <div style={{ position: "relative" }}>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              style={{
                appearance: "none", background: "var(--surface-3)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "9px 36px 9px 12px", color: "var(--text)", fontSize: 13,
                cursor: "pointer",
              }}
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-3)" }} />
          </div>
          <button type="submit" className="btn-primary" disabled={inviting} style={{ gap: 8 }}>
            {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Send Invite
          </button>
        </form>
        <AnimatePresence>
          {inviteDone && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--emerald)" }}>
              <CheckCircle size={14} /> Invite sent to <strong>{inviteDone}</strong>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Members list */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <Users size={16} style={{ color: "var(--accent)" }} /> Team Members
          </h2>
          <span style={{ fontSize: 12, color: "var(--text-3)", background: "var(--surface-3)", padding: "3px 10px", borderRadius: 20, border: "1px solid var(--border)" }}>
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 size={22} style={{ color: "var(--text-3)", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : members.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 14 }}>
            No members yet. Invite your team above.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((m) => {
              const isMe = m.user?._id === user?._id;
              const role = m.role || "member";
              const rm = ROLE_META[role];
              return (
                <motion.div key={m._id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                    borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)",
                  }}>
                  {/* Avatar */}
                  {m.user?.avatar ? (
                    <img src={m.user.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
                  ) : (
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: m.status === "invited" ? "var(--surface-3)" : "linear-gradient(135deg,var(--accent),#8b5cf6)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 13, fontWeight: 700,
                    }}>
                      {m.user?.name ? m.user.name[0].toUpperCase() : <Mail size={15} />}
                    </div>
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                      {m.user?.name || m.inviteEmail || "Invited user"}
                      {isMe && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "rgba(108,99,255,0.12)", padding: "1px 6px", borderRadius: 20 }}>You</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                      {m.user?.email || m.inviteEmail}
                    </div>
                  </div>

                  {/* Status badge */}
                  {m.status === "invited" && (
                    <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ember)", background: "rgba(251,146,60,0.1)", padding: "3px 8px", borderRadius: 20, border: "1px solid rgba(251,146,60,0.2)" }}>
                      Invited
                    </span>
                  )}

                  {/* Role badge / selector */}
                  {!isMe && m.status === "active" ? (
                    <div style={{ position: "relative" }}>
                      <select
                        value={role}
                        onChange={e => changeRole(m.user._id, e.target.value)}
                        style={{
                          appearance: "none", background: "var(--surface-3)", border: "1px solid var(--border)",
                          borderRadius: 8, padding: "5px 28px 5px 10px", color: rm.color,
                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-3)" }} />
                    </div>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: rm?.color, background: "var(--surface-3)", padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border)" }}>
                      {rm?.icon} {rm?.label}
                    </span>
                  )}

                  {/* Remove button */}
                  {!isMe && m.status === "active" && (
                    <button
                      onClick={() => removeMember(m.user._id, m.user.name)}
                      style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 5, borderRadius: 6, display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--rose)"; e.currentTarget.style.background = "rgba(244,63,94,0.08)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "none"; }}
                      title="Remove member"
                    >
                      <X size={14} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Roles legend */}
      <div className="card" style={{ padding: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", marginBottom: 10 }}>Role Permissions</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { role: "admin", desc: "Full access — invite, remove members, edit org settings" },
            { role: "member", desc: "Full access to pipeline, scraper, and outreach features" },
            { role: "viewer", desc: "Read-only access to all data — cannot trigger actions" },
          ].map(({ role, desc }) => (
            <div key={role} style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: "1 1 200px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: ROLE_META[role].color, whiteSpace: "nowrap" }}>
                {ROLE_META[role].icon} {ROLE_META[role].label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.4 }}>— {desc}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DANGER ZONE TAB (preserved from original)
// ══════════════════════════════════════════════════════════════════════════════
function DangerTab() {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function handleReset() {
    setLoading(true);
    try { const { data } = await resetState(); toast.success(data.message || "State reset successfully"); setConfirm(false); }
    catch (e) { toast.error(e.response?.data?.error || "Failed to reset state"); }
    finally { setLoading(false); }
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldAlert size={16} style={{ color: "var(--rose)" }} /> Danger Zone
      </h2>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 20 }}>Irreversible actions. Proceed with caution.</p>
      <div style={{ padding: 16, borderRadius: 12, background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.15)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <AlertCircle size={16} style={{ color: "var(--rose)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--rose)", marginBottom: 4 }}>Reset Deduplication Cache</p>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.5 }}>
              Clears the deduplication memory. The agent will re-scrape and re-email previously seen companies.
            </p>
            {!confirm ? (
              <button onClick={() => setConfirm(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)", color: "var(--rose)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <Trash2 size={13} /> Delete Cache
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleReset} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "var(--rose)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Confirm Reset
                </button>
                <button onClick={() => setConfirm(false)} style={{ padding: "8px 16px", borderRadius: 8, background: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text-2)", fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared Field wrapper ─────────────────────────────────────────────────────
function Field({ label, children, required }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>
        {label} {required && <span style={{ color: "var(--rose)" }}>*</span>}
      </label>
      {children}
    </div>
  );
}
