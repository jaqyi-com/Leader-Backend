import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Globe, UserCircle, Briefcase, FileText, CheckCircle2, Zap, Send, Target, Loader } from "lucide-react";
import toast from "react-hot-toast";
import { getAutonomousLead, runAutonomousResearch, runAutonomousOutreach } from "../api";

export default function AutonomousAgentDetailPage() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    fetchLead();
  }, [id]);

  const fetchLead = async () => {
    try {
      const res = await getAutonomousLead(id);
      setLead(res.data);
    } catch (e) {
      toast.error("Failed to load lead details.");
    } finally {
      setLoading(false);
    }
  };

  const handleResearch = async () => {
    setResearching(true);
    const renderToastId = toast.loading("AI is scanning the website and building a dossier...");
    try {
      const res = await runAutonomousResearch(id);
      setLead(res.data.lead);
      toast.success("Dossier created!", { id: renderToastId });
    } catch (e) {
      toast.error("Research failed.", { id: renderToastId });
    } finally {
      setResearching(false);
    }
  };

  const handleDraft = async () => {
    setDrafting(true);
    const renderToastId = toast.loading("AI SDR is drafting a hyper-personalized email...");
    try {
      const res = await runAutonomousOutreach(id);
      setLead(res.data.lead);
      toast.success("Email drafted!", { id: renderToastId });
    } catch (e) {
      toast.error("Outreach generation failed.", { id: renderToastId });
    } finally {
      setDrafting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="animate-spin text-slate-300" size={32} />
      </div>
    );
  }

  if (!lead) {
    return <div className="p-8 text-center text-slate-500">Lead not found</div>;
  }

  const { status, dossier, draft } = lead;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto flex-1 h-full overflow-y-auto no-scrollbar">
      {/* Header */}
      <div className="mb-8">
        <Link to="/autonomousagents" className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Agents
        </Link>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-brand-400 to-accent-cyan flex flex-col items-center justify-center text-white shadow-glow">
              <span className="text-2xl font-bold font-serif">{lead.company.charAt(0)}</span>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                {lead.company}
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400`}>
                  {status.replace("_", " ")}
                </span>
              </h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-slate-500 dark:text-gray-400">
                <span className="flex items-center gap-1.5"><Globe size={14} /> {lead.website || "No site"}</span>
                <span className="flex items-center gap-1.5"><UserCircle size={14} /> {lead.contact_name || "Unknown"} ({lead.contact_role || "?"})</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {status === "new" && (
              <button
                onClick={handleResearch}
                disabled={researching}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm flex items-center gap-2 max-h-[44px]"
              >
                {researching ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
                Run Research
              </button>
            )}
            {status === "researched" && (
              <button
                onClick={handleDraft}
                disabled={drafting}
                className="bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-black text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm flex items-center gap-2 max-h-[44px]"
              >
                {drafting ? <Loader size={16} className="animate-spin" /> : <Zap size={16} />}
                Draft Outreach
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Dossier */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                <Briefcase size={16} className="text-brand-500" />
                Intelligence Dossier
              </h2>
              {dossier && (
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                  <Target size={12} />
                  ICP Score: {dossier.icp_score}/100
                </div>
              )}
            </div>
            <div className="p-5">
              {!dossier && status === "new" ? (
                <div className="text-center py-10 opacity-60">
                  <Target size={32} className="mx-auto mb-3 text-slate-400" />
                  <p className="text-sm font-medium text-slate-800 dark:text-gray-300">No data collected yet</p>
                  <p className="text-xs text-slate-500 mt-1">Run Research to scan their website and extract buying signals.</p>
                </div>
              ) : !dossier && researching ? (
                <div className="text-center py-10">
                  <Loader size={32} className="mx-auto mb-3 animate-spin text-brand-500" />
                  <p className="text-sm font-medium text-brand-600 animate-pulse">Extracting intelligence...</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Company Summary</h4>
                    <p className="text-sm text-slate-700 dark:text-gray-300 leading-relaxed font-serif tracking-wide">{dossier?.summary || "No dossier summary available"}</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Likely Pain Points</h4>
                    <ul className="space-y-1.5">
                      {dossier?.pain_points?.map((p, i) => (
                        <li key={i} className="text-sm text-slate-600 dark:text-gray-400 flex items-start gap-2">
                          <CheckCircle2 size={14} className="text-brand-500 mt-0.5 flex-shrink-0" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Technology Signals</h4>
                    <div className="flex flex-wrap gap-2">
                      {dossier?.tech_stack?.length > 0 ? (
                        dossier.tech_stack.map((t, i) => (
                          <span key={i} className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200 rounded-lg">
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">None detected</span>
                      )}
                    </div>
                  </div>
                  {dossier?.recent_news && (
                    <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-500/20">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400 mb-1">Recent Catalyst</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">{dossier.recent_news}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Draft Email */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden shadow-sm flex flex-col h-full">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                <FileText size={16} className="text-violet-500" />
                AI Outreach Draft
              </h2>
            </div>
            <div className="p-5 flex-1 flex flex-col">
              {!draft && (status === "new" || status === "researching") ? (
                <div className="text-center py-10 opacity-60 my-auto">
                  <FileText size={32} className="mx-auto mb-3 text-slate-400" />
                  <p className="text-sm font-medium text-slate-800 dark:text-gray-300">Awaiting Research</p>
                  <p className="text-xs text-slate-500 mt-1">Dossier required before drafting.</p>
                </div>
              ) : !draft && status === "researched" && !drafting ? (
                <div className="text-center py-10 my-auto">
                  <div className="w-12 h-12 bg-violet-50 dark:bg-violet-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Zap size={20} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-800 dark:text-gray-200 mb-4 max-w-xs mx-auto">
                    Dossier loaded. Ready to draft a hyper-personalized, 4-line cold email for this target?
                  </p>
                  <button
                    onClick={handleDraft}
                    className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-all"
                  >
                    Generate Initial Email
                  </button>
                </div>
              ) : !draft && drafting ? (
                <div className="text-center py-10 my-auto">
                  <Loader size={32} className="mx-auto mb-3 animate-spin text-violet-500" />
                  <p className="text-sm font-medium text-violet-600 animate-pulse">Drafting perfect message...</p>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="bg-slate-50 dark:bg-gray-900/50 rounded-xl border border-slate-100 dark:border-gray-700 overflow-hidden flex-1 flex flex-col">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-700 text-sm">
                      <div className="flex gap-2 mb-1">
                        <span className="text-slate-400 w-16">To:</span> 
                        <span className="text-slate-900 dark:text-white font-medium">{lead.contact_name || "Lead"} at {lead.company}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-slate-400 w-16">Subject:</span> 
                        <span className="text-slate-900 dark:text-white font-semibold">{draft?.subject || "No Subject"}</span>
                      </div>
                    </div>
                    <div className="p-4 flex-1">
                      <div className="text-sm text-slate-700 dark:text-gray-300 whitespace-pre-wrap font-serif leading-relaxed">
                        {draft?.body || "Generating email draft..."}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm flex items-center gap-2">
                      <Send size={16} /> Mark as Ready to Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
