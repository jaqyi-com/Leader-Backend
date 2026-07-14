import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Globe, MapPin, Database, Sparkles, Share2,
  MessageSquare, Mail, Building2, BrainCircuit, ChevronDown,
  ChevronRight, ArrowRight, Info, Search, Filter,
  BarChart2, Settings, Target, Shield, Download, Phone,
  Users2, Bot, Cpu, Map, Layers, FlaskConical, Kanban,
  FileText, Star, Clock, Zap,
} from "lucide-react";

const sections = [
  {
    id: "overview",
    icon: Layers,
    title: "Platform Overview",
    color: "from-violet-500 to-purple-600",
    content: `Doott is an end-to-end B2B intelligence and outreach platform. It helps sales teams, founders, and growth teams discover, enrich, qualify, and reach out to ideal business prospects — all in one unified workspace.

**Core modules at a glance:**
1. **People & Companies** — Browse 43.9M+ people and company records from a live Cloud SQL database
2. **Emails & Numbers** — Auto-filtered subsets showing only contacts with confirmed email or phone
3. **Web Crawler** — Extract intelligence (tech stack, contacts, AI fields) from any list of URLs
4. **Places Scraper** — Discover local businesses near any location using Google Places API
5. **Auto Scraper** — Fully autonomous lead discovery: describe your ICP → AI builds queries → crawls → stores leads
6. **Website Intel** — Central store for all crawled company data
7. **Location IQ** — Heatmap visualisation of People and Companies by geography
8. **Location Analysis** — Deep geographic clustering and density analysis on a live map
9. **Categories** — Browse job roles (People) and industries (Companies) as browsable tag clouds
10. **AI ChatBot (Ask Doott)** — RAG-powered assistant trained on your own uploaded documents
11. **Social Media & Outreach** — AI content generation + multi-platform publishing via Unified.to
12. **CRM Pipeline** — Kanban deal board to track prospects from Lead → Won
13. **Autonomous SDR** — One-on-one AI outreach agent that writes and schedules personalised messages
14. **ICP Config** — Define your Ideal Customer Profile to auto-score every lead (0–100)
15. **Scheduler** — Cron-based recurring pipeline runs with email notifications
16. **Admin Analytics** — Platform-wide usage, traffic, and outreach metrics`,
  },
  {
    id: "people-companies",
    icon: Users2,
    title: "People & Companies Database",
    color: "from-blue-500 to-cyan-500",
    content: `The People and Companies pages give you direct access to Doott's live B2B database — 43.9M+ people records and millions of company entries, all stored in Google Cloud SQL (PostgreSQL) with Redis caching for sub-second queries.

**People table columns:**
full_name, first_name, last_name, job_title, linked_url, location, city, state, pincode, lat, long, geo_source, emails, phones, created_at

**Company table columns:**
name, industry, website, location, employee_count, revenue_range, tech_stack, emails, phones, linkedin_url, and more

**How to use:**
1. Use the full-text **Search** bar to query across all columns simultaneously
2. Apply **Column Filters** to narrow by job title, location, industry, or any field
3. Toggle the **People / Companies** switch to change the active dataset
4. Click **Export CSV** to download the current filtered result set — no row limits
5. Paginate through results with configurable page sizes (10, 25, 50, 100 per page)

**Email & Numbers tabs:**
The Emails tab auto-filters People to only records with a non-empty emails field. The Numbers tab filters to records with a confirmed phone number. No manual filtering needed.`,
  },
  {
    id: "location-iq",
    icon: Map,
    title: "Location IQ",
    color: "from-emerald-500 to-teal-500",
    content: `Location IQ overlays your People and Companies data on an interactive heatmap. It lets you visualise where your prospects are concentrated geographically so you can prioritise regions with the highest lead density.

**How it works:**
1. Select the data layer — People, Companies, or Both
2. The map renders a density heatmap using lat/long coordinates from the database
3. Zoom and pan to explore clusters
4. Click any point to see the underlying records
5. Use radius filters to count records within 1km or 5km of any pin

**Use cases:**
- Identify cities with the most software engineers for targeted outreach
- Find industry clusters for field sales territory planning
- Validate that a geographic market is large enough before entering it`,
  },
  {
    id: "location-analysis",
    icon: MapPin,
    title: "Location Analysis",
    color: "from-sky-500 to-blue-500",
    content: `Location Analysis provides deeper geographic intelligence than the heatmap. It aggregates records by administrative region and surfaces density rankings, job-title distributions, and industry concentrations for any area you select.

**How it works:**
1. Drop a pin or search for a location
2. Set a radius (km)
3. The page queries the live database for all People and Companies within that radius
4. Results are grouped by job title (People) or industry (Companies) with counts and bar charts
5. Switch between People and Companies layers at the top toggle

**Metrics shown:**
- Total record count in radius
- Top 10 job titles / industries by volume
- Density score (records per km²)
- Comparative density vs. national average`,
  },
  {
    id: "crawler",
    icon: Globe,
    title: "Web Crawler",
    color: "from-indigo-500 to-violet-500",
    content: `The Web Crawler visits company websites and extracts structured intelligence — tech stack, contact emails, social links, founder names, pricing models, and any custom AI-defined fields you add.

**How it works:**
1. Paste a list of URLs directly, or upload a CSV file with a \`url\` column
2. Optionally add **Filter Keywords** — only sites mentioning these terms will be processed
3. Add **Dynamic Fields** — custom AI-extracted data points (e.g. "Pricing Model", "Founder Name", "LinkedIn URL")
4. The crawler fetches each page, runs GPT extraction, and stores results in Website Intel

**CSV Format:**
Your CSV must contain a column named \`url\` (lowercase). Additional columns are preserved and merged.
\`\`\`
url,company_name,notes
https://stripe.com,Stripe,fintech leader
https://vercel.com,Vercel,deployment platform
\`\`\`

**Dynamic Fields (AI Extracted):**
These are free-form data points the AI tries to extract from the full page content. The more specific the field name, the higher the extraction accuracy.`,
  },
  {
    id: "places",
    icon: MapPin,
    title: "Places Scraper",
    color: "from-amber-500 to-orange-500",
    content: `The Places Scraper uses the Google Places API to discover local businesses near any location. Ideal for finding brick-and-mortar businesses, service providers, and geo-targeted leads.

**How it works:**
1. Enter a search keyword (e.g. "dental clinics", "coffee shops", "IT consultancies")
2. Set a location (city, address, or lat/long) and radius in km
3. The scraper queries Google Places and returns: business name, address, phone number, rating, website URL, opening hours
4. Results are saved to your Lead Database for scoring and outreach

**Best use cases:**
- Field sales teams building territory-specific lead lists
- Finding physical retail locations for B2B outreach
- Mapping competitors or potential channel partners by geography`,
  },
  {
    id: "auto-scraper",
    icon: Sparkles,
    title: "Auto Scraper",
    color: "from-fuchsia-500 to-pink-500",
    content: `The Auto Scraper is a fully autonomous lead discovery pipeline. You describe your ideal customer in plain English, and the AI handles everything — from query building to crawling to lead storage.

**Pipeline flow:**
AI Analysis → Smart Query Builder → Google Search / Places → Web Crawler → Lead Database

**How it works:**
1. Describe your ICP in plain English (e.g. "Small retail shops still managing customers in Excel")
2. The AI extracts **Industry Keywords** and **Target Personas** from your description
3. Smart search query combinations are built automatically
4. Queries are sent to Google Search (global) or Google Places (local — when you add a location)
5. Discovered URLs are crawled and leads are stored in Website Intel
6. Review all past sessions in the "Past Sessions" panel on the right

**Tips:**
- Be specific: "SaaS companies with fewer than 50 employees in Bangalore" outperforms "software companies"
- Use the **Review & Edit** toggle to fine-tune the AI's extracted profile before running
- Add a location to switch from Google Search to the more precise Google Places API`,
  },
  {
    id: "website-intel",
    icon: Database,
    title: "Website Intel",
    color: "from-teal-500 to-emerald-500",
    content: `Website Intel is the central store for all crawled company data. Every URL processed by the Web Crawler or Auto Scraper is stored here with full enrichment data.

**Data points captured:**
- Company name, description, industry vertical
- Tech stack (frameworks, tools, platforms detected from source code + meta tags)
- Contact emails and phone numbers
- Social media links (LinkedIn, Twitter, Instagram, Facebook)
- Founder and team member names
- Pricing model and subscription tiers
- Any custom Dynamic Fields you defined in the crawler

**Actions you can take:**
- Filter by keyword, tech stack, or domain
- Export selected records to CSV
- Push records to your Lead Database for ICP scoring and outreach
- View the full extraction JSON for any record`,
  },
  {
    id: "categories",
    icon: Filter,
    title: "Categories Explorer",
    color: "from-rose-500 to-pink-500",
    content: `The Categories page lets you explore your database through a tag-cloud of job roles (People mode) and industry tags (Companies mode). It's the fastest way to understand what kinds of people and businesses are in your database before running a campaign.

**How it works:**
1. Toggle between People and Companies at the top
2. Browse the visual grid of categories sorted by record count
3. Search or filter the categories by name
4. Click any category card to open the filtered People or Companies view showing all records with that tag

**Use cases:**
- Quickly find the largest industry segments in your database
- Identify underrepresented niches that could be high-value targets
- Validate ICP assumptions before building outreach sequences`,
  },
  {
    id: "chatbot",
    icon: Bot,
    title: "Ask Doott — AI ChatBot",
    color: "from-violet-500 to-indigo-600",
    content: `Ask Doott is a RAG (Retrieval-Augmented Generation) powered AI assistant. Train it on your own documents and it answers questions with context drawn from your knowledge base — not just generic GPT responses.

**How it works:**
1. Upload documents (PDF, TXT, DOCX) in the **ChatBot Data** section
2. The system chunks, embeds, and indexes your content using OpenAI embeddings stored in pgvector
3. When you ask a question, the AI retrieves the most semantically relevant chunks
4. GPT-4 generates a contextual, cited answer using only your data
5. Responses stream in real-time via Server-Sent Events (SSE)

**Feature: @mention invocations**
Type \`@\` in the chat input to trigger a feature directly from the chat interface. For example, \`@scraper\` launches the Auto Scraper panel inline without leaving the chat.

**Use cases:**
- Train it on product docs to answer sales objections instantly
- Upload competitor research for on-demand intelligence briefings
- Load ICP definitions and have it qualify inbound leads
- Store objection-handling scripts for the sales team

**Organization-wide:**
All uploaded documents are shared across your organization — every team member gets the same enriched knowledge base.`,
  },
  {
    id: "outreach",
    icon: Share2,
    title: "Social Media & Outreach",
    color: "from-rose-500 to-orange-500",
    content: `The Outreach module automates content creation and multi-channel publishing across LinkedIn, Twitter/X, Instagram, and Facebook — powered by OpenAI and Unified.to.

**Social Media Automation:**
1. Choose a topic or keyword for content generation
2. AI generates platform-optimized posts with tone, hashtags, and CTAs
3. Review the drafts and approve via an email link (sent automatically to your inbox)
4. On approval, posts are published to all connected accounts simultaneously via Unified.to

**Smart Outreach (Autonomous SDR):**
The Autonomous SDR page lets you run one-on-one AI-personalized outreach. Define your value proposition and target persona, and the AI:
- Reads each prospect's company data and web presence
- Crafts a unique, personalised first message
- Schedules follow-ups based on non-response signals
- Logs all sent messages and responses in the CRM

**Connected platforms:**
- LinkedIn (via OAuth through Unified.to)
- Twitter / X
- Instagram Business
- Facebook Pages`,
  },
  {
    id: "crm",
    icon: Kanban,
    title: "CRM Pipeline",
    color: "from-amber-500 to-yellow-500",
    content: `The CRM Pipeline gives you a Kanban-style deal board to track prospects through your sales funnel — from initial lead to closed deal.

**Pipeline stages (customisable):**
Lead → Contacted → Qualified → Proposal Sent → Negotiation → Won / Lost

**How it works:**
- Drag and drop deal cards between stages to update status
- Each card shows: company name, deal value, contact name, last activity date
- Click any card to open the full deal detail view
- Add notes, activities (calls, emails, meetings), and attachments to each deal
- Set follow-up reminders with due dates

**Activity feed:**
Every action on a deal is timestamped in an activity log — who did what and when. Full audit trail for team accountability.

**Integrations:**
Leads discovered by the Auto Scraper or Web Crawler can be pushed directly into the CRM pipeline as new deal cards.`,
  },
  {
    id: "pipeline",
    icon: BarChart2,
    title: "Pipeline & Scheduler",
    color: "from-sky-500 to-blue-600",
    content: `The Pipeline page is a real-time monitoring dashboard for all active scraping and crawling jobs. The Scheduler lets you automate recurring runs on a cron schedule.

**Pipeline phases:**
1. **Discovery** — keyword searches and Google Places queries
2. **Crawling** — fetching and parsing website HTML
3. **Extraction** — GPT-powered structured data extraction
4. **Enrichment** — email finding, LinkedIn lookup
5. **Storage** — saving to the database with deduplication

**Dashboard metrics:**
- Live companies scraped, contacts enriched, leads qualified, emails sent
- Per-phase progress bars with counts
- Run history with status and duration

**Scheduler:**
- Set recurring pipeline runs using standard cron syntax (e.g. \`0 8 * * 1\` = every Monday at 8am)
- Notifications sent via email when runs complete, error out, or exceed time limits
- Pause and resume schedules without losing configuration`,
  },
  {
    id: "icp",
    icon: Target,
    title: "ICP Configuration",
    color: "from-violet-600 to-indigo-600",
    content: `The Ideal Customer Profile (ICP) Config page lets you define the exact characteristics of your perfect prospect. This profile drives automatic lead scoring across the entire platform.

**ICP dimensions:**
- **Industry** — target sectors (e.g. SaaS, fintech, healthcare, retail)
- **Company size** — employee count range (e.g. 10–200)
- **Geography** — target regions or countries
- **Tech stack** — must-have or nice-to-have technologies
- **Personas** — decision-maker job titles (e.g. "VP of Sales", "Head of Marketing")
- **Revenue range** — estimated annual revenue bracket
- **Funding stage** — bootstrapped, seed, Series A, Series B+

**Lead Scoring:**
Once configured, every lead in the database receives an automatic score (0–100) based on how closely they match your ICP dimensions. Scores update in real-time as new data is enriched.

**Lead Score views:**
The **Lead Scores** page in the sidebar shows all scored leads ranked from highest to lowest match. Filter by score range, industry, or persona to build prioritised call lists.`,
  },
  {
    id: "settings",
    icon: Shield,
    title: "Settings & Security",
    color: "from-slate-500 to-gray-600",
    content: `The Settings page covers organization management, API key configuration, and member access controls.

**Organization:**
- Rename your organization
- Manage team members — invite new users by email
- Set member roles: Admin or Member
- Admins can view usage analytics and manage API keys

**API Keys & Integrations:**
- **OpenAI API key** — required for AI extraction, ChatBot embeddings, and email generation
- **Google Places API key** — required for Places Scraper and location-based Auto Scraper runs
- **Unified.to token** — required for Social Media publishing to LinkedIn, Twitter, Instagram, Facebook

**Data Management:**
- Export all People, Companies, or Website Intel records to CSV
- Clear scraper session history
- View organization-level storage usage

**Security & Auth:**
- JWT-based authentication with refresh token rotation
- Google OAuth 2.0 SSO support
- Email verification required for new accounts (magic link via SMTP)
- All data is strictly scoped to your organization — zero cross-org data leakage
- Admin Analytics page tracks platform-wide usage, traffic sources, and outreach performance`,
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
      if (line.startsWith("```")) return null;
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
      if (line.startsWith("url,") || line.startsWith("https://")) {
        return (
          <code key={i} className="block px-3 py-1 rounded-lg text-xs font-mono mb-0.5"
            style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}>
            {line}
          </code>
        );
      }
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
        return <code key={i} className="px-1.5 py-0.5 rounded text-xs font-mono"
          style={{ background: "var(--surface-2)", color: "var(--accent)" }}>{part.slice(1, -1)}</code>;
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
            Complete documentation for every Doott module — updated to reflect all current features.
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

      {/* Data Flow Overview */}
      <div className="card p-5">
        <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-3)" }}>
          End-to-End Data Flow
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: "Web Crawler / Auto Scraper / Places", color: "badge-purple" },
            null,
            { label: "Website Intel", color: "badge-teal" },
            null,
            { label: "People & Companies DB", color: "badge-green" },
            null,
            { label: "ICP Scoring", color: "badge-amber" },
            null,
            { label: "Outreach / SDR", color: "badge-rose" },
            null,
            { label: "CRM → Won", color: "badge-purple" },
          ].map((item, i) =>
            item === null ? (
              <ArrowRight key={i} size={13} style={{ color: "var(--text-3)" }} />
            ) : (
              <span key={i} className={`badge ${item.color} text-xs`}>{item.label}</span>
            )
          )}
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-3)" }}>
          Every lead starts as a discovered URL or database record, gets enriched through crawling,
          is scored against your ICP, flows into personalised outreach, and closes in the CRM pipeline.
        </p>
      </div>

      {/* Stats strip */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        {[
          { n: "43.9M+", l: "People records" },
          { n: "Live",    l: "Cloud SQL DB" },
          { n: "15+",     l: "Platform modules" },
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
          This documentation reflects the current version of Doott. The platform is actively developed —
          check back regularly for updates. For live support, use <strong style={{ color: "var(--text)" }}>Ask Doott</strong> — the AI assistant
          trained on your organization's knowledge base — or reach out to your account administrator.
        </p>
      </div>
    </div>
  );
}
