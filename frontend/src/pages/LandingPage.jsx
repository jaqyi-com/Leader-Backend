import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Network, Database, Target, Bot, RotateCcw } from "lucide-react";

const agents = [
  {
    n: "01",
    name: "Extraction",
    desc: "Scrapes infinite domains, unearthing deeply hidden technical capabilities and staff sizes.",
    tools: ["webCrawler", "placesAPI", "semanticSearch", "techMatcher"],
  },
  {
    n: "02",
    name: "Enrichment",
    desc: "Cross-references data. Identifies key decision makers. Cleans unformatted data streams.",
    tools: ["dataNormalizer", "roleIdentifier", "contactFinder"],
  },
  {
    n: "03",
    name: "ICP Scoring",
    desc: "Grades every lead against your custom Ideal Customer Profile blueprint.",
    tools: ["scoreGenerator", "intentDetector", "budgetAnalyzer"],
  },
  {
    n: "04",
    name: "Autonomous SDR",
    desc: "Builds a deep dossier and writes hyper-personalized first touches for top-tier leads.",
    tools: ["dossierBuilder", "emailDrafter", "signalDetector"],
  },
  {
    n: "05",
    name: "Pipeline Ops",
    desc: "Runs continuously 24/7. Auto-syncs everything direct to your Google Sheets.",
    tools: ["cronDeployer", "sheetsSync", "errorHandler"],
  },
];

const logos = [
  "Google Maps", "OpenAI", "Playwright", "Node.js", "FastAPI", "React",
  "Google Sheets", "Vite", "Express", "Vercel", "Tailwind", "Python",
];

export default function LandingPage() {
  return (
    <main className="relative z-[2] min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Marquee />
      <BeforeAfter />
      <SystemDeepDives />
      <Metrics />
      <UseCases />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-serif text-xl tracking-tight">Leader</span>
        </div>
        <nav className="hidden items-center gap-8 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:flex">
          <a href="#how" className="transition hover:text-foreground">How it works</a>
          <a href="#agents" className="transition hover:text-foreground">Agents</a>
          <Link to="/app" className="transition hover:text-foreground">Sign in</Link>
        </nav>
        <Link
          to="/app"
          className="inline-flex h-9 items-center rounded-none bg-primary px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground transition hover:opacity-90"
        >
          Open App →
        </Link>
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
            ◆ Issue №01 — The Autonomous Data Workforce
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="display text-[44px] sm:text-[64px] md:text-[84px]"
          >
            The first AI <br />
            that doesn't just <em className="italic text-foreground/80">find</em> leads.
            <br />
            It <span className="italic">closes</span> them.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground"
          >
            Leader explores infinite web surfaces, normalizes complex data, runs the outreach,
            and handles your entire top-of-funnel operations automatically. You wake up.
            The pipeline is full. You didn't touch anything.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link
              to="/app"
              className="inline-flex h-12 items-center px-6 border border-primary bg-primary font-mono text-[11px] uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90"
            >
              Access Dashboard →
            </Link>
            <a
              href="#how"
              className="inline-flex h-12 items-center border border-border bg-transparent px-6 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition hover:bg-secondary"
            >
              See the pipeline
            </a>
          </motion.div>

          <div className="mt-10 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
            Core systems active · Auto-sync enabled
          </div>
        </div>
      </div>
    </section>
  );
}

