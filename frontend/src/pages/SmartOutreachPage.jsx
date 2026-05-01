import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Rocket, BarChart3 } from "lucide-react";
import ContactPoolTab from "./outreach/ContactPoolTab";
import CampaignBuilderTab from "./outreach/CampaignBuilderTab";
import CampaignsDashboardTab from "./outreach/CampaignsDashboardTab";

const TABS = [
  { id: "pool", label: "Contact Pool", icon: Users },
  { id: "campaigns", label: "Campaigns", icon: Rocket },
];

export default function SmartOutreachPage() {
  const [tab, setTab] = useState("pool");
  const [builderContacts, setBuilderContacts] = useState(null);

  function handleCreateCampaign(contacts) {
    setBuilderContacts(contacts);
    setTab("builder");
  }

  function handleCampaignCreated() {
    setBuilderContacts(null);
    setTab("campaigns");
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BarChart3 size={18} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Smart Outreach
          </h1>
        </div>
        <p style={{ color: "var(--text-3)", fontSize: 13, marginLeft: 46 }}>
          Multi-channel AI-powered outreach engine — Email, WhatsApp, SMS
        </p>
      </div>

      {/* Tab bar */}
      {tab !== "builder" && (
        <div style={{
          display: "flex", gap: 4, marginBottom: 20,
          background: "var(--surface-2)", borderRadius: 12,
          padding: 4, border: "1px solid var(--border)", width: "fit-content",
        }}>
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 16px", borderRadius: 9, border: "none",
                  cursor: "pointer", fontSize: 13, fontWeight: 500,
                  background: tab === t.id ? "var(--surface-3)" : "transparent",
                  color: tab === t.id ? "var(--text)" : "var(--text-3)",
                  boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                  transition: "all 0.15s",
                }}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab content */}
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
        {tab === "pool" && <ContactPoolTab onCreateCampaign={handleCreateCampaign} />}
        {tab === "builder" && builderContacts && (
          <CampaignBuilderTab
            contacts={builderContacts}
            onBack={() => { setBuilderContacts(null); setTab("pool"); }}
            onCampaignCreated={handleCampaignCreated}
          />
        )}
        {tab === "campaigns" && <CampaignsDashboardTab />}
      </motion.div>
    </div>
  );
}
