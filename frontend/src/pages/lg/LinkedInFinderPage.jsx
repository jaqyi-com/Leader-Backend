import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Linkedin, Search, Loader2, Sparkles, UserPlus, MapPin,
  Building2, Briefcase, Users, Globe, ChevronDown, Wand2, Info,
} from "lucide-react";
import { lgLinkedInSearch, lgAnalyzeProspect, lgSaveLead } from "../../api";
import toast from "react-hot-toast";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
const INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "E-commerce", "Manufacturing", "Logistics", "Real Estate", "EdTech", "Legal Tech", "Cybersecurity", "AI/ML", "Robotics", "Biotech", "Retail", "Insurance"];
const COUNTRIES  = ["United States", "United Kingdom", "India", "Canada", "Germany", "Australia", "Singapore", "UAE", "France", "Netherlands"];

function TagInput({ tags, setTags, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) setTags(p => [...p, v]);
    setInput("");
  };
  return (
    <div className="input flex flex-wrap gap-1.5 min-h-[46px] cursor-text" onClick={() => document.getElementById("ti-input")?.focus()}>
      {tags.map(t => (
        <span key={t} className="badge badge-purple text-xs flex items-center gap-1">{t}
          <button onClick={e => { e.stopPropagation(); setTags(p => p.filter(x => x !== t)); }} className="hover:text-white"><span>×</span></button>
        </span>
      ))}
      <input id="ti-input" className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-3)]"
        placeholder={tags.length ? "Add more..." : placeholder} value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } if (e.key === "Backspace" && !input) setTags(p => p.slice(0, -1)); }}
        onBlur={add} />
    </div>
  );
}

