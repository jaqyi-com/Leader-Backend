import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, ChevronDown, ChevronRight, ArrowRight, Info,
  Users2, Bot, Map, MapPin, Filter, Layers,
} from "lucide-react";

const sections = [
  {
    id: "overview",
    icon: Layers,
    title: "Platform Overview",
    color: "from-violet-500 to-purple-600",
    content: `Doott is a B2B intelligence platform that gives you direct access to a live database of 43.9M+ people and companies — with AI-powered tools to search, explore, visualise, and query your data.

**What you can do:**
1. **Companies & People** — Browse and search millions of live records. Filter by any column, export to CSV instantly.
2. **Emails** — Auto-filtered view of People with confirmed email addresses.
3. **Numbers** — Auto-filtered view of People with confirmed phone numbers.
4. **Location IQ** — Visualise where your prospects are on an interactive heatmap.
5. **Location Analysis** — Deep geographic clustering and density analysis on a live map.
6. **Categories** — Explore job roles (People) and industries (Companies) as browsable tag clouds.
7. **Ask Doott** — AI assistant trained on your own uploaded documents. Ask it anything about your data.`,
  },
  {
    id: "people-companies",
    icon: Users2,
    title: "Companies & People",
    color: "from-blue-500 to-cyan-500",
    content: `The Companies and People pages give you direct access to Doott's live B2B database — 43.9M+ people records and millions of company entries, stored in Google Cloud SQL (PostgreSQL) with Redis caching for sub-second queries.

**People table columns:**
full_name, first_name, last_name, job_title, linked_url, location, city, state, pincode, lat, long, geo_source, emails, phones, created_at

**Company table columns:**
name, industry, website, location, employee_count, revenue_range, tech_stack, emails, phones, linkedin_url, and more

**How to use:**
1. Use the full-text **Search** bar to query across all columns simultaneously
2. Apply **Filters** to narrow by job title, location, industry, or any field
3. Toggle the **People / Companies** switch at the top to change the active dataset
4. Click **Export CSV** to download the current filtered result set — no row limits
5. Paginate through results with configurable page sizes (10, 25, 50, 100 per page)

**Emails & Numbers tabs:**
The Emails tab auto-filters People to only records with a confirmed email address. The Numbers tab filters to records with a confirmed phone number. No manual filtering needed — just switch tabs.`,
  },
  {
    id: "location-iq",
    icon: Map,
    title: "Location IQ",
    color: "from-emerald-500 to-teal-500",
    content: `Location IQ overlays your People and Companies data on an interactive heatmap, letting you see exactly where your prospects are concentrated geographically.

**How it works:**
1. Select the data layer — People, Companies, or Both
2. The map renders a live density heatmap using lat/long coordinates from the database
3. Zoom and pan to explore regional clusters
4. Click any point or cluster to see the underlying records
5. Use radius filters to count records within 1 km or 5 km of any dropped pin

**Use cases:**
- Identify cities with the highest concentration of your target job titles
- Find industry clusters for field sales territory planning
- Validate that a geographic market is large enough before entering it`,
  },
  {
    id: "location-analysis",
    icon: MapPin,
    title: "Location Analysis",
    color: "from-sky-500 to-blue-500",
    content: `Location Analysis provides deeper geographic intelligence than the heatmap. It aggregates records by region and surfaces density rankings, job-title distributions, and industry concentrations for any area you choose.

**How it works:**
1. Search for a location or drop a pin on the map
2. Set a radius in km
3. The page queries the live database for all People and Companies within that radius
4. Results are grouped by job title (People) or industry (Companies) with counts and bar charts
5. Use the toggle at the top to switch between People and Companies layers

**Metrics shown:**
- Total record count within the selected radius
- Top job titles / industries by volume
- Density score (records per km²)
- Visual breakdown bar charts per category`,
  },
  {
    id: "categories",
    icon: Filter,
    title: "Categories",
    color: "from-rose-500 to-pink-500",
    content: `The Categories page lets you explore your database through a visual grid of job roles (People mode) and industry tags (Companies mode). It is the fastest way to understand what kinds of people and businesses are in the database before running a campaign.

**How it works:**
1. Toggle between **People** and **Companies** at the top of the page
2. Browse the visual grid of categories, sorted by record count
3. Search or filter categories by name using the search bar
4. Click any category card to open the filtered People or Companies view showing all records with that tag

**Use cases:**
- Quickly find the largest industry segments in your database
- Identify underrepresented niches that could be high-value targets
- Explore which job titles have the most records before deciding who to target`,
  },
  {
    id: "chatbot",
    icon: Bot,
    title: "Ask Doott — AI Assistant",
    color: "from-violet-500 to-indigo-600",
    content: `Ask Doott is a RAG (Retrieval-Augmented Generation) powered AI assistant. It answers questions using context from your own uploaded documents — not just generic AI responses.

**How it works:**
1. Upload documents (PDF, TXT, DOCX) in the ChatBot Data section
2. The system chunks, embeds, and indexes your content using OpenAI embeddings
3. When you ask a question, the AI retrieves the most semantically relevant chunks from your knowledge base
4. GPT-4 generates a contextual, cited answer using only your data
5. Responses stream in real-time via Server-Sent Events (SSE)

**Chat history:**
All your conversations are saved in the panel on the right side of the chat. Click any past conversation to resume it. Start a fresh chat with the **+ New** button.

**Use cases:**
- Ask it questions about your People or Companies data
- Train it on product documentation to answer sales questions instantly
- Upload research reports for on-demand intelligence briefings
- Store ICP definitions and have it help qualify inbound leads

**Organization-wide:**
All uploaded documents are shared across your entire organization — every team member gets the same enriched knowledge base.`,
  },
];

