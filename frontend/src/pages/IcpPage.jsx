import { useState, useEffect } from "react";
import { getIcp, saveIcp } from "../api";
import { Target, Save, Loader2, RefreshCw, X, Plus } from "lucide-react";
import toast from "react-hot-toast";

// --- Custom Tag Input Component ---
function TagInput({ label, tags, setTags, placeholder }) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  const addTag = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) setTags([...tags, val]);
    setInput("");
  };

  const removeTag = (idx) => {
    setTags(tags.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-brand-500/40 focus-within:border-brand-500 transition-all min-h-[44px]">
        {tags.map((tag, i) => (
          <span key={i} className="flex items-center gap-1.5 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 px-2.5 py-1 rounded-lg text-xs font-semibold">
            {tag}
            <button onClick={() => removeTag(i)} className="hover:text-brand-500 transition-colors">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
          placeholder={tags.length === 0 ? placeholder : "Type and press enter..."}
        />
      </div>
    </div>
  );
}

export default function IcpPage() {
  const [icp, setIcp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchIcp();
  }, []);

  const fetchIcp = async () => {
    setLoading(true);
    try {
      const { data } = await getIcp();
      setIcp(data);
    } catch (err) {
      toast.error("Failed to load ICP config");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveIcp(icp);
      toast.success("ICP Configuration saved! Changes apply immediately.");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save ICP config");
    } finally {
      setSaving(false);
    }
  };

  // Safe setter helpers
  const updateCompany = (key, val) => setIcp(p => ({ ...p, company: { ...p.company, [key]: val } }));
  const updateRoles = (key, val) => setIcp(p => ({ ...p, roles: { ...p.roles, [key]: val } }));
  const updateVP = (key, val) => setIcp(p => ({ ...p, valueProposition: { ...p.valueProposition, [key]: val } }));

  if (loading || !icp) return (
    <div className="h-full flex flex-col items-center justify-center text-slate-500">
      <Loader2 size={32} className="animate-spin mb-4" />
      <p>Loading configuration UI...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full gap-6 max-w-5xl mx-auto pb-8">
      {/* Header Sticky Bar */}
      <div className="glass-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 sticky top-0 z-10 shadow-sm">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 mb-1 text-slate-900 dark:text-white">
            <Target className="text-brand-500" />
            Ideal Customer Profile Builder
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Easily define the exact companies and people the agent should target and email.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchIcp} disabled={saving} className="btn-secondary">
            <RefreshCw size={16} /> Revert
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Company Targeting */}
        <div className="glass-card p-6 space-y-6">
          <h3 className="text-lg font-bold border-b border-slate-100 dark:border-gray-800 pb-3 mb-4 text-slate-800 dark:text-white">
            1. Company Targeting
          </h3>
          
          <TagInput 
            label="Industry Segments" 
            placeholder="e.g. warehouse robotics, automation"
            tags={icp.company.segments || []} 
            setTags={(t) => updateCompany("segments", t)} 
          />
          <TagInput 
            label="Target Countries / Regions" 
            placeholder="e.g. United States, Germany"
            tags={icp.company.geographics || []} 
            setTags={(t) => updateCompany("geographics", t)} 
          />
          <TagInput 
            label="Required Technology Signals (Keywords)" 
            placeholder="e.g. LiDAR, computer vision, ROS"
            tags={icp.company.technologySignals || []} 
            setTags={(t) => updateCompany("technologySignals", t)} 
          />
          <TagInput 
            label="Disqualifying Keywords" 
            placeholder="e.g. toy robots, hobbyist"
            tags={icp.company.disqualifiers || []} 
            setTags={(t) => updateCompany("disqualifiers", t)} 
          />
        </div>

        {/* Vertical Stack: Roles & Outreach */}
        <div className="space-y-6">
          
          {/* Persona / Roles */}
          <div className="glass-card p-6 space-y-6">
            <h3 className="text-lg font-bold border-b border-slate-100 dark:border-gray-800 pb-3 mb-4 text-slate-800 dark:text-white">
              2. Target Personas (Job Titles)
            </h3>
            
            <TagInput 
              label="Primary Targets (High Priority)" 
              placeholder="e.g. CTO, VP Engineering"
              tags={icp.roles.primary || []} 
              setTags={(t) => updateRoles("primary", t)} 
            />
            <TagInput 
              label="Secondary Targets" 
              placeholder="e.g. Robotics Engineer, Lead"
              tags={icp.roles.secondary || []} 
              setTags={(t) => updateRoles("secondary", t)} 
            />
          </div>

          {/* Value Proposition */}
          <div className="glass-card p-6 space-y-6">
            <h3 className="text-lg font-bold border-b border-slate-100 dark:border-gray-800 pb-3 mb-4 text-slate-800 dark:text-white">
              3. Outreach Personalization
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Your Company Name</label>
                <input 
                  className="input" 
                  value={icp.valueProposition?.company || ""} 
                  onChange={e => updateVP("company", e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Your Website</label>
                <input 
                  className="input" 
                  value={icp.valueProposition?.website || ""} 
                  onChange={e => updateVP("website", e.target.value)} 
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">One-Sentence Tagline</label>
              <input 
                className="input" 
                value={icp.valueProposition?.tagline || ""} 
                onChange={e => updateVP("tagline", e.target.value)} 
              />
            </div>

            <TagInput 
              label="Target Use Cases" 
              placeholder="e.g. obstacle avoidance, mapping"
              tags={icp.valueProposition?.useCases || []} 
              setTags={(t) => updateVP("useCases", t)} 
            />
            
            <TagInput 
              label="Key Differentiators" 
              placeholder="e.g. highest accuracy in class, ISO certified"
              tags={icp.valueProposition?.differentiators || []} 
              setTags={(t) => updateVP("differentiators", t)} 
            />
          </div>
        </div>
      </div>
      
    </div>
  );
}
