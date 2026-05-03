import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Search, Filter, Mail, Phone, Linkedin,
  CheckSquare, Square, ArrowUpDown, Zap, Globe, MapPin, Database, Sparkles,
} from "lucide-react";
import { fetchContacts } from "../../api/outreach";
import SweepLoader from "../../components/SweepLoader";

const SOURCE_ICONS = {
  website_intel: Globe,
  auto_scraper: Sparkles,
  lead_database: Database,
  places_scraper: MapPin,
  linkedin_finder: Linkedin,
  email_finder: Mail,
  company_intel: Database,
  ai_research: Zap,
};

const TIER_COLORS = {
  hot:  { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", text: "#22c55e" },
  warm: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)", text: "#fbbf24" },
  cold: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", text: "#94a3b8" },
};

export default function ContactPoolTab({ onCreateCampaign }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    setLoading(true);
    fetchContacts()
      .then(d => setContacts(d.contacts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.companyName || "").toLowerCase().includes(q)
      );
    }
    if (sourceFilter !== "all") list = list.filter(c => c.source === sourceFilter);
    if (tierFilter !== "all") list = list.filter(c => c.tier === tierFilter);
    if (hasEmail) list = list.filter(c => c.email);
    if (hasPhone) list = list.filter(c => c.phone);
    list = [...list].sort((a, b) => {
      const av = a[sortBy] || "";
      const bv = b[sortBy] || "";
      if (typeof av === "number") return sortDir === "desc" ? bv - av : av - bv;
      return sortDir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
    return list;
  }, [contacts, search, sourceFilter, tierFilter, hasEmail, hasPhone, sortBy, sortDir]);

  const sources = useMemo(() => [...new Set(contacts.map(c => c.source))], [contacts]);

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c._id)));
  }
  function toggle(id) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }
  function handleSort(field) {
    if (sortBy === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  const selectedContacts = contacts.filter(c => selected.has(c._id));

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
        <SweepLoader width={200} height={4} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Total Contacts", val: contacts.length, color: "var(--accent)" },
          { label: "Hot Leads (7+)", val: contacts.filter(c => c.tier === "hot").length, color: "#22c55e" },
          { label: "With Email", val: contacts.filter(c => c.email).length, color: "#6c63ff" },
          { label: "With Phone", val: contacts.filter(c => c.phone).length, color: "#fbbf24" },
        ].map(s => (
          <div key={s.label} style={{
            flex: "1 1 140px", padding: "14px 18px", borderRadius: 14,
            background: "var(--surface-2)", border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        padding: "12px 16px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)",
      }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input className="input" placeholder="Search name, email, company..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13 }} />
        </div>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{
          background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "7px 12px", color: "var(--text)", fontSize: 12, cursor: "pointer",
        }}>
          <option value="all">All Sources</option>
          {sources.map(s => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</option>)}
        </select>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} style={{
          background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "7px 12px", color: "var(--text)", fontSize: 12, cursor: "pointer",
        }}>
          <option value="all">All Tiers</option>
          <option value="hot">🔥 Hot (7+)</option>
          <option value="warm">⚡ Warm (4-6)</option>
          <option value="cold">❄️ Cold (1-3)</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={hasEmail} onChange={() => setHasEmail(!hasEmail)} /> Has Email
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={hasPhone} onChange={() => setHasPhone(!hasPhone)} /> Has Phone
        </label>
      </div>

      {/* Selected action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 18px", borderRadius: 14,
              background: "linear-gradient(135deg, rgba(108,99,255,0.15), rgba(139,92,246,0.15))",
              border: "1px solid rgba(108,99,255,0.3)",
            }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-2)" }}>
              {selected.size} contact{selected.size > 1 ? "s" : ""} selected
            </span>
            <button onClick={() => onCreateCampaign(selectedContacts)}
              className="btn-primary" style={{ gap: 6, fontSize: 13, padding: "8px 20px" }}>
              <Zap size={14} /> Create Campaign
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "36px 1.5fr 1fr 1.2fr 80px 80px 70px 80px",
          padding: "10px 16px", background: "var(--surface-2)",
          fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          <div style={{ cursor: "pointer" }} onClick={toggleAll}>
            {selected.size === filtered.length && filtered.length > 0
              ? <CheckSquare size={14} style={{ color: "var(--accent)" }} />
              : <Square size={14} />}
          </div>
          <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} onClick={() => handleSort("name")}>
            Name <ArrowUpDown size={10} />
          </div>
          <div>Company</div>
          <div>Email / Phone</div>
          <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} onClick={() => handleSort("score")}>
            Score <ArrowUpDown size={10} />
          </div>
          <div>Tier</div>
          <div>Source</div>
          <div>LinkedIn</div>
        </div>

        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
              No contacts found. Try crawling some websites or running the auto scraper first.
            </div>
          ) : filtered.map((c, i) => {
            const SourceIcon = SOURCE_ICONS[c.source] || Globe;
            const tc = TIER_COLORS[c.tier] || TIER_COLORS.cold;
            return (
              <motion.div key={c._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                onClick={() => toggle(c._id)}
                style={{
                  display: "grid", gridTemplateColumns: "36px 1.5fr 1fr 1.2fr 80px 80px 70px 80px",
                  padding: "10px 16px", cursor: "pointer",
                  background: selected.has(c._id) ? "rgba(108,99,255,0.06)" : i % 2 ? "var(--surface-2)" : "transparent",
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.1s",
                }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {selected.has(c._id)
                    ? <CheckSquare size={14} style={{ color: "var(--accent)" }} />
                    : <Square size={14} style={{ color: "var(--text-3)" }} />}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name || "—"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.companyName || "—"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {c.email && <span style={{ fontSize: 11, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 4 }}><Mail size={10} /> {c.email}</span>}
                  {c.phone && <span style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} /> {c.phone}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{
                    fontSize: 13, fontWeight: 800, color: tc.text,
                    background: tc.bg, border: `1px solid ${tc.border}`,
                    padding: "2px 10px", borderRadius: 20,
                  }}>{c.score}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    color: tc.text, letterSpacing: "0.06em",
                  }}>{c.tier}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }} title={c.sourceLabel}>
                  <SourceIcon size={14} style={{ color: "var(--text-3)" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {c.linkedin ? (
                    <a href={c.linkedin} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ color: "#0a66c2", display: "flex" }}>
                      <Linkedin size={14} />
                    </a>
                  ) : <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right" }}>
        Showing {filtered.length} of {contacts.length} contacts
      </div>

    </div>
  );
}