export default function LinkedInFinderPage() {
  const [aiPrompt, setAiPrompt]       = useState("");
  const [aiLoading, setAiLoading]     = useState(false);
  const [jobTitles, setJobTitles]     = useState([]);
  const [industries, setIndustries]   = useState([]);
  const [countries, setCountries]     = useState([]);
  const [companySize, setCompanySize] = useState("");
  const [limit, setLimit]             = useState(20);
  const [results, setResults]         = useState([]);
  const [searching, setSearching]     = useState(false);
  const [isMock, setIsMock]           = useState(false);
  const [saving, setSaving]           = useState({});
  const [saved, setSaved]             = useState({});

  const analyzeWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await lgAnalyzeProspect(aiPrompt);
      if (data.jobTitles?.length) setJobTitles(data.jobTitles);
      if (data.industries?.length) setIndustries(data.industries);
      if (data.countries?.length) setCountries(data.countries);
      if (data.companySize) setCompanySize(data.companySize);
      toast.success("AI filled your search criteria!");
    } catch { toast.error("AI analysis failed"); }
    finally { setAiLoading(false); }
  };

  const handleSearch = async () => {
    if (!jobTitles.length && !industries.length) { toast.error("Add at least one job title or industry"); return; }
    setSearching(true); setResults([]);
    try {
      const { data } = await lgLinkedInSearch({ jobTitles, industries, countries, companySize, limit });
      setResults(data.results || []);
      setIsMock(data.source === "mock");
      if (data.source === "mock") toast("Showing demo data. Add PROXYCURL_API_KEY for real results.", { icon: "ℹ️" });
      else toast.success(`Found ${data.results?.length || 0} prospects`);
    } catch (err) { toast.error(err.response?.data?.error || "Search failed"); }
    finally { setSearching(false); }
  };

  const saveLead = async (profile) => {
    const key = profile.linkedinUrl || profile.fullName;
    setSaving(p => ({ ...p, [key]: true }));
    try {
      await lgSaveLead({ ...profile, source: "linkedin_finder", status: "new" });
      setSaved(p => ({ ...p, [key]: true }));
      toast.success(`${profile.fullName} saved to Lead Database`);
    } catch { toast.error("Save failed"); }
    finally { setSaving(p => ({ ...p, [key]: false })); }
  };

  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Linkedin size={22} className="text-blue-500" /> LinkedIn Prospect Finder
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">Find decision-makers by job title, industry, and location worldwide</p>
      </div>

      {/* AI input */}
      <motion.div className="card p-5 space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider flex items-center gap-2"><Wand2 size={12} className="text-[var(--accent)]" /> Describe in plain English (optional)</p>
        <div className="relative">
          <textarea className="input w-full text-sm resize-none" rows={2}
            placeholder='e.g. "CTOs at Series A fintech startups in Southeast Asia with 20-100 employees"'
            value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} style={{ paddingRight: 130 }} />
          <button onClick={analyzeWithAI} disabled={aiLoading || !aiPrompt.trim()}
            className="absolute right-2 bottom-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,var(--accent),#8b5cf6)", color: "white" }}>
            {aiLoading ? <><Loader2 size={11} className="animate-spin" /> Analyzing...</> : <><Wand2 size={11} /> Auto-fill</>}
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Briefcase size={11} className="text-[var(--accent)]" /> Job Titles *</label>
            <TagInput tags={jobTitles} setTags={setJobTitles} placeholder="e.g. CTO, VP Engineering..." />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 size={11} className="text-[var(--accent)]" /> Industries</label>
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRIES.slice(0, 8).map(i => (
                <button key={i} onClick={() => setIndustries(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i])}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${industries.includes(i) ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-2)] hover:border-[var(--accent)]"}`}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><MapPin size={11} className="text-[var(--accent)]" /> Countries</label>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRIES.slice(0, 6).map(c => (
                <button key={c} onClick={() => setCountries(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${countries.includes(c) ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-2)] hover:border-[var(--accent)]"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Users size={11} className="text-[var(--accent)]" /> Company Size</label>
              <select className="input w-full text-sm" value={companySize} onChange={e => setCompanySize(e.target.value)}>
                <option value="">Any Size</option>
                {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2">Limit</label>
              <select className="input w-full text-sm" value={limit} onChange={e => setLimit(Number(e.target.value))}>
                {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>
        <button onClick={handleSearch} disabled={searching}
          className="btn-primary w-full gap-2 py-2.5 text-sm font-bold disabled:opacity-40">
          {searching ? <><Loader2 size={15} className="animate-spin" /> Searching...</> : <><Search size={15} /> Find Prospects</>}
        </button>
      </motion.div>

      {/* Mock notice */}
      {isMock && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-400">
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          <span>Showing <strong>demo data</strong>. Add <code className="bg-amber-500/20 px-1 rounded">PROXYCURL_API_KEY</code> to your .env for real LinkedIn search results.</span>
        </motion.div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {results.map((p, i) => {
            const key = p.linkedinUrl || p.fullName;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--text)]">{p.fullName}</p>
                    <p className="text-xs text-[var(--accent)]">{p.jobTitle}</p>
                  </div>
                  <button
                    onClick={() => saveLead(p)} disabled={saving[key] || saved[key]}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors flex-shrink-0 ${saved[key] ? "bg-[var(--emerald)]/20 text-[var(--emerald)]" : "bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20"}`}>
                    {saving[key] ? <Loader2 size={11} className="animate-spin" /> : saved[key] ? "✓ Saved" : <><UserPlus size={11} /> Save</>}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] text-[var(--text-3)]">
                  {p.companyName && <span className="flex items-center gap-0.5"><Building2 size={9} /> {p.companyName}</span>}
                  {p.country && <span className="flex items-center gap-0.5"><MapPin size={9} /> {p.country}</span>}
                  {p.industry && <span className="badge badge-purple text-[9px]">{p.industry}</span>}
                </div>
                {p.linkedinUrl && (
                  <a href={p.linkedinUrl} target="_blank" rel="noreferrer"
                    className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5">
                    <Globe size={9} /> View LinkedIn Profile
                  </a>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
