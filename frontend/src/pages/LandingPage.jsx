import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sun, Moon,
  Users2, Building2, Database, MessageSquare,
  GitBranch, Send, Globe, Brain, BarChart3, Map,
  Zap, Phone, Mail, Search, ChevronDown,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

// ── Current live features ──────────────────────────────────
const FEATURES = [
  {
    n: "01",
    icon: Users2,
    title: "People Database",
    subtitle: "2.4M+ verified contacts",
    p1: "Browse and search the entire final_people dataset — 2.4 million real people records stored in Cloud SQL PostgreSQL. Filter by email availability, phone availability, name, company, or any column in the table.",
    p2: "Three dedicated views: All People, Email (has verified email), and Number (has phone number). Export any filtered slice to CSV with one click. Backed by Redis caching for sub-second page loads.",
  },
  {
    n: "02",
    icon: Building2,
    title: "Companies Database",
    subtitle: "Full firmographic data",
    p1: "The companion to People — the final_companies table stores business-level records including names, industries, locations, website URLs, LinkedIn profiles, and technology signals.",
    p2: "Fully sortable, paginated, and searchable across all columns. Smart cell rendering automatically detects URLs, emails, and phone numbers and renders them as interactive links.",
  },
  {
    n: "03",
    icon: Database,
    title: "In-Build Database",
    subtitle: "742k+ US businesses + AI search",
    p1: "An internal database of 742,000+ indexed US businesses powered by pgvector. Features a Smart Market Map heatmap visualizing business density by state and industry, and an AI Ideal Customer Profiler.",
    p2: "Describe your ideal customer in plain English — GPT-4o extracts a structured filter, runs a cosine similarity search, and explains each match. One-click Campaign Builder packages selected leads directly into your CRM.",
  },
  {
    n: "04",
    icon: Brain,
    title: "AI Chatbot (RAG)",
    subtitle: "Organization-wide knowledge base",
    p1: "Upload PDFs, text files, or any documents to your organization's private knowledge base. The AI chatbot uses Retrieval-Augmented Generation to answer questions with streaming responses via Server-Sent Events.",
    p2: "Each organization has an isolated knowledge space. Powered by OpenAI embeddings + pgvector similarity search. The chatbot cites sources, respects organizational boundaries, and streams answers in real-time.",
  },
  {
    n: "05",
    icon: GitBranch,
    title: "CRM Pipeline",
    subtitle: "Deals · Activities · Invoices",
    p1: "A fully integrated CRM with kanban deal pipeline, contact management, activity tracking, and quotation builder. Drag deals between stages, log calls and meetings, and generate PDF-ready quotations.",
    p2: "Includes an invoicing module with line items, tax calculations, and status tracking. All CRM data is multi-tenant — each organization sees only its own deals and contacts. Tightly integrated with Smart Outreach.",
  },
  {
    n: "06",
    icon: Send,
    title: "Smart Outreach",
    subtitle: "AI-personalized email campaigns",
    p1: "Build targeted email campaigns directly from the database. Select leads, configure follow-up sequences, and launch. The AI reads each prospect's context and generates personalized first-touch emails.",
    p2: "Full campaign management with open/reply tracking, duplicate prevention, and CRM sync. Powered by SMTP integration with configurable sending schedules and smart rate limiting to protect your domain reputation.",
  },
  {
    n: "07",
    icon: Globe,
    title: "Social Media Automation",
    subtitle: "LinkedIn · Instagram · X · Facebook",
    p1: "Generate keyword-driven social media posts with GPT-4o and publish to multiple platforms simultaneously via Unified.to. An email-based approval workflow lets team leads review content before it goes live.",
    p2: "Supports LinkedIn, Instagram, Facebook, and X (Twitter). OAuth connections are managed per-organization. Content generation takes a topic/keywords → draft post → human approval → auto-publish pipeline.",
  },
  {
    n: "08",
    icon: Map,
    title: "Market Intelligence",
    subtitle: "Heatmaps · ICP profiling · Reports",
    p1: "Enter any business category and US state — get back a full market intelligence report: total count, email/phone/website/LinkedIn coverage rates, top cities, revenue ranges, and team size distributions.",
    p2: "Animated coverage rings and bar charts make data immediately scannable. A plain-language AI summary gives you the insight in two sentences. The Smart Map renders state-by-state density without any external map APIs.",
  },
  {
    n: "09",
    icon: Search,
    title: "5-Stage Pipeline Crawler",
    subtitle: "Scrape · Enrich · Score · Outreach · Report",
    p1: "The original Doott engine: a fully automated 5-stage pipeline that scrapes target domains using Playwright, enriches the data via NLP normalization, scores leads against your ICP blueprint, and drafts personalized emails.",
    p2: "Built-in cron scheduler lets you configure each pipeline stage to run independently on any schedule. All results sync to Google Sheets. Built on Node.js with FastAPI-style architecture for horizontal scaling.",
  },
];

