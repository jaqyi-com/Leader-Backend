import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sun, Moon,
  Users2, Building2, Mail, Phone,
  Database, Search, Download, Filter,
  CheckCircle, Zap, Globe,
  Compass,
  Sparkles, ArrowRight, } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { MCP_URL, EXAMPLE_PROMPTS } from "../claudeConnector";
import CATEGORIES_DATA from "../categories.json";
import { PEOPLE_ROLE_GROUPS, COMPANY_INDUSTRY_GROUPS } from "../categoryGroups";
import doottLogo from "../assets/doott-logo.png";
import { COVERED_COUNTRIES } from "../countries";

const LOGOS = [
  "Google Cloud SQL", "PostgreSQL", "Redis", "React",
  "Node.js", "OpenAI", "PostgreSQL", "Vercel", "Express",
];

export default function LandingPage() {
  return (
    <main
      className="relative z-[2] min-h-screen bg-background text-foreground"
      itemScope
      itemType="https://schema.org/SoftwareApplication"
    >
      <meta itemProp="name" content="Doott" />
      <meta itemProp="applicationCategory" content="BusinessApplication" />
      <Nav />
      <Hero />
      <Marquee />
      <DatabaseShowcase />
      <CategoriesShowcase />
      <Features />
      <ClaudeSection />
      <Metrics />
      <UseCases />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}

/* ── Nav ───────────────────────────────────────────────────── */
export function Nav() {
  const { dark, toggle } = useTheme();
  return (
    <header
      className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur"
      role="banner"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-serif text-xl tracking-tight" aria-label="Doott — B2B Lead Generation Platform">Doott</span>
        </div>
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-8 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:flex"
        >
          <a href="/#database" className="transition hover:text-foreground">Database</a>
          <a href="/#categories" className="transition hover:text-foreground">Categories</a>
          <a href="/#features" className="transition hover:text-foreground">Features</a>
          <a href="/#faq" className="transition hover:text-foreground">FAQ</a>
          <Link to="/claude" className="transition hover:text-foreground">Claude</Link>
          <Link to="/pricing" className="transition hover:text-foreground text-primary font-semibold">Pricing</Link>
          <Link to="/app" className="transition hover:text-foreground">Dashboard</Link>
        </nav>
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            aria-label="Toggle light/dark theme"
            className="flex h-9 w-9 items-center justify-center border border-border bg-transparent transition hover:bg-secondary"
            style={{ borderRadius: 6 }}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <Link
            to="/login"
            className="inline-flex h-9 items-center border border-border bg-transparent px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground transition hover:bg-secondary mr-2"
            aria-label="Sign in to Doott"
          >
            Login
          </Link>
          <Link
            to="/app"
            className="inline-flex h-9 items-center rounded-none bg-primary px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground transition hover:opacity-90"
            aria-label="Open Doott app dashboard"
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
    <img src={doottLogo} alt="Doott" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", display: "block" }} />
  );
}

/* ── Hero ──────────────────────────────────────────────────── */
function Hero() {
  return (
    <section
      className="relative overflow-hidden border-b border-border"
      aria-label="Hero — B2B Contact Database"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 px-6 pt-20 pb-24 md:grid-cols-12 md:pt-28 md:pb-32">
        <div className="md:col-span-9">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="eyebrow mb-6"
          >
            ◆ B2B Contact Database &amp; Lead Generation Platform
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="display text-[44px] sm:text-[64px] md:text-[84px]"
          >
            43.9 million<br />
            B2B contacts.<br />
            <em className="italic text-foreground/60">Instantly searchable.</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground"
          >
            Doott gives sales teams, founders, and recruiters direct access to a live{" "}
            <strong className="text-foreground">B2B contact database of 43,932,594 people</strong> and
            their company records — searchable, filterable, and exportable to CSV.
            Filter by verified emails, phone numbers, job titles, locations, and more.
          </motion.p>

          {/* Trust line — ZoomInfo / Apollo alternative signal */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-3 max-w-xl text-sm text-muted-foreground/70"
          >
            A powerful alternative to ZoomInfo, Apollo.io, and Hunter.io — with no per-seat pricing.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link
              to="/pricing"
              className="inline-flex h-12 items-center px-6 border border-primary bg-primary font-mono text-[11px] uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90"
              aria-label="Get lifetime access to Doott B2B contact database for ₹179"
            >
              Get Access — ₹179 →
            </Link>
            <a
              href="/#database"
              className="inline-flex h-12 items-center border border-border bg-transparent px-6 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition hover:bg-secondary"
            >
              See what's inside
            </a>
          </motion.div>

          {/* Live counts */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="mt-12 grid grid-cols-3 gap-0 border border-border max-w-lg"
            aria-label="Database statistics"
          >
            {[
              { n: "43.9M+", l: "People" },
              { n: "100%",   l: "Searchable" },
              { n: "CSV",    l: "Export" },
            ].map((s, i) => (
              <div
                key={i}
                className={`p-5 text-center ${i < 2 ? "border-r border-border" : ""}`}
              >
                <p className="font-serif text-2xl md:text-3xl text-foreground">{s.n}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-1">{s.l}</p>
              </div>
            ))}
          </motion.div>
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

/* ── Database Showcase ─────────────────────────────────────── */
function DatabaseShowcase() {
  return (
    <section id="database" className="border-b border-border bg-background" aria-label="B2B Database Overview">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        {/* Section header */}
        <div className="mb-20">
          <p className="eyebrow mb-4">The B2B Data</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <h2 className="display text-4xl md:text-6xl max-w-xl">
              People &amp; Companies.<br />One B2B database.
            </h2>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
              43.9 million verified B2B contacts and millions of company records — live on Google Cloud SQL PostgreSQL,
              cached with Redis, and instantly accessible through a clean,
              sortable, searchable interface. Export to CSV in one click.
            </p>
          </div>
        </div>

        {/* People card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="border border-border p-10 md:p-12 flex flex-col bg-secondary/10 hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 border border-border flex items-center justify-center">
                <Users2 size={20} />
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Table 01</p>
                <h3 className="font-serif text-2xl">People</h3>
              </div>
            </div>

            <p className="font-serif text-5xl md:text-6xl text-foreground mb-2">43.9M+</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-8">Individual contacts indexed</p>

            <p className="text-muted-foreground text-sm leading-relaxed mb-8">
              Every record includes full name, job title, company, location (city, state, pincode),
              LinkedIn URL, geo source, emails, and phone numbers.
              Filter, sort, search, and export any slice.
            </p>

            {/* Sub-views */}
            <div className="grid grid-cols-2 gap-3 mt-auto">
              <div className="border border-border p-4 bg-background">
                <div className="flex items-center gap-2 mb-2">
                  <Mail size={13} className="text-blue-400" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em]">Email</span>
                </div>
                <p className="text-sm text-muted-foreground">Filter to people with verified email addresses</p>
              </div>
              <div className="border border-border p-4 bg-background">
                <div className="flex items-center gap-2 mb-2">
                  <Phone size={13} className="text-green-400" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em]">Number</span>
                </div>
                <p className="text-sm text-muted-foreground">Filter to people with phone numbers</p>
              </div>
            </div>

            <div className="mt-6">
              <Link
                to="/app/people"
                className="inline-flex h-10 items-center border border-border px-5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition hover:bg-secondary"
              >
                Browse People →
              </Link>
            </div>
          </div>

          {/* Companies card */}
          <div className="border border-border p-10 md:p-12 flex flex-col bg-secondary/10 hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 border border-border flex items-center justify-center">
                <Building2 size={20} />
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Table 02</p>
                <h3 className="font-serif text-2xl">Companies</h3>
              </div>
            </div>

            <p className="font-serif text-5xl md:text-6xl text-foreground mb-2">Millions</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-8">Company records indexed</p>

            <p className="text-muted-foreground text-sm leading-relaxed mb-8">
              Business-level intelligence — company names, industries, website URLs,
              LinkedIn profiles, location data, and employee headcounts.
              Pair with People records to build complete contact lists.
            </p>

            {/* Fields */}
            <div className="grid grid-cols-3 gap-2 mt-auto">
              {["Name", "Industry", "Location", "Website", "LinkedIn", "Revenue"].map(f => (
                <span
                  key={f}
                  className="border border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground text-center"
                >
                  {f}
                </span>
              ))}
            </div>

            <div className="mt-6">
              <Link
                to="/app/companies"
                className="inline-flex h-10 items-center border border-border px-5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition hover:bg-secondary"
              >
                Browse Companies →
              </Link>
            </div>
          </div>
        </div>

        {/* Columns preview */}
        <div className="mt-8 border border-border p-6 bg-secondary/10">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-4">People table columns</p>
          <div className="flex flex-wrap gap-2">
            {[
              "full_name", "first_name", "last_name",
              "job_title", "linked_url", "location", "city", "state",
              "pincode", "lat", "long", "geo_source", "emails", "phones", "created_at"
            ].map(col => (
              <span
                key={col}
                className="border border-border px-2.5 py-1 font-mono text-[9px] tracking-[0.08em] text-muted-foreground"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Categories Showcase ───────────────────────────────────── */
// Every industry and job title in Doott, from the same generated file as the in-app Categories page
// (src/counts/explorerCards.js). Names only; each link opens that exact filter.
const COUNTRY_TABS = [
  { key: "india", label: "India" },
  { key: "usa", label: "USA" },
];
const MODE_TABS = [
  { key: "company", label: "Industries", unit: "companies" },
  { key: "people", label: "Job titles", unit: "people" },
];
const fmt = (n) => n.toLocaleString("en-US");
const TOTAL_SUBCATEGORIES = ["india", "usa"].reduce(
  (sum, c) => sum + CATEGORIES_DATA[c].company.length + CATEGORIES_DATA[c].people.length, 0);

function CategoriesShowcase() {
  const [country, setCountry] = useState("india");
  const [mode, setMode] = useState("company");
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");

  const groups = mode === "people" ? PEOPLE_ROLE_GROUPS : COMPANY_INDUSTRY_GROUPS;
  const all = CATEGORIES_DATA[country][mode];

  const list = useMemo(() => {
    let out = all;
    const g = groups.find((x) => x.key === group);
    if (g?.keywords) out = out.filter((c) => g.keywords.some((kw) => c.name.toLowerCase().includes(kw)));
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((c) => c.name.toLowerCase().includes(q));
    return out;
  }, [all, groups, group, query]);

  const hrefFor = (name) => {
    const enc = encodeURIComponent(name);
    return mode === "people"
      ? `/app/people?f_job_title_eq=${enc}&f_country=${country}`
      : `/app/companies?f_industry_eq=${enc}&f_country=${country}`;
  };

  const pill = (active) =>
    `px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] transition border ${
      active
        ? "border-foreground bg-foreground text-background font-semibold"
        : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
    }`;

  return (
    <section id="categories" className="border-b border-border bg-secondary/10 py-24 md:py-32" aria-label="Browse all B2B categories">
      <div className="mx-auto max-w-6xl px-6">
        {/* Section Header */}
        <div className="mb-12">
          <p className="eyebrow mb-4">◆ {fmt(TOTAL_SUBCATEGORIES)} industries &amp; job titles</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h2 className="display text-3xl md:text-5xl max-w-2xl">
                Browse every category &amp; decision-maker role.
              </h2>
              <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-relaxed">
                Every industry and job title in Doott for India and the USA. Open one to see its companies
                or people.
              </p>
            </div>
            <Link
              to="/app/categories"
              className="inline-flex h-11 items-center gap-2 border border-primary bg-primary px-5 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground transition hover:opacity-90 self-start md:self-auto"
            >
              Open category explorer →
            </Link>
          </div>
        </div>

        {/* Country, type and search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div className="flex flex-wrap items-center gap-2">
            {COUNTRY_TABS.map((c) => (
              <button key={c.key} onClick={() => { setCountry(c.key); setGroup("all"); }} className={pill(country === c.key)} aria-pressed={country === c.key}>
                {c.label}
              </button>
            ))}
            <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
            {MODE_TABS.map((m) => (
              <button key={m.key} onClick={() => { setMode(m.key); setGroup("all"); }} className={pill(mode === m.key)} aria-pressed={mode === m.key}>
                {m.label} <span className="opacity-60">({CATEGORIES_DATA[country][m.key].length})</span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-[280px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder={mode === "people" ? "Search job titles…" : "Search industries…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={mode === "people" ? "Search job titles" : "Search industries"}
              className="w-full pl-9 pr-4 py-2 border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground font-mono"
            />
          </div>
        </div>

        {/* Groups */}
        <div className="flex flex-wrap gap-2 mb-6 pb-6 border-b border-border">
          {groups.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              aria-pressed={group === g.key}
              className={`px-3 py-1 border font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                group === g.key ? "border-foreground text-foreground bg-secondary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Every subcategory */}
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3">
          {fmt(list.length)} of {fmt(all.length)} {mode === "people" ? "job titles" : "industries"}
        </p>
        <div className="border border-border bg-background max-h-[600px] overflow-y-auto">
          {list.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground">Nothing matches “{query}”. Try a shorter word.</p>
          ) : (
            // Styles live on the list (child selectors) so each of the hundreds of links stays small in the pre-rendered HTML.
            <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 [&>li]:bg-background [&_a]:flex [&_a]:items-center [&_a]:justify-between [&_a]:gap-3 [&_a]:px-4 [&_a]:py-3 [&_a]:text-sm [&_a:hover]:bg-secondary/40 [&_a:hover>span:first-child]:text-primary [&_a>span:first-child]:min-w-0 [&_a>span:first-child]:truncate">
              {list.map((c) => (
                <li key={c.name}>
                  <Link to={hrefFor(c.name)}><span>{c.name}</span></Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Opening a category needs a Doott account.
        </p>
      </div>
    </section>
  );
}

/* ── Features ──────────────────────────────────────────────── */
function Features() {
  const items = [
    {
      icon: Search,
      title: "Search & Filter",
      desc: "Full-text search across all columns. Sort by any field. Filter to Email-only or Phone-only subsets. Results in milliseconds via Redis cache.",
    },
    {
      icon: Download,
      title: "One-Click Export",
      desc: "Export any filtered result set to CSV instantly. Current page or full result — you pick. No row limits, no gated exports.",
    },
    {
      icon: Filter,
      title: "Smart Sub-Views",
      desc: "Dedicated 'Email' and 'Number' tabs auto-filter the People database to only contacts you can actually reach. No manual filtering needed.",
    },
    {
      icon: Building2,
      title: "Company Intelligence",
      desc: "Browse companies by industry, city and state, with websites, emails and phone numbers on every record you can reach.",
    },
    {
      icon: Compass,
      title: "Category & City Explorer",
      desc: "Jump straight into an industry, a job role or a city. One click opens the matching people and companies, ready to filter and export.",
    },
    {
      icon: Zap,
      title: "Live Cloud SQL",
      desc: "All data lives in Google Cloud SQL (PostgreSQL). No stale CSVs. Every query hits the live database, cached with Redis for speed.",
    },
  ];

  return (
    <section id="features" className="border-b border-border bg-secondary/20" aria-label="Lead generation platform features">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mb-16">
          <p className="eyebrow mb-4 opacity-60">Platform Features</p>
          <h2 className="display text-3xl md:text-5xl max-w-2xl">
            Everything you need<br />to find, verify, and reach B2B contacts.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-l border-border">
          {items.map((item, i) => (
            <div
              key={i}
              className="border-b border-r border-border p-8 md:p-10 flex flex-col gap-4 hover:bg-background transition-colors"
            >
              <div className="w-10 h-10 border border-border flex items-center justify-center">
                <item.icon size={16} />
              </div>
              <h3 className="font-serif text-xl">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Claude connector ──────────────────────────────────────── */
function ClaudeSection() {
  const steps = [
    ["Add the connector", <>In Claude: <b>Settings → Connectors → Add custom connector</b>, then paste the Doott URL.</>],
    ["Sign in to Doott", <>Click <b>Connect</b>, sign in and click <b>Allow</b>. Read-only, disconnect any time.</>],
    ["Ask for leads", <>Turn on Doott in a chat and ask in plain English. Claude does the searching.</>],
  ];
  return (
    <section id="claude" className="border-b border-border bg-background" aria-label="Use Doott inside Claude">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32 grid gap-14 md:grid-cols-2 md:items-start">
        <div className="min-w-0">
          <p className="eyebrow mb-4 opacity-60 flex items-center gap-2"><Sparkles size={14} /> New · Doott × Claude</p>
          <h2 className="display text-3xl md:text-5xl mb-6">Find leads by asking Claude.</h2>
          <p className="text-muted-foreground leading-relaxed mb-10 max-w-lg">
            Connect Doott to Claude and search 43.9M contacts from your chat. Claude filters by job title,
            city, industry and verified email, and gives you a ready-to-use table.
          </p>
          <ol className="space-y-6 mb-10">
            {steps.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="h-9 w-9 shrink-0 border border-border flex items-center justify-center font-mono text-[11px] text-muted-foreground">{`0${i + 1}`}</span>
                <div>
                  <h3 className="font-serif text-lg">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Connector URL</p>
          <code className="block overflow-x-auto whitespace-nowrap border border-border bg-secondary/20 px-4 py-3 font-mono text-sm mb-8">{MCP_URL}</code>
          <Link
            to="/claude"
            className="inline-flex h-11 items-center gap-2 bg-primary px-6 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground transition hover:opacity-90"
          >
            Full setup guide <ArrowRight size={14} />
          </Link>
        </div>

        {/* Example chat */}
        <div className="min-w-0 border border-border bg-secondary/10 p-6 md:p-8" aria-label="Example conversation with Claude using Doott">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-6">Example</p>
          <div className="ml-auto mb-4 max-w-[85%] border border-border bg-background px-4 py-3 text-sm">
            {EXAMPLE_PROMPTS[1]}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">Claude · used Doott: search companies</p>
          <div className="border border-border bg-background text-sm overflow-x-auto">
            <table className="w-full text-left">
              <thead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <tr className="border-b border-border"><th className="px-3 py-2 font-normal">Company</th><th className="hidden sm:table-cell px-3 py-2 font-normal">Industry</th><th className="px-3 py-2 font-normal">Email</th></tr>
              </thead>
              <tbody>
                {[["Company A", "Logistics"], ["Company B", "Software"], ["Company C", "Real estate"]].map(([c, ind]) => (
                  <tr key={c} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{c}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-muted-foreground whitespace-nowrap">{ind}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 text-muted-foreground"><CheckCircle size={12} /> deliverable</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Illustration. Real answers list actual Doott records with emails and phone numbers.</p>
        </div>
      </div>
    </section>
  );
}

/* ── Metrics ───────────────────────────────────────────────── */
function Metrics() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-border">
          {[
            { stat: "43.9M+", label: "People Records" },
            { stat: "17",     label: "Data Columns" },
            { stat: String(COVERED_COUNTRIES.length), label: "Countries" },
            { stat: "100%",   label: "Exportable" },
          ].map((m, i) => (
            <div
              key={i}
              className={`flex flex-col items-center justify-center text-center px-4 ${i > 1 ? "pt-12 md:pt-0" : ""}`}
            >
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
      desc: "Stop buying stale B2B lead lists from overpriced platforms. Search 43.9M real verified contacts by job title, location, industry, and company size. Export exactly who you need to CSV. No subscriptions. No per-seat limits. A true ZoomInfo alternative.",
    },
    {
      title: "Recruiters",
      desc: "Find candidates by job title and location instantly across 43.9 million B2B profiles. Filter to people with LinkedIn URLs. Export to CSV and start outreach immediately — no expensive ATS required.",
    },
    {
      title: "Founders",
      desc: "Build your ideal customer profile (ICP) from the ground up. Use the verified Email and Phone tabs to only contact decision-makers you can actually reach. Go from B2B search to outreach in minutes.",
    },
  ];

  return (
    <section className="border-b border-border bg-secondary/10" aria-label="Who uses Doott — use cases">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mb-16 text-center md:text-left">
          <p className="eyebrow mb-4 opacity-60">Who uses Doott</p>
          <h2 className="display text-3xl md:text-4xl">Built for B2B sales, recruiting, and founder outreach.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {cases.map((c, i) => (
            <div key={i} className="border border-border bg-background p-10 flex flex-col transition-colors hover:bg-secondary/10">
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
    <section id="faq" className="border-b border-border bg-background" aria-label="Frequently asked questions about Doott">
      <div className="mx-auto max-w-4xl px-6 py-24 md:py-32">
        <div className="text-center mb-16">
          <p className="eyebrow mb-4 opacity-60">Questions</p>
          <h2 className="display text-3xl md:text-4xl">Frequently Asked Questions.</h2>
        </div>
        <div className="space-y-4">
          {[
            {
              q: "How many B2B contacts are in Doott's database?",
              a: "Doott's live database contains 43,932,594 individual people records, each with full name, job title, company, location (city, state, pincode), LinkedIn URL, emails, and phone numbers. The company database adds millions more business records.",
            },
            {
              q: "How fresh is the data?",
              a: "The People and Companies databases are stored in Google Cloud SQL PostgreSQL and updated via automated enrichment pipelines. The live record count of 43,932,594 reflects the current state of the database as of the last pipeline run.",
            },
            {
              q: "What does the Email tab show?",
              a: "The Email tab filters the full People database to show only contacts who have a non-empty 'emails' field. These are the people you can actually contact via email — making outreach targeting much cleaner.",
            },
            {
              q: "What does the Number tab show?",
              a: "The Number tab filters the People database to only contacts who have a non-empty 'phones' field — direct lines, mobile numbers, or business phones. Perfect for phone-based outreach.",
            },
            {
              q: "Can I export B2B leads to CSV?",
              a: "Yes — every view (People, Email, Number, Companies) has a one-click Export CSV button. It exports the current filtered and paginated result set directly to your browser. No size limits on the export.",
            },
            {
              q: "Can I use Doott inside Claude?",
              a: "Yes. Add Doott as a custom connector in Claude (Settings → Connectors) with the URL " + MCP_URL + ", sign in to Doott and click Allow. Claude can then search people and companies and verify emails for you. The connector is read-only, and you can disconnect it at any time. See doott.jaqyi.com/claude for the full guide.",
            },
            {
              q: "Is Doott a free alternative to ZoomInfo or Apollo.io?",
              a: "Yes. Doott is free to start with no credit card required and no per-seat pricing — giving you access to a 43.9M contact B2B database similar to ZoomInfo, Apollo.io, and Hunter.io, but without the high subscription costs.",
            },
          ].map((faq, i) => (
            <details key={i} className="group border border-border bg-secondary/10 p-6 [&_summary::-webkit-details-marker]:hidden">
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
    <section className="border-b border-border bg-foreground text-background" aria-label="Call to action — access B2B database">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32 flex flex-col items-center text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-background/50 mb-6">Ready to search 43.9M verified B2B contacts?</p>
        <h2 className="font-serif font-bold tracking-tight text-background text-4xl md:text-6xl lg:text-7xl mb-8 max-w-3xl leading-tight">
          The B2B data is live.<br />Start prospecting now.
        </h2>
        <p className="text-background/60 mb-10 max-w-lg font-serif text-lg">
          Free to start. No credit card required. No per-seat pricing.
          Access verified B2B People, Email, Phone, and Companies databases immediately.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            to="/pricing"
            className="inline-flex h-12 items-center px-10 border border-background/40 bg-transparent font-mono text-[11px] uppercase tracking-[0.2em] text-background/70 transition hover:border-background hover:text-background"
            aria-label="Get lifetime access to Doott for ₹179"
          >
            Get Lifetime Access — ₹179
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ────────────────────────────────────────────────── */
export function Footer() {
  return (
    <footer className="bg-background" role="contentinfo" aria-label="Site footer">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 md:flex-row">
        <div className="flex items-center gap-2">
          <Mark />
          <div>
            <span className="font-serif text-lg">Doott</span>
            <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground mt-0.5">
              B2B Contact Database &amp; Lead Generation
            </p>
          </div>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Link to="/login" className="hover:text-foreground transition">Sign In</Link>
          <a href="/#database" className="hover:text-foreground transition">Database</a>
          <a href="/#features" className="hover:text-foreground transition">Features</a>
          <a href="/#faq" className="hover:text-foreground transition">FAQ</a>
          <Link to="/claude" className="hover:text-foreground transition">Claude</Link>
          <Link to="/app/docs" className="hover:text-foreground transition">Docs</Link>
        </nav>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          © {new Date().getFullYear()} Doott · 43.9M verified B2B contacts
        </p>
      </div>
    </footer>
  );
}
