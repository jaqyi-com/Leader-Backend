import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Rocket, Pause, Trash2, Mail, MessageSquare, Smartphone,
  CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchCampaigns, launchCampaign, pauseCampaign,
  sendFollowup, deleteCampaign, markReplied,
} from "../../api/outreach";

const CH_ICON = { email: Mail, whatsapp: MessageSquare, sms: Smartphone };
const CH_COLOR = { email: "#6c63ff", whatsapp: "#25d366", sms: "#fbbf24" };
const STATUS_STYLE = {
  draft: { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", label: "Draft" },
  active: { bg: "rgba(34,197,94,0.12)", color: "#22c55e", label: "Active" },
  paused: { bg: "rgba(251,191,36,0.12)", color: "#fbbf24", label: "Paused" },
  completed: { bg: "rgba(108,99,255,0.12)", color: "#6c63ff", label: "Completed" },
};

export default function CampaignsDashboardTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { campaigns: c } = await fetchCampaigns();
      setCampaigns(c || []);
    } catch { }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleLaunch(id) {
    try {
      await launchCampaign(id);
      toast.success("Campaign launched! Emails are being sent.");
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function handlePause(id) {
    try {
      await pauseCampaign(id);
      toast.success("Campaign paused");
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this campaign?")) return;
    try {
      await deleteCampaign(id);
      toast.success("Campaign deleted");
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function handleFollowup(id, day) {
    try {
      await sendFollowup(id, day);
      toast.success(`Day ${day} follow-ups sent!`);
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function handleMarkReply(campaignId, contactId) {
    try {
      await markReplied(campaignId, contactId);
      toast.success("Marked as replied — sequence stopped");
      load();
    } catch (e) { toast.error(e.message); }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
        <Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!campaigns.length) {
    return (
      <div style={{
        textAlign: "center", padding: 60, color: "var(--text-3)",
        borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)",
      }}>
        <Rocket size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)" }}>No campaigns yet</p>
        <p style={{ fontSize: 13 }}>Select contacts from the Contact Pool tab to create your first campaign.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={load} style={{
          background: "none", border: "1px solid var(--border)", borderRadius: 8,
          padding: "6px 12px", color: "var(--text-2)", fontSize: 12, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}><RefreshCw size={12} /> Refresh</button>
      </div>

      {campaigns.map(camp => {
        const st = STATUS_STYLE[camp.status] || STATUS_STYLE.draft;
        const isExpanded = expanded === camp._id;
        const totalContacts = camp.contacts?.length || 0;
        const sent = camp.sentCount || 0;
        const replied = camp.repliedCount || 0;
        const rate = totalContacts > 0 ? Math.round((sent / totalContacts) * 100) : 0;

        return (
          <div key={camp._id} className="card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Campaign header */}
            <div style={{
              padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
              cursor: "pointer",
            }} onClick={() => setExpanded(isExpanded ? null : camp._id)}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{camp.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                    padding: "2px 8px", borderRadius: 20,
                    background: st.bg, color: st.color,
                  }}>{st.label}</span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-3)" }}>
                  <span>{totalContacts} contacts</span>
                  <span>{sent} sent</span>
                  <span>{replied} replied</span>
                  <span>{rate}% reached</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    {camp.channels?.map(ch => {
                      const Icon = CH_ICON[ch] || Mail;
                      return <Icon key={ch} size={12} style={{ color: CH_COLOR[ch] }} />;
                    })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                {camp.status === "draft" && (
                  <button onClick={() => handleLaunch(camp._id)} className="btn-primary"
                    style={{ padding: "6px 14px", fontSize: 12, gap: 4 }}>
                    <Rocket size={12} /> Launch
                  </button>
                )}
                {camp.status === "active" && (
                  <>
                    <button onClick={() => handleFollowup(camp._id, 3)} style={{
                      background: "#25d36615", border: "1px solid #25d36640", borderRadius: 8,
                      padding: "6px 12px", fontSize: 11, color: "#25d366", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 4,
                    }}><MessageSquare size={11} /> Day 3</button>
                    <button onClick={() => handleFollowup(camp._id, 7)} style={{
                      background: "#fbbf2415", border: "1px solid #fbbf2440", borderRadius: 8,
                      padding: "6px 12px", fontSize: 11, color: "#fbbf24", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 4,
                    }}><Smartphone size={11} /> Day 7</button>
                    <button onClick={() => handlePause(camp._id)} style={{
                      background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8,
                      padding: "6px 10px", fontSize: 11, color: "var(--text-3)", cursor: "pointer",
                    }}><Pause size={11} /></button>
                  </>
                )}
                <button onClick={() => handleDelete(camp._id)} style={{
                  background: "none", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 8,
                  padding: "6px 10px", color: "var(--rose)", cursor: "pointer",
                }}><Trash2 size={11} /></button>
              </div>

              {isExpanded ? <ChevronUp size={16} style={{ color: "var(--text-3)" }} />
                : <ChevronDown size={16} style={{ color: "var(--text-3)" }} />}
            </div>

            {/* Expanded contact list */}
            {isExpanded && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }}
                style={{ borderTop: "1px solid var(--border)", overflow: "hidden" }}>
                <div style={{ maxHeight: 350, overflowY: "auto" }}>
                  {camp.contacts?.map(ct => {
                    const lastDelivery = ct.deliveries?.[ct.deliveries.length - 1];
                    return (
                      <div key={ct._id || ct.contactId} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 20px", borderBottom: "1px solid var(--border)",
                        fontSize: 12,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>{ct.name}</span>
                          <span style={{ color: "var(--text-3)", marginLeft: 8 }}>{ct.email || ct.phone}</span>
                        </div>
                        <span style={{ color: "var(--text-3)", fontSize: 11 }}>{ct.companyName}</span>

                        {/* Delivery status */}
                        {ct.deliveries?.map((d, i) => {
                          const DIcon = CH_ICON[d.channel] || Mail;
                          return (
                            <span key={i} title={`Day ${d.day} ${d.channel}: ${d.status}`} style={{
                              display: "flex", alignItems: "center", gap: 2,
                              color: d.status === "sent" ? CH_COLOR[d.channel] : "var(--rose)",
                            }}>
                              <DIcon size={11} />
                              {d.status === "sent" ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            </span>
                          );
                        })}

                        {/* Contact status */}
                        <span style={{
                          fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                          padding: "2px 8px", borderRadius: 20,
                          background: ct.status === "replied" ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.08)",
                          color: ct.status === "replied" ? "#22c55e" : "var(--text-3)",
                        }}>{ct.status}</span>

                        {ct.status !== "replied" && (
                          <button onClick={() => handleMarkReply(camp._id, ct._id || ct.contactId)}
                            style={{
                              background: "none", border: "1px solid rgba(34,197,94,0.3)",
                              borderRadius: 6, padding: "3px 8px", fontSize: 10,
                              color: "#22c55e", cursor: "pointer",
                            }}>↩ Reply</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>
        );
      })}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
