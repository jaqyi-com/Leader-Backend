import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Globe, MapPin, Database, Sparkles, Share2, Rocket,
  MessageSquare, Users2, Mail, Building2, BrainCircuit, ChevronDown,
  ChevronRight, Zap, ArrowRight, Info, Cpu, Search, FileText,
  BarChart2, Settings, Target, Shield, Clock, CheckCircle2,
} from "lucide-react";

const sections = [
  {
    id: "overview",
    icon: Zap,
    title: "Platform Overview",
    color: "from-violet-500 to-purple-600",
    content: `LeaderAI is an end-to-end B2B lead generation and outreach platform powered by AI. It helps sales teams, founders, and growth hackers discover, enrich, qualify, and reach out to ideal business prospects — all in one unified workspace.

The platform is organized around five core pillars:
1. **Web Crawler** — discovers and extracts intelligence from company websites
2. **Auto Scraper** — autonomously finds companies matching your ICP using Google Search/Places
3. **Lead Generator** — structured LinkedIn, email, and company enrichment tools
4. **Outreach** — social media automation and AI-powered smart outreach
5. **Personal ChatBot** — a RAG-powered AI assistant trained on your own data`,
  },
  {
    id: "crawler",
    icon: Globe,
    title: "Web Crawler",
    color: "from-blue-500 to-cyan-500",
    content: `The Web Crawler is the backbone of the intelligence layer. It visits company websites and extracts structured data including tech stack, contact emails, social links, founder names, pricing models, and any custom fields you define.

**How it works:**
1. You provide a list of URLs (paste directly) or upload a CSV file with a \`url\` column
2. Optionally add **Filter Keywords** — only sites mentioning these terms will be processed
3. Add **Dynamic Fields** — custom AI-extracted data points (e.g. "Pricing Model", "LinkedIn URL", "Founder Name")
4. The crawler fetches each page, runs AI extraction, and stores results in Website Intel

**CSV Format:**
Your CSV file must contain a column named \`url\` (lowercase). Additional columns are preserved and merged into the output. Example:
\`\`\`
url,company_name,notes
https://stripe.com,Stripe,fintech leader
https://vercel.com,Vercel,deployment platform
\`\`\`

**Dynamic Fields (AI Extracted):**
These are custom data points you want the AI to extract from each website. The AI reads the full page content and tries to find or infer each field. For example, adding "Pricing Model" will make the AI look for whether the company charges monthly, annual, per-seat, etc. The richer your field names, the better the extraction quality.`,
  },
  {
    id: "places",
    icon: MapPin,
    title: "Places Scraper",
    color: "from-emerald-500 to-teal-500",
    content: `The Places Scraper uses Google Places API to discover local businesses near any geographic location. Ideal for finding brick-and-mortar businesses, service providers, and location-specific leads.

**How it works:**
1. Enter a search keyword (e.g. "coffee shops", "dental clinics")
2. Set a location and radius in kilometers
3. The scraper queries Google Places and returns business names, addresses, phone numbers, ratings, websites, and hours
4. Results are saved to your Lead Database

**Best use cases:**
- Finding local service businesses in a target city
- Discovering physical retail locations for B2B outreach
- Mapping competitors or potential partners in a geographic area`,
  },
  {
    id: "auto-scraper",
    icon: Sparkles,
    title: "Auto Scraper",
    color: "from-fuchsia-500 to-pink-500",
    content: `The Auto Scraper is a fully autonomous lead discovery pipeline. You describe your ideal customer in plain English, and the AI handles the rest — from query building to crawling to lead storage.

**Pipeline flow:**
AI Analysis → Smart Query Builder → Google Search/Places → Web Crawler → Lead Database

**How it works:**
1. Describe your target in plain English using the AI text box (e.g. "I need small retail shops still managing customers in Excel")
2. The AI analyzes your description and extracts **Industry Keywords** and **Target Personas**
3. Smart query combinations are built and sent to Google Search or Google Places
4. Discovered URLs are automatically crawled and leads are stored
5. You can review all past sessions in the "Past Sessions" panel

**Tips:**
- Be specific in your description for better AI extraction
- Use the "Review & Edit" toggle to fine-tune the extracted profile
- Add a location to switch from Google Search to the more precise Google Places API`,
  },
  {
    id: "website-intel",
    icon: Database,
    title: "Website Intel",
    color: "from-indigo-500 to-violet-500",
    content: `Website Intel is the central data store for all crawled company information. Every website that passes through the Web Crawler or Auto Scraper pipeline is stored here with full enrichment data.

**Data points captured:**
- Company name, description, industry
- Tech stack (frameworks, tools, platforms detected)
- Contact emails and phone numbers
- Social media links (LinkedIn, Twitter, Instagram, Facebook)
- Founder/team member names
- Pricing model and subscription tiers
- Any custom Dynamic Fields you defined

**How to use it:**
- Filter by keyword, tech stack, or domain
- Export selected records to CSV
- Push records to your Lead Database for scoring and outreach`,
  },
  {
    id: "lead-generator",
    icon: Target,
    title: "Lead Generator Module",
    color: "from-amber-500 to-orange-500",
    content: `The Lead Generator module provides structured enrichment tools for finding decision-makers and validating contact data.

**Sub-modules:**

**Lead Database** — Central CRM-like table of all your leads. Add leads manually, import from Website Intel, or auto-populate from scraper sessions. Track status (new, contacted, qualified, converted).

**LinkedIn Finder** — Search for professionals by name, company, or role. Returns LinkedIn profile URLs, job titles, and company information. Uses AI to infer profile data from public signals.

**Email Finder** — Find verified business emails for any domain. Uses pattern detection + validation to surface deliverable email addresses.

**Company Intel** — Deep-dive enrichment for any company domain. Returns funding stage, employee count, headquarters, tech stack, recent news, and key contacts.

**AI Research Agent** — An autonomous agent that takes a list of companies or domains and runs a full research pipeline: Google search → website crawl → LinkedIn lookup → email discovery → AI summary. Returns a ready-to-use prospect card for each company.`,
  },
  {
    id: "outreach",
    icon: Share2,
    title: "Social Media & Outreach",
    color: "from-rose-500 to-pink-500",
    content: `The Outreach module automates content creation and multi-channel publishing across LinkedIn, Twitter/X, Instagram, and Facebook.

**Social Media Automation:**
1. Choose a topic or keyword
2. AI generates platform-optimized posts with tone, hashtags, and CTAs
3. Review and approve via email (an approval link is sent to you)
4. On approval, posts are published to all connected accounts via Unified.to

**Smart Outreach:**
AI-powered personalized outreach sequences. Define your value proposition and target persona, and the AI crafts individualized messages for each prospect based on their company data and web presence.

**Connected platforms:**
- LinkedIn (via OAuth)
- Twitter/X
- Instagram
- Facebook Pages`,
  },
  {
    id: "chatbot",
    icon: MessageSquare,
    title: "Personal ChatBot",
    color: "from-teal-500 to-emerald-500",
    content: `The Personal ChatBot is a RAG (Retrieval-Augmented Generation) powered AI assistant that you can train on your own knowledge base.

**How it works:**
1. Upload documents (PDF, TXT, DOCX) in the ChatBot Data section
2. The system chunks, embeds, and indexes your content using OpenAI embeddings
3. When you ask a question, the AI retrieves the most relevant chunks and generates a contextual answer
4. Responses are streamed in real-time via Server-Sent Events (SSE)

**Use cases:**
- Train it on your product documentation to answer sales questions instantly
- Upload competitor research for on-demand intelligence
- Load ICP definitions and have it qualify inbound leads for you
- Store objection-handling scripts and coaching materials

**Organization-wide:**
All uploaded documents are shared across your organization — every team member gets the same enriched knowledge base.`,
  },
  {
    id: "pipeline",
    icon: BarChart2,
    title: "Pipeline & Scheduler",
    color: "from-sky-500 to-blue-500",
    content: `The Pipeline view gives you a real-time monitoring dashboard for all active scraping and crawling jobs.

**Pipeline phases:**
1. **Discovery** — keyword searches, Google Places queries
2. **Crawling** — fetching and parsing website HTML
3. **Extraction** — AI-powered data extraction
4. **Enrichment** — email finding, LinkedIn lookup
5. **Storage** — saving to database with deduplication

**Scheduler:**
Set up recurring pipeline runs on a cron schedule. For example, run the Auto Scraper every Monday at 8am to discover fresh leads for the week. Notifications are sent via email when runs complete or fail.`,
  },
  {
    id: "icp",
    icon: Settings,
    title: "ICP Configuration",
    color: "from-violet-600 to-indigo-600",
    content: `The Ideal Customer Profile (ICP) configuration page lets you define the characteristics of your perfect prospect. This profile is used across the platform to filter, score, and prioritize leads.

**ICP dimensions:**
- **Industry** — target sectors (e.g. SaaS, fintech, healthcare)
- **Company size** — employee count range
- **Geography** — target regions or countries
- **Tech stack** — technologies the company must use
- **Personas** — job titles of decision makers to target
- **Revenue range** — estimated annual revenue bracket
- **Funding stage** — bootstrapped, seed, Series A, etc.

**Lead Scoring:**
Once configured, every lead in the database is automatically scored (0–100) based on how closely they match your ICP. Higher scores indicate warmer prospects.`,
  },
  {
    id: "settings",
    icon: Shield,
    title: "Settings & Security",
    color: "from-slate-500 to-gray-600",
    content: `The Settings page covers organization management, API key configuration, and member access controls.

**Organization:**
- Rename your organization
- Manage team members and invite new users
- Set member roles (Admin, Member)

**API Keys & Integrations:**
- OpenAI API key — required for AI extraction, chatbot, and email generation
- Google Places API key — required for Places Scraper and location-based Auto Scraper
- Unified.to token — required for Social Media publishing

**Data Management:**
- Export all leads or website intel to CSV
- Clear session history
- View storage usage

**Security:**
- JWT-based authentication with refresh tokens
- Google OAuth support
- Email verification required for new accounts
- All data is scoped to your organization — no cross-org data leakage`,
  },
];