const METRICS = [
  { stat: "2.4M+", label: "People Indexed" },
  { stat: "742K+", label: "US Businesses" },
  { stat: "9",     label: "Live Features" },
  { stat: "100%",  label: "Autonomous" },
];

const LOGOS = [
  "OpenAI", "Google Cloud SQL", "PostgreSQL", "pgvector", "Redis",
  "React", "Node.js", "Unified.to", "Google Sheets", "Playwright", "Express", "MongoDB",
];

export default function LandingPage() {
  return (
    <main className="relative z-[2] min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Marquee />
      <BeforeAfter />
      <Features />
      <Metrics />
      <UseCases />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}

/* ── Nav ───────────────────────────────────────────────────── */
function Nav() {
  const { dark, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-serif text-xl tracking-tight">Doott</span>
        </div>
        <nav className="hidden items-center gap-8 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">Features</a>
          <a href="#how" className="transition hover:text-foreground">How it works</a>
          <Link to="/app" className="transition hover:text-foreground">Dashboard</Link>
        </nav>
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex h-9 w-9 items-center justify-center border border-border bg-transparent transition hover:bg-secondary"
            style={{ borderRadius: 6 }}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <Link
            to="/register"
            className="inline-flex h-9 items-center border border-border bg-transparent px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground transition hover:bg-secondary mr-2"
          >
            Sign Up
          </Link>
          <Link
            to="/app"
            className="inline-flex h-9 items-center rounded-none bg-primary px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground transition hover:opacity-90"
          >
            Open App →
          </Link>
        </div>
      </div>
    </header>
  );
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="text-foreground">
      <rect x="0.5" y="0.5" width="21" height="21" rx="3" stroke="currentColor" fill="none" />
      <path d="M5 16 L5 6 L11 12 L17 6 L17 16" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/* ── Hero ──────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 px-6 pt-20 pb-24 md:grid-cols-12 md:pt-28 md:pb-32">
        <div className="md:col-span-8">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="eyebrow mb-6"
          >
            ◆ The Complete AI-Powered Sales & Intelligence Platform
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="display text-[44px] sm:text-[64px] md:text-[80px]"
          >
            Find leads.<br />
            Close deals.<br />
            <em className="italic text-foreground/70">Automatically.</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground"
          >
            Doott is a unified platform combining a 2.4M+ contact database, AI-powered CRM,
            smart email outreach, social media automation, and an RAG chatbot — all in one
            beautifully orchestrated workspace.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link
              to="/register"
              className="inline-flex h-12 items-center px-6 border border-primary bg-primary font-mono text-[11px] uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90"
            >
              Get Started Free →
            </Link>
            <a
              href="#features"
              className="inline-flex h-12 items-center border border-border bg-transparent px-6 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition hover:bg-secondary"
            >
              Explore features
            </a>
          </motion.div>

          {/* Feature pills */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-10 flex flex-wrap gap-2"
          >
            {[
              { icon: Users2,   label: "2.4M People" },
              { icon: Building2,label: "Companies DB" },
              { icon: Brain,    label: "AI Chatbot" },
              { icon: GitBranch,label: "CRM Pipeline" },
              { icon: Send,     label: "Smart Outreach" },
              { icon: Globe,    label: "Social Media" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
              >
                <Icon size={10} />
                {label}
              </span>
            ))}
          </motion.div>

          <div className="mt-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
            9 live systems · Cloud SQL + MongoDB + Redis · Multi-tenant
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Marquee ───────────────────────────────────────────────── */
function Marquee() {
  return (
    <section className="overflow-hidden border-b border-border bg-secondary py-5">
      <div className="flex w-max marquee-track gap-12 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground opacity-60">
        {[...LOGOS, ...LOGOS].map((l, i) => (
          <span key={i} className="flex items-center gap-12">
            {l}
            <span className="opacity-30">/</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/* ── Before / After ────────────────────────────────────────── */
function BeforeAfter() {
  return (
    <section id="how" className="border-b border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-2">
        <div className="border-b border-border p-10 md:border-b-0 md:border-r md:p-14">
          <p className="eyebrow mb-6">Before Doott</p>
          <h3 className="display mb-6 text-3xl md:text-4xl">Scattered tools.<br /> Endless tabs.</h3>
          <ul className="space-y-4 text-muted-foreground">
            {[
              "Separate tools for data, CRM, email, and social",
              "No contact data — buying lists from shady vendors",
              "Generic email templates that get ignored",
              "Manual LinkedIn outreach that takes hours",
              "No visibility into what's working",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 h-px w-4 shrink-0 bg-border" />
                <span className="text-sm md:text-base">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-secondary p-10 md:p-14">
          <p className="eyebrow mb-6">With Doott</p>
          <h3 className="display mb-6 text-3xl md:text-4xl">One platform.<br /> Total control.</h3>
          <ul className="space-y-4 text-foreground">
            {[
              "2.4M+ people + companies in your database instantly",
              "Filter by email or phone — only contact the reachable",
              "AI-personalized outreach emails that convert",
              "CRM pipeline to track every deal from lead to close",
              "Social media posts generated and published automatically",
              "RAG chatbot trained on your organization's knowledge",
              "Market intelligence reports in seconds",
              "All from a single beautiful dashboard",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 h-px w-4 shrink-0 bg-foreground" />
                <span className="text-sm md:text-base">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ── Features (System Deep Dives) ─────────────────────────── */
function Features() {
  return (
    <div id="features" className="bg-background">
      {FEATURES.map((d, i) => (
        <section key={d.n} className={`border-b border-border ${i % 2 !== 0 ? "bg-secondary/30" : ""}`}>
          <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-2">
            {/* Text Side */}
            <div className={`p-10 md:p-20 flex flex-col justify-center ${i % 2 !== 0 ? "md:order-2" : "md:border-r border-border"}`}>
              <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-4">SYSTEM {d.n}</span>
              <h3 className="font-serif text-3xl md:text-4xl leading-tight mb-2 tracking-tight">{d.title}</h3>
              <p className="eyebrow mb-8 text-foreground opacity-60">{d.subtitle}</p>
              <div className="space-y-6 text-muted-foreground text-sm leading-relaxed">
                <p>{d.p1}</p>
                <p>{d.p2}</p>
              </div>
            </div>

            {/* Graphic Side */}
            <div className={`p-10 md:p-20 flex items-center justify-center ${i % 2 !== 0 ? "md:order-1 md:border-r border-border" : ""}`}>
              <div className="w-full max-w-[280px] aspect-square rounded-none border border-border bg-secondary/20 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.04)_1px,transparent_1px)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:16px_16px]" />
                <d.icon size={80} strokeWidth={0.5} className="text-foreground relative z-10" />
                <div className="absolute top-0 left-1/2 w-px h-16 bg-border" />
                <div className="absolute bottom-0 left-1/2 w-px h-16 bg-border" />
                <div className="absolute left-0 top-1/2 w-16 h-px bg-border" />
                <div className="absolute right-0 top-1/2 w-16 h-px bg-border" />
                <div className="absolute top-2 left-2 w-1 h-1 bg-border rounded-full" />
                <div className="absolute top-2 right-2 w-1 h-1 bg-border rounded-full" />
                <div className="absolute bottom-2 left-2 w-1 h-1 bg-border rounded-full" />
                <div className="absolute bottom-2 right-2 w-1 h-1 bg-border rounded-full" />
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Metrics ───────────────────────────────────────────────── */
function Metrics() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-border">
          {METRICS.map((m, i) => (
            <div key={i} className={`flex flex-col items-center justify-center text-center px-4 ${i > 1 ? "pt-12 md:pt-0" : ""}`}>
              <span className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-3">{m.stat}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Use Cases ─────────────────────────────────────────────── */
function UseCases() {
  const cases = [
    {
      title: "Sales Teams",
      desc: "Search 2.4M+ people, filter to those with verified emails, and launch a personalized campaign in minutes. Track every deal in the built-in CRM pipeline. No spreadsheets needed.",
    },
    {
      title: "Marketing Agencies",
      desc: "Generate on-brand social media content for multiple clients simultaneously. Schedule posts across LinkedIn, Instagram, X, and Facebook with a built-in approval workflow.",
    },
    {
      title: "Founders & SDRs",
      desc: "Use the AI Ideal Customer Profiler to define your ICP in plain English. Get back ranked leads with AI explanations for why each one fits. One click to add them to outreach.",
    },
  ];

  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mb-16 text-center md:text-left">
          <p className="eyebrow mb-4 opacity-60">Who uses Doott</p>
          <h2 className="display text-3xl md:text-4xl">Built for people who move fast.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {cases.map((c, i) => (
            <div key={i} className="border border-border bg-background p-10 flex flex-col transition-colors hover:bg-secondary/20">
              <div className="mb-6 h-10 w-10 border border-border flex items-center justify-center font-mono text-[10px] text-muted-foreground tracking-widest">{`0${i + 1}`}</div>
              <h3 className="font-serif text-2xl mb-4 text-foreground">{c.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ───────────────────────────────────────────────────── */
function FAQ() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-4xl px-6 py-24 md:py-32">
        <div className="text-center mb-16">
          <p className="eyebrow mb-4 opacity-60">Common Questions</p>
          <h2 className="display text-3xl md:text-4xl">FAQ.</h2>
        </div>
        <div className="space-y-4">
          {[
            {
              q: "Where does the people and companies data come from?",
              a: "The data is sourced from public web scraping, open datasets, and enrichment pipelines that run continuously. It's stored in Cloud SQL PostgreSQL (Google Cloud) and kept current via automated refresh cycles. You can also upload your own CSVs to supplement it.",
            },
            {
              q: "Is the CRM integrated with the contact database?",
              a: "Yes — deeply. When you select leads from the People or Companies database, you can add them directly to a CRM campaign or create a deal. The Smart Outreach module shares the same contact records with the CRM, so you never duplicate data.",
            },
            {
              q: "How does the AI Chatbot work for my organization?",
              a: "You upload documents (PDFs, text files) to your organization's private knowledge base. The system generates embeddings using OpenAI and stores them in pgvector. When you ask a question, the chatbot retrieves the most relevant chunks and generates an answer that cites its sources. Each organization's data is fully isolated.",
            },
            {
              q: "Can multiple team members use the same account?",
              a: "Yes — Doott is multi-tenant by design. Each organization can have multiple members. Data, CRM records, campaigns, chatbot knowledge bases, and social connections are all scoped to the organization, not the individual user.",
            },
          ].map((faq, i) => (
            <details key={i} className="group border border-border bg-secondary/20 p-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between font-serif text-lg text-foreground">
                <span className="pr-6">{faq.q}</span>
                <span className="shrink-0 transition duration-300 group-open:-rotate-45">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                </span>
              </summary>
              <p className="mt-4 text-muted-foreground leading-relaxed text-sm">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ─────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section className="border-b border-border bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32 flex flex-col items-center text-center">
        <h2 className="font-serif font-bold tracking-tight text-background text-4xl md:text-6xl lg:text-7xl mb-8 max-w-3xl leading-tight">
          Your entire GTM stack.<br />One platform.
        </h2>
        <p className="text-background/70 mb-10 max-w-xl font-serif text-lg">
          People database, companies, CRM, outreach, social media, and AI — all talking to each other.
          Start for free. No credit card required.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            to="/register"
            className="inline-flex h-12 items-center px-10 border border-background bg-background font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition hover:bg-transparent hover:text-background"
          >
            Create Free Account →
          </Link>
          <Link
            to="/login"
            className="inline-flex h-12 items-center px-10 border border-background/40 bg-transparent font-mono text-[11px] uppercase tracking-[0.2em] text-background/80 transition hover:border-background hover:text-background"
          >
            Sign In
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 md:flex-row">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-serif text-lg">Doott</span>
        </div>
        <div className="flex items-center gap-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Link to="/login" className="hover:text-foreground transition">Sign In</Link>
          <Link to="/register" className="hover:text-foreground transition">Register</Link>
          <Link to="/app/docs" className="hover:text-foreground transition">Docs</Link>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          © {new Date().getFullYear()} Doott · All systems operational
        </p>
      </div>
    </footer>
  );
}