function Marquee() {
  return (
    <section className="overflow-hidden border-b border-border bg-secondary py-5">
      <div className="flex w-max marquee-track gap-12 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground opacity-60">
        {[...logos, ...logos].map((l, i) => (
          <span key={i} className="flex items-center gap-12">
            {l}
            <span className="opacity-30">/</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function BeforeAfter() {
  return (
    <section id="how" className="border-b border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-2">
        <div className="border-b border-border p-10 md:border-b-0 md:border-r md:p-14">
          <p className="eyebrow mb-6">Before Leader</p>
          <h3 className="display mb-6 text-3xl md:text-4xl">A list of names. <br /> A wall of work.</h3>
          <ul className="space-y-4 text-muted-foreground">
            {[
              "Hours of manual research per lead",
              "Generic tools that cap out at 100 searches",
              "Siloed spreadsheets that drift out of sync",
              "You miss the buying window",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 h-px w-4 shrink-0 bg-border" />
                <span className="text-sm md:text-base">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-secondary p-10 md:p-14">
          <p className="eyebrow mb-6">With Leader</p>
          <h3 className="display mb-6 text-3xl md:text-4xl">Total market. <br /> Perfect clarity.</h3>
          <ul className="space-y-4 text-foreground">
            {[
              "Deep scraping across infinite web endpoints",
              "Ideal Customer Profile intelligence grading",
              "Continuous Google Sheets synchronization 24/7",
              "Autonomous outreach to top-tier verified leads",
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

function Pipeline() {
  return (
    <section id="agents" className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mb-16 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow mb-4">The Pipeline</p>
            <h2 className="display max-w-2xl text-4xl md:text-6xl">
              Five systems.<br />One engine.
            </h2>
          </div>
          <p className="max-w-sm text-muted-foreground">
            Each stage is an isolated agent — with its own tools, memory, and 
            execution protocols. They pass data forward with relentless precision.
          </p>
        </div>

        <div className="border-t border-border">
          {agents.map((a) => (
            <article
              key={a.n}
              className="group grid grid-cols-1 gap-6 border-b border-border py-10 md:grid-cols-12 md:gap-10"
            >
              <div className="md:col-span-2">
                <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
                  {a.n}
                </span>
              </div>
              <div className="md:col-span-5">
                <h3 className="font-serif text-3xl tracking-tight md:text-4xl">{a.name}</h3>
              </div>
              <div className="md:col-span-5">
                <p className="text-foreground tracking-wide">{a.desc}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {a.tools.map((t) => (
                    <span
                      key={t}
                      className="rounded-none border border-border px-3 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const deepDives = [
  {
    n: "01",
    title: "Extraction via Headless Subsystems",
    subtitle: "The raw ingest",
    p1: "Using Playwright nodes and distributed proxies, the engine searches deeply within targeted domains. It extracts hidden DOM nodes, intercepts network requests, and scrapes localized mapping data.",
    p2: "Unlike standard scrapers that hit bot protections, the Extraction phase simulates human browsing to bypass modern WAFs and unearth technical constraints, installed tech stacks, and team sizes.",
    p2: "Unlike standard scrapers that hit bot protections, the Extraction phase simulates human browsing to bypass modern WAFs and unearth technical constraints, installed tech stacks, and team sizes.",
    icon: Network
  },
  {
    n: "02",
    title: "NLP Enrichment & Normalization",
    subtitle: "Contextualizing the noise",
    p1: "Raw HTML and unstructured text are meaningless without context. The Enrichment module cross-references scraped names against role matrices to determine precise decision-making hierarchies within the target.",
    p2: "All findings are funneled through a classification pipeline which normalizes the output into pure JSON structures, scrubbing invalid contact information and formatting names flawlessly for standard outreach.",
    p2: "All findings are funneled through a classification pipeline which normalizes the output into pure JSON structures, scrubbing invalid contact information and formatting names flawlessly for standard outreach.",
    icon: Database
  },
  {
    n: "03",
    title: "Dynamic ICP Scoring Framework",
    subtitle: "Mathematical qualification",
    p1: "Stop guessing which leads are worth your time. The engine automatically evaluates every normalized entity against a dynamic Ideal Customer Profile (ICP) blueprint that you define.",
    p2: "It assigns a composite score between 0 to 100 based on firmographic fit, technical compatibility, and budget signals. Low-scoring leads are actively suppressed from the outreach queue.",
    p2: "It assigns a composite score between 0 to 100 based on firmographic fit, technical compatibility, and budget signals. Low-scoring leads are actively suppressed from the outreach queue.",
    icon: Target
  },
  {
    n: "04",
    title: "Autonomous SDR & Generation",
    subtitle: "The human element",
    p1: "For every highly qualified target, a localized sub-agent spins up to construct a comprehensive intelligence dossier containing recent company news, pain points, and personalized conversation starters.",
    p2: "It seamlessly drafts an individualized first-touch email using this dossier. By eliminating generic templates, the SDR engine secures engagement rates drastically higher than standard automation.",
    p2: "It seamlessly drafts an individualized first-touch email using this dossier. By eliminating generic templates, the SDR engine secures engagement rates drastically higher than standard automation.",
    icon: Bot
  },
  {
    n: "05",
    title: "24/7 Pipeline Operations",
    subtitle: "Relentless execution",
    p1: "Leader is designed to run asynchronously in the background. Built on Node.js crons and FastAPI scaling, the entire pipeline processes thousands of records autonomously without human intervention.",
    p2: "Every generated metric, drafted email, and scraped domain is continuously synchronized back to structured Google Sheets, providing absolute transparency into the engine's real-time internal state.",
    p2: "Every generated metric, drafted email, and scraped domain is continuously synchronized back to structured Google Sheets, providing absolute transparency into the engine's real-time internal state.",
    icon: RotateCcw
  }
];

function SystemDeepDives() {
  return (
    <div className="bg-background">
      {deepDives.map((d, i) => (
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
              <div className="w-full max-w-[280px] aspect-square rounded-none border border-border bg-secondary/20 flex flex-col items-center justify-center relative overflow-hidden group-hover:bg-secondary/50 transition-colors duration-500">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.04)_1px,transparent_1px)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:16px_16px]"></div>
                <d.icon size={80} strokeWidth={0.5} className="text-foreground relative z-10" />
                
                {/* Abstract decorative lines */}
                <div className="absolute top-0 left-1/2 w-px h-16 bg-border"></div>
                <div className="absolute bottom-0 left-1/2 w-px h-16 bg-border"></div>
                <div className="absolute left-0 top-1/2 w-16 h-px bg-border"></div>
                <div className="absolute right-0 top-1/2 w-16 h-px bg-border"></div>
                
                {/* Corner dots */}
                <div className="absolute top-2 left-2 w-1 h-1 bg-border rounded-full"></div>
                <div className="absolute top-2 right-2 w-1 h-1 bg-border rounded-full"></div>
                <div className="absolute bottom-2 left-2 w-1 h-1 bg-border rounded-full"></div>
                <div className="absolute bottom-2 right-2 w-1 h-1 bg-border rounded-full"></div>
              </div>
            </div>

          </div>
        </section>
      ))}
    </div>
  );
}

function Metrics() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-border">
          {[
            { stat: "2.4M+", label: "Entities Indexed" },
            { stat: "99.8%", label: "Data Accuracy" },
            { stat: "0.8s", label: "Query Latency" },
            { stat: "100%", label: "Autonomous" },
          ].map((m, i) => (
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

function UseCases() {
  const cases = [
    {
      title: "Agency Recruiters",
      desc: "Stop hunting for hidden contact info. Let Leader automatically map out the engineering org chart of every startup that just raised a Series A.",
    },
    {
      title: "Software Sales",
      desc: "Instantly know when a company installs a competitor's SDK. Leader crawls public repositories and DOMs to find exact capability signals.",
    },
    {
      title: "M&A Intelligence",
      desc: "Build massive market landscapes overnight. Leader scrapes and categorizes thousands of small businesses, finding exact employee headcounts and mapping localized data.",
    }
  ];

  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mb-16 text-center md:text-left">
          <p className="eyebrow mb-4 opacity-60">Deployment Architecture</p>
          <h2 className="display text-3xl md:text-4xl">Built for scale.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {cases.map((c, i) => (
            <div key={i} className="border border-border bg-background p-10 flex flex-col transition-colors hover:bg-secondary/20">
              <div className="mb-6 h-10 w-10 border border-border flex items-center justify-center font-mono text-[10px] text-muted-foreground tracking-widest">{`0${i+1}`}</div>
              <h3 className="font-serif text-2xl mb-4 text-foreground">{c.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-4xl px-6 py-24 md:py-32">
        <div className="text-center mb-16">
          <p className="eyebrow mb-4 opacity-60">Technical Documentation</p>
          <h2 className="display text-3xl md:text-4xl">System Architecture & FAQ.</h2>
        </div>
        
        <div className="space-y-4">
          {[
            {
              q: "How does the extraction bypass standard Web Application Firewalls (WAF)?",
              a: "Leader doesn't use standard GET requests for heavy collection. We orchestrate clusters of headless Chromium instances routed through localized residential proxies, fully mirroring organic user interactions spanning mouse jitters to dynamic scroll events."
            },
            {
              q: "Is the data synchronized locally or to a cloud provider?",
              a: "Both. The initial extraction passes through our persistent Node microservices for NLP normalization. Once a lead is structured and scored against your ICP, it is actively synchronized directly to your connected Google Sheets via secure service accounts."
            },
            {
              q: "Can the AI SDR write emails that don't sound robotic?",
              a: "Yes. The AI does not use rigid templates. It aggregates the prospect's recent news, technical stack, and direct pain points to construct a highly personalized paragraph hook. It writes with strict grammatical constraints, explicitly avoiding overused sales buzzwords."
            }
          ].map((faq, i) => (
            <details key={i} className="group border border-border bg-secondary/20 p-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between font-serif text-lg text-foreground">
                <span className="pr-6">{faq.q}</span>
                <span className="shrink-0 transition duration-300 group-open:-rotate-45">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                </span>
              </summary>
              <p className="mt-4 text-muted-foreground leading-relaxed text-sm">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="border-b border-border bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32 flex flex-col items-center text-center">
        <h2 className="font-serif font-bold tracking-tight text-background text-4xl md:text-6xl lg:text-7xl mb-8 max-w-3xl leading-tight">
          Stop digging for leads.<br/>Start closing them.
        </h2>
        <p className="text-background/70 mb-10 max-w-xl font-serif text-lg">
          Deploy the autonomous data workforce configured entirely for your exact pipeline needs.
        </p>
        <Link
          to="/app"
          className="inline-flex h-12 items-center px-10 border border-background bg-background font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition hover:bg-transparent hover:text-background"
        >
          Initialize Pipeline →
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 md:flex-row">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-serif text-lg">Leader</span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          © {new Date().getFullYear()} · The Autonomous Pipeline
        </p>
      </div>
    </footer>
  );
}