function SectionCard({ section, isOpen, onToggle }) {
  const Icon = section.icon;

  const renderContent = (text) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("**") && line.includes("**", 2)) {
        const match = line.match(/^\*\*(.+?)\*\*(.*)$/);
        if (match) {
          return (
            <p key={i} className="mb-1">
              <strong style={{ color: "var(--text)", fontWeight: 700 }}>{match[1]}</strong>
              <span style={{ color: "var(--text-2)" }}>{match[2]}</span>
            </p>
          );
        }
      }
      if (line.startsWith("- ")) {
        return (
          <li key={i} className="ml-4 mb-0.5" style={{ color: "var(--text-2)", listStyleType: "disc" }}>
            {renderInline(line.slice(2))}
          </li>
        );
      }
      if (line.match(/^\d+\. /)) {
        return (
          <li key={i} className="ml-4 mb-0.5" style={{ color: "var(--text-2)", listStyleType: "decimal" }}>
            {renderInline(line.replace(/^\d+\. /, ""))}
          </li>
        );
      }
      if (line.trim() === "") return <div key={i} className="h-2" />;
      return <p key={i} className="mb-1" style={{ color: "var(--text-2)" }}>{renderInline(line)}</p>;
    });
  };

  const renderInline = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="px-1.5 py-0.5 rounded text-xs font-mono"
            style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <motion.div
      className="card overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-5 text-left transition-all"
        style={{ background: isOpen ? "var(--surface-2)" : "transparent" }}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${section.color}`}>
          <Icon size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base" style={{ color: "var(--text)" }}>{section.title}</h3>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} style={{ color: "var(--text-3)" }} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-5 pb-5 pt-2 space-y-0.5 text-sm leading-relaxed"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              {renderContent(section.content)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function DocumentationPage() {
  const [openSections, setOpenSections] = useState(new Set(["overview"]));

  const toggle = (id) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(sections.map((s) => s.id)));
  const collapseAll = () => setOpenSections(new Set());

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--text)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--accent), #f4576a)" }}>
              <BookOpen size={18} className="text-white" />
            </div>
            How It Works
          </h2>
          <p className="text-sm mt-1.5" style={{ color: "var(--text-3)" }}>
            Learn how every feature of the Doott platform works.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="btn-secondary text-xs px-3 py-1.5 h-auto gap-1.5">
            <ChevronDown size={12} /> Expand All
          </button>
          <button onClick={collapseAll} className="btn-ghost text-xs px-3 py-1.5 h-auto gap-1.5">
            <ChevronRight size={12} /> Collapse All
          </button>
        </div>
      </div>

      {/* Quick Nav */}
      <div className="card p-4">
        <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-3)" }}>
          Jump to Section
        </p>
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setOpenSections((prev) => new Set([...prev, s.id]));
                  setTimeout(() => {
                    document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 100);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text-2)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-2)";
                }}
              >
                <Icon size={11} />
                {s.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats strip */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        {[
          { n: "43.9M+", l: "People records" },
          { n: "Live",    l: "Cloud SQL DB"  },
          { n: "7",       l: "Core modules"  },
          { n: "100%",    l: "CSV exportable" },
        ].map((s, i) => (
          <div key={i}>
            <div className="text-xl font-bold" style={{ color: "var(--text)" }}>{s.n}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-3">
        {sections.map((section) => (
          <div key={section.id} id={`section-${section.id}`}>
            <SectionCard
              section={section}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggle(section.id)}
            />
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="card p-4 flex items-start gap-3">
        <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
        <p className="text-sm" style={{ color: "var(--text-3)" }}>
          For live support, use <strong style={{ color: "var(--text)" }}>Ask Doott</strong> — the AI assistant
          trained on your organization's knowledge base — or reach out to your account administrator.
        </p>
      </div>
    </div>
  );
}
