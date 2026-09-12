import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ArrowRight, Search, Grid3x3, Layers,
  Users2, Building2, Briefcase, Zap, X, Filter, Globe2
} from "lucide-react";
import CATEGORIES_DATA from "../categories.json";

// ── Country config ─────────────────────────────────────────────────────────
const COUNTRIES = [
  { key: "india", label: "India", flag: "🇮🇳", subtitle: "1.36M+ Ingested B2B Companies & Founders" },
  { key: "usa",   label: "USA & Global", flag: "🇺🇸", subtitle: "45M+ Global Enterprises & Professionals" },
];

// ── Role and Industry Groupings for Quick Filters ──
const PEOPLE_ROLE_GROUPS = [
  { key: "all", label: "All Roles" },
  { key: "csuite", label: "Executive & C-Suite", keywords: ["ceo", "president", "founder", "owner", "officer", "cfo", "cto", "cmo", "coo", "director", "managing", "partner", "principal", "head"] },
  { key: "sales", label: "Sales & Growth", keywords: ["sales", "account", "business development", "growth", "revenue", "bdr", "sdr"] },
  { key: "marketing", label: "Marketing & Brand", keywords: ["marketing", "brand", "creative", "content", "digital", "advertising", "media"] },
  { key: "tech", label: "Engineering & IT", keywords: ["engineer", "developer", "software", "technology", "data", "devops", "architect", "tech", "product"] },
  { key: "hr", label: "HR & Talent", keywords: ["human resource", "hr", "talent", "recruiter", "recruitment", "staffing"] },
  { key: "finance", label: "Finance & Legal", keywords: ["finance", "financial", "cfo", "controller", "attorney", "counsel", "legal", "accounting", "chartered"] },
  { key: "healthcare", label: "Healthcare & Medical", keywords: ["medical", "physician", "doctor", "health", "clinic", "surgeon", "dentist"] },
  { key: "operations", label: "Operations & Management", keywords: ["operations", "general manager", "project", "supply", "logistics"] },
];

const COMPANY_INDUSTRY_GROUPS = [
  { key: "all", label: "All Industries" },
  { key: "tech", label: "Tech & Software", keywords: ["software", "internet", "computers", "electronics", "technology", "telecom", "it", "saas", "cloud"] },
  { key: "retail", label: "Retail & Garments", keywords: ["retail", "consumer", "garment", "clothing", "apparel", "boutique", "textile", "fashion", "e-commerce"] },
  { key: "hospitality", label: "Hotels, Cafes & Dining", keywords: ["hotel", "resort", "lodging", "hospitality", "restaurant", "cafe", "coffee", "bakery", "dining", "food"] },
  { key: "healthcare", label: "Healthcare & Medical", keywords: ["health", "medical", "hospital", "wellness", "pharma", "pharmaceutical", "care", "clinic"] },
  { key: "manufacturing", label: "Manufacturing & Industrial", keywords: ["manufacturing", "industrial", "machinery", "automotive", "production", "materials", "chemical"] },
  { key: "finance", label: "Financial Services", keywords: ["financial", "finance", "banking", "insurance", "investment", "capital", "accounting"] },
  { key: "realestate", label: "Real Estate & Construction", keywords: ["real estate", "construction", "architecture", "building", "property"] },
  { key: "services", label: "Business Services & Consulting", keywords: ["services", "consulting", "marketing", "advertising", "legal", "law"] },
  { key: "education", label: "Education & Non-Profit", keywords: ["education", "non-profit", "school", "university", "academic", "training", "college"] },
];

const QUICK_TAGS = {
  india: {
    people: ["Founder", "Managing Director", "CEO", "HR Manager", "Software Engineer", "Sales Manager", "Chartered Accountant", "Advocate"],
    company: ["Garments & Apparel", "Software", "Manufacturing", "Hotels", "Healthcare", "Education", "Restaurants", "Financial Services"]
  },
  usa: {
    people: ["CEO", "Founder", "President", "VP Sales", "Software Engineer", "Marketing Director", "Real Estate Agent", "Physician"],
    company: ["Software & Internet", "Healthcare", "Restaurants", "Hotels", "Manufacturing", "Financial Services", "Retail", "Real Estate"]
  }
};

