import { useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Mail, MessageSquare, Smartphone, Zap, Sparkles, X, Check, ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { personalizeBatch, createCampaign } from "../../api/outreach";

const CHANNELS = [
  { id: "email", label: "Email", icon: Mail, color: "#6c63ff" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "#25d366" },
  { id: "sms", label: "SMS", icon: Smartphone, color: "#fbbf24" },
];

const DEFAULT_SEQUENCE = [
  { day: 0, channel: "email", label: "Initial Email" },
  { day: 3, channel: "whatsapp", label: "WhatsApp Follow-up" },
  { day: 7, channel: "sms", label: "SMS Nudge" },
];

export default function CampaignBuilderTab({ contacts, onBack, onCampaignCreated }) {
  const [name, setName] = useState(`Campaign — ${new Date().toLocaleDateString()}`);
  const [channels, setChannels] = useState(new Set(["email"]));
  const [sequence, setSequence] = useState(DEFAULT_SEQUENCE);
  const [personalizations, setPersonalizations] = useState({});
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1); // 1=config, 2=preview

  function toggleChannel(ch) {
    const s = new Set(channels);
    if (s.has(ch)) { if (s.size > 1) s.delete(ch); }
    else s.add(ch);
    setChannels(s);
    setSequence(DEFAULT_SEQUENCE.filter(sq => s.has(sq.channel)));
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { personalizations: results } = await personalizeBatch(contacts, {});
      const map = {};
      results.forEach(p => { map[p.contactId] = p; });
      setPersonalizations(map);
      setStep(2);
      toast.success(`Generated ${results.length} personalizations!`);
    } catch (err) {
      toast.error(err.message || "Personalization failed");
    }
    setGenerating(false);
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const enriched = contacts.map(c => ({
        ...c,
        icebreaker: personalizations[c._id]?.icebreaker || "",
        subject: personalizations[c._id]?.subject || "",
        emailBody: personalizations[c._id]?.emailBody || "",
        whatsappMessage: personalizations[c._id]?.whatsappMessage || "",
      }));
      await createCampaign({
        name,
        channels: [...channels],
        sequence: sequence.filter(s => channels.has(s.channel)),
        contacts: enriched,
      });
      toast.success("Campaign created!");
      onCampaignCreated();
    } catch (err) {
      toast.error(err.message || "Failed to create campaign");
    }
    setCreating(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{
          background: "none", border: "1px solid var(--border)", borderRadius: 8,
          padding: "6px 14px", color: "var(--text-2)", fontSize: 12, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}><X size={12} /> Back to Contacts</button>
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>
          {contacts.length} contact{contacts.length > 1 ? "s" : ""} selected
        </span>
      </div>

      {step === 1 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Campaign name */}
          <div className="card" style={{ padding: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", marginBottom: 6, display: "block" }}>
              Campaign Name
            </label>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder="My Outreach Campaign" style={{ fontSize: 14 }} />
          </div>

          {/* Channels */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 14 }}>
              Channels
            </h3>
            <div style={{ display: "flex", gap: 10 }}>
              {CHANNELS.map(ch => {
                const active = channels.has(ch.id);
                const Icon = ch.icon;
                return (
                  <button key={ch.id} onClick={() => toggleChannel(ch.id)}
                    style={{
                      flex: 1, padding: "16px 14px", borderRadius: 14,
                      background: active ? `${ch.color}15` : "var(--surface-2)",
                      border: `2px solid ${active ? ch.color : "var(--border)"}`,
                      cursor: "pointer", display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 8, transition: "all 0.15s",
                    }}>
                    <Icon size={22} style={{ color: active ? ch.color : "var(--text-3)" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: active ? ch.color : "var(--text-3)" }}>
                      {ch.label}
                    </span>
                    {active && <Check size={14} style={{ color: ch.color }} />}
                  </button>
                );
              })}
            </div>
            {(channels.has("whatsapp") || channels.has("sms")) && !process.env.TWILIO_ACCOUNT_SID && (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 10,
                background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
                fontSize: 12, color: "#fbbf24",
              }}>
                ⚠️ WhatsApp/SMS requires Twilio credentials. Add TWILIO_ACCOUNT_SID to your .env file.
              </div>
            )}
          </div>

          {/* Sequence */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 14 }}>
              Drip Sequence
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sequence.filter(s => channels.has(s.channel)).map((s, i) => {
                const ch = CHANNELS.find(c => c.id === s.channel);
                const Icon = ch?.icon || Mail;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 12,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: `${ch?.color || "#6c63ff"}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={16} style={{ color: ch?.color || "var(--accent)" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {s.day === 0 ? "Immediately" : `Day ${s.day} after launch`}
                        {s.day > 0 && " • Only if no reply"}
                      </div>
                    </div>
                    {i < sequence.filter(sq => channels.has(sq.channel)).length - 1 && (
                      <ChevronRight size={14} style={{ color: "var(--text-3)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generate button */}
          <button onClick={handleGenerate} disabled={generating}
            className="btn-primary" style={{ padding: "14px 28px", fontSize: 14, gap: 8, alignSelf: "center" }}>
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? "Generating AI Personalizations..." : "Generate Personalizations & Preview"}
          </button>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              <Sparkles size={14} style={{ color: "var(--accent)", marginRight: 6 }} />
              AI-Generated Previews
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>
              Review the personalized messages below. Launch when ready.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 400, overflowY: "auto" }}>
            {contacts.map(c => {
              const p = personalizations[c._id] || {};
              return (
                <div key={c._id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 12, fontWeight: 700,
                    }}>{(c.name || "?")[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>{c.companyName} • {c.email}</div>
                    </div>
                  </div>
                  {p.icebreaker && (
                    <div style={{
                      fontSize: 12, color: "var(--accent-2)", fontStyle: "italic",
                      padding: "8px 12px", borderRadius: 8, marginBottom: 8,
                      background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)",
                    }}>💡 {p.icebreaker}</div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 2 }}>
                    Subject: {p.subject || "—"}
                  </div>
                  <div style={{
                    fontSize: 12, color: "var(--text-3)", lineHeight: 1.5,
                    whiteSpace: "pre-wrap", maxHeight: 100, overflow: "auto",
                  }}>{p.emailBody || "—"}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => setStep(1)} style={{
              background: "var(--surface-3)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "12px 24px", color: "var(--text-2)",
              fontSize: 13, cursor: "pointer",
            }}>← Back to Settings</button>
            <button onClick={handleCreate} disabled={creating}
              className="btn-primary" style={{ padding: "12px 28px", fontSize: 14, gap: 8 }}>
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {creating ? "Creating..." : "Create Campaign"}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
