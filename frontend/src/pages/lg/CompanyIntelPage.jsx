import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Search, Loader2, Globe, MapPin, Users, UserPlus, Briefcase, ExternalLink, Sparkles } from "lucide-react";
import { lgCompanySearch, lgSaveLead } from "../../api";
import toast from "react-hot-toast";

const INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "E-commerce", "Manufacturing", "Logistics", "Real Estate", "EdTech", "Legal Tech", "Cybersecurity", "AI/ML", "Robotics", "Biotech", "Retail", "HR Tech"];
const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
const COUNTRIES = ["Worldwide", "United States", "United Kingdom", "India", "Canada", "Germany", "Australia", "Singapore", "UAE", "France"];

export default function CompanyIntelPage() {
  const [industry, setIndustry]     = useState("");
  const [country, setCountry]       = useState("Worldwide");
  const [empRange, setEmpRange]     = useState("");
  const [keywords, setKeywords]     = useState("");
  const [limit, setLimit]           = useState(15);
  const [searching, setSearching]   = useState(false);
  const [results, setResults]       = useState([]);
  const [saved, setSaved]           = useState({});
  const [saving, setSaving]         = useState({});

  const handleSearch = async () => {
    if (!industry) { toast.error("Select an industry"); return; }
    setSearching(true); setResults([]);
    try {
      const { data } = await lgCompanySearch({
        industry,
        country: country === "Worldwide" ? null : country,
        employeeRange: empRange,
        keywords: keywords ? keywords.split(",").map(k => k.trim()) : [],
        limit,
      });
      setResults(data.results || []);
      toast.success(`Found ${data.results?.length || 0} companies`);
    } catch (err) { toast.error(err.response?.data?.error || "Search failed"); }
    finally { setSearching(false); }
  };

  const saveCompany = async (company) => {
    const key = company.domain;
    setSaving(p => ({ ...p, [key]: true }));
    try {
      await lgSaveLead({
        companyName: company.companyName,
        companyDomain: company.domain,
        companyWebsite: company.website,
        industry: company.industry,
        country: company.country,
        employeeCount: company.employeeCount,
        linkedinUrl: company.linkedinUrl,
        source: "company_intel",
        status: "new",
      });
      setSaved(p => ({ ...p, [key]: true }));
      toast.success(`${company.companyName} saved to database`);
    } catch { toast.error("Save failed"); }
    finally { setSaving(p => ({ ...p, [key]: false })); }
  };

  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Building2 size={22} className="text-[var(--accent)]" /> Company Intelligence
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">Discover companies by industry, size, and location — powered by AI research</p>
      </div>

      <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1.5 block">Industry <span className="text-[var(--rose)]">*</span></label>
            <select className="input w-full text-sm" value={industry} onChange={e => setIndustry(e.target.value)}>
              <option value="">Select industry...</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1.5 block">Country</label>
            <select className="input w-full text-sm" value={country} onChange={e => setCountry(e.target.value)}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1.5 block">Employees</label>
            <select className="input w-full text-sm" value={empRange} onChange={e => setEmpRange(e.target.value)}>
              <option value="">Any size</option>
              {EMPLOYEE_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1.5 block">Limit</label>
            <select className="input w-full text-sm" value={limit} onChange={e => setLimit(Number(e.target.value))}>
              {[10, 15, 20, 25].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1.5 block">Extra Keywords (optional)</label>
          <input className="input w-full text-sm" placeholder="e.g. Series A, remote-first, B2B, growing fast..."
            value={keywords} onChange={e => setKeywords(e.target.value)} />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <Sparkles size={11} className="text-[var(--accent)]" /> Results are AI-researched using real company data
          </div>
          <button onClick={handleSearch} disabled={searching || !industry}
            className="btn-primary ml-auto gap-2 py-2.5 px-6 text-sm font-bold disabled:opacity-40">
            {searching ? <><Loader2 size={15} className="animate-spin" /> Researching...</> : <><Search size={15} /> Find Companies</>}
          </button>
        </div>
      </motion.div>

      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="card p-4 space-y-3 hover:border-[var(--accent)] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent)]/20 to-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Building2 size={16} className="text-[var(--accent)]" />
                </div>
                <button onClick={() => saveCompany(c)} disabled={saving[c.domain] || saved[c.domain]}
                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-bold flex-shrink-0 transition-colors ${saved[c.domain] ? "bg-[var(--emerald)]/20 text-[var(--emerald)]" : "bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20"}`}>
                  {saving[c.domain] ? <Loader2 size={9} className="animate-spin" /> : saved[c.domain] ? "✓ Saved" : <><UserPlus size={9} /> Save</>}
                </button>
              </div>
              <div>
                <p className="font-bold text-[var(--text)]">{c.companyName}</p>
                <p className="text-[11px] text-[var(--text-3)] mt-0.5 leading-relaxed">{c.description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {c.industry && <span className="badge badge-purple">{c.industry}</span>}
                {c.employeeCount && <span className="flex items-center gap-0.5 text-[var(--text-3)]"><Users size={8} /> {c.employeeCount}</span>}
                {c.country && <span className="flex items-center gap-0.5 text-[var(--text-3)]"><MapPin size={8} /> {c.country}</span>}
              </div>
              <div className="flex gap-2 pt-1 border-t border-[var(--border)]">
                {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-[10px] text-[var(--accent)] hover:underline"><Globe size={9} /> Website</a>}
                {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-[10px] text-blue-400 hover:underline"><ExternalLink size={9} /> LinkedIn</a>}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