export default function CategoryExplorerPage() {
  const navigate = useNavigate();
  const [country, setCountry] = useState("india");
  const [mode, setMode] = useState("company"); // "people" or "company"
  const [searchQ, setSearchQ] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");

  const isIndia = country === "india";
  const activeCountryObj = COUNTRIES.find(c => c.key === country) || COUNTRIES[0];

  const groups = mode === "people" ? PEOPLE_ROLE_GROUPS : COMPANY_INDUSTRY_GROUPS;
  const quickTags = (QUICK_TAGS[country] && QUICK_TAGS[country][mode]) || QUICK_TAGS.usa[mode];

  // Pick base category list for country + mode
  const baseCategories = useMemo(() => {
    const countryData = CATEGORIES_DATA[country] || CATEGORIES_DATA;
    if (countryData && countryData[mode]) {
      return countryData[mode];
    }
    return mode === "people" ? (CATEGORIES_DATA.people || []) : (CATEGORIES_DATA.company || []);
  }, [country, mode]);

  // Filtered by group pill and search query
  const filtered = useMemo(() => {
    let list = baseCategories;

    // Apply Group filter
    if (selectedGroup !== "all") {
      const activeGroupObj = groups.find(g => g.key === selectedGroup);
      if (activeGroupObj && activeGroupObj.keywords) {
        list = list.filter(item => {
          const lowerName = item.name.toLowerCase();
          return activeGroupObj.keywords.some(kw => lowerName.includes(kw));
        });
      }
    }

    // Apply Search Query
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q));
    }

    return list;
  }, [baseCategories, selectedGroup, searchQ, groups]);

  const handleClick = (cat) => {
    const enc = encodeURIComponent(cat.name);
    const locParam = country === "india" ? "&f_location=India" : "&f_location=USA";
    if (mode === "people") {
      navigate(`/app/people?f_job_title=${enc}${locParam}`);
    } else {
      navigate(`/app/companies?f_industry=${enc}${locParam}`);
    }
  };

  const handleCountryChange = (newCountry) => {
    setCountry(newCountry);
    setSelectedGroup("all");
    setSearchQ("");
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setSelectedGroup("all");
    setSearchQ("");
  };

  return (
    <div className="flex flex-col gap-6 h-full pb-10">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(226,55,68,0.12)",
                border: "1px solid rgba(226,55,68,0.25)",
                color: "var(--accent)"
              }}
            >
              <Grid3x3 size={22} />
            </div>
            Category &amp; Industry Explorer
          </h2>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Search and segment <span className="font-semibold text-[var(--text-2)]">{activeCountryObj.label}</span> {mode === "people" ? "verified professionals & roles" : "businesses & industry verticals"}.
          </p>
        </div>

        {/* Total stats badge */}
        <div
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-2)",
          }}
        >
          <Sparkles size={14} style={{ color: "var(--accent)" }} />
          <span>{filtered.length} categories available</span>
        </div>
      </div>

      {/* ── Main Control Bar ─────────────────────────────── */}
      <div
        className="p-4 rounded-2xl flex flex-col gap-4"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        }}
      >
        {/* Country & Mode Toggles */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          
          <div className="flex items-center flex-wrap gap-3">
            {/* Country Tabs: India / USA */}
            <div className="flex items-center rounded-xl p-1 bg-[var(--surface)] border border-[var(--border)]">
              {COUNTRIES.map(c => (
                <button
                  key={c.key}
                  onClick={() => handleCountryChange(c.key)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  style={{
                    background: country === c.key ? "var(--accent)" : "transparent",
                    color: country === c.key ? "#fff" : "var(--text-3)",
                    boxShadow: country === c.key ? "0 2px 10px var(--accent-glow)" : "none",
                  }}
                >
                  <span className="text-sm">{c.flag}</span>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Mode Toggle — People / Companies */}
            <div
              className="relative flex items-center rounded-xl p-1 bg-[var(--surface)] border border-[var(--border)]"
            >
              <button
                onClick={() => handleModeChange("company")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
                style={{
                  background: mode === "company" ? "var(--accent)" : "transparent",
                  color: mode === "company" ? "#fff" : "var(--text-3)",
                  boxShadow: mode === "company" ? "0 2px 10px var(--accent-glow)" : "none",
                }}
              >
                <Building2 size={15} />
                Industries &amp; Businesses
              </button>
              <button
                onClick={() => handleModeChange("people")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
                style={{
                  background: mode === "people" ? "var(--accent)" : "transparent",
                  color: mode === "people" ? "#fff" : "var(--text-3)",
                  boxShadow: mode === "people" ? "0 2px 10px var(--accent-glow)" : "none",
                }}
              >
                <Users2 size={15} />
                Job Roles &amp; Titles
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              className="input pl-10 pr-9 w-full text-sm font-medium rounded-xl"
              placeholder={`Search ${country === "india" ? "India" : "USA"} ${mode === "people" ? "job titles (e.g. Founder, CEO, Manager)..." : "industries (e.g. Garments, Hotel, Tech)..."}`}
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Category Group Pills ─────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--border)]">
          <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter size={11} /> Group:
          </span>
          {groups.map(g => (
            <button
              key={g.key}
              onClick={() => setSelectedGroup(g.key)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer"
              style={{
                background: selectedGroup === g.key ? "rgba(226,55,68,0.15)" : "rgba(255,255,255,0.03)",
                color: selectedGroup === g.key ? "var(--accent)" : "var(--text-3)",
                border: `1px solid ${selectedGroup === g.key ? "rgba(226,55,68,0.3)" : "var(--border)"}`,
                fontWeight: selectedGroup === g.key ? 700 : 500,
              }}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* ── Quick Search Chips ───────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--text-3)]">
          <span className="text-[11px] opacity-75 mr-1">Trending in {activeCountryObj.label}:</span>
          {quickTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSearchQ(tag)}
              className="px-2.5 py-0.5 rounded-md text-[11px] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors cursor-pointer"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── Categories Grid ───────────────────────────────── */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-3)] rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]"
          >
            <Layers size={44} className="opacity-30 text-[var(--accent)]" />
            <h3 className="text-base font-bold text-[var(--text)]">No categories found</h3>
            <p className="text-xs max-w-sm text-center">
              No {country === "india" ? "India" : "USA"} {mode === "people" ? "job titles" : "industries"} match your query "{searchQ}".
            </p>
            <button
              onClick={() => { setSearchQ(""); setSelectedGroup("all"); }}
              className="mt-2 px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-[var(--accent)] hover:opacity-90 transition-opacity cursor-pointer"
            >
              Clear Filters
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={`grid-${country}-${mode}-${selectedGroup}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5"
          >
            {filtered.map((cat, i) => (
              <motion.button
                key={`${country}-${cat.name}`}
                onClick={() => handleClick(cat)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.008, 0.25), duration: 0.2 }}
                className="relative rounded-2xl p-4 text-left overflow-hidden group cursor-pointer flex flex-col justify-between"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  minHeight: 100,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                {/* Top red accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-[2.5px] rounded-t-2xl opacity-60 group-hover:opacity-100 transition-opacity"
                  style={{ background: "linear-gradient(90deg, var(--accent) 0%, #f4576a 100%)" }}
                />

                {/* Hover Glow Layer */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300 rounded-2xl pointer-events-none"
                  style={{ background: "var(--accent)" }}
                />

                {/* Title */}
                <div>
                  <h4 className="text-xs font-bold text-[var(--text)] leading-snug line-clamp-2 mb-1 group-hover:text-[var(--accent)] transition-colors">
                    {cat.name}
                  </h4>
                </div>

                {/* Bottom Stats & Arrow */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border)]">
                  <span className="text-[10px] font-semibold text-[var(--text-3)] flex items-center gap-1">
                    {cat.count ? cat.count.toLocaleString() : "1,000+"} {mode === "people" ? "leads" : "orgs"}
                  </span>

                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    <ArrowRight size={10} />
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