function SectionCard({ section, isOpen, onToggle }) {
  const Icon = section.icon;

  // Parse simple markdown-like syntax for bold and code
  const renderContent = (text) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("**") && line.includes("**", 2)) {
        // Bold section headers (lines that are entirely bold)
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
      // Code line
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
              style={{ background: "linear-gradient(135deg, var(--accent), #8b5cf6)" }}>
              <BookOpen size={18} className="text-white" />
            </div>
            How It Works
          </h2>
          <p className="text-sm mt-1.5" style={{ color: "var(--text-3)" }}>
            Complete documentation for the LeaderAI platform — learn how every module works.
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

      {/* Pipeline Visual */}
      <div className="card p-5">
        <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-3)" }}>
          Data Flow Overview
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: "Web Crawler / Auto Scraper", color: "badge-purple" },
            null,
            { label: "Website Intel", color: "badge-teal" },
            null,
            { label: "Lead Database", color: "badge-green" },
            null,
            { label: "Outreach", color: "badge-amber" },
            null,
            { label: "Conversion", color: "badge-rose" },
          ].map((item, i) =>
            item === null ? (
              <ArrowRight key={i} size={13} style={{ color: "var(--text-3)" }} />
            ) : (
              <span key={i} className={`badge ${item.color} text-xs`}>{item.label}</span>
            )
          )}
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-3)" }}>
          Every lead starts as a discovered URL, gets enriched through crawling, is scored against your ICP,
          and flows into your outreach pipeline automatically.
        </p>
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
          This documentation reflects the current version of the platform. Features are actively developed —
          check back regularly for updates. For support, use the Personal ChatBot trained on your organization's data,
          or reach out to your account administrator.
        </p>
      </div>
    </div>
  );
}
