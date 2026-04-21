import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Bot, Building2, UserCircle, Globe, Hash, ArrowRight, Loader, Target } from "lucide-react";
import toast from "react-hot-toast";
import { getAutonomousLeads, createAutonomousLead } from "../api";

export default function AutonomousAgentsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    company: "",
    website: "",
    contact_name: "",
    contact_role: "",
    notes: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await getAutonomousLeads();
      setLeads(res.data);
    } catch (e) {
      toast.error("Failed to load autonomous agents.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.company || !formData.website) {
      return toast.error("Company and Website are required.");
    }
    setIsSubmitting(true);
    try {
      const res = await createAutonomousLead(formData);
      toast.success("Agent dispatched!");
      setShowModal(false);
      navigate(`/app/autonomousagents/${res.data.lead.id}`);
    } catch (e) {
      toast.error("Failed to start agent.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex-1 h-full overflow-y-auto w-full no-scrollbar">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Bot className="text-brand-500" />
            Autonomous SDR Bot
          </h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-gray-400">
            Highly-personalized, 1-on-1 AI research and outreach.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm flex items-center gap-2"
        >
          <Plus size={16} /> Add a Target
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader className="animate-spin text-slate-300" size={32} />
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/20 text-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bot size={32} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No active agents</h2>
          <p className="text-slate-500 dark:text-gray-400 max-w-md mx-auto mb-6">
            Add a prospect here, and the SDR bot will read their website, build a dossier, and draft a hyper-personalized cold email.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-black text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm inline-flex items-center gap-2"
          >
            Start Your First Agent
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {leads.map((lead) => (
            <Link to={`/app/autonomousagents/${lead.id}`} key={lead.id}>
              <motion.div
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-6 shadow-sm cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-accent-cyan opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-gray-700 flex items-center justify-center text-slate-500 dark:text-gray-400 uppercase text-lg font-bold">
                      {lead.company ? lead.company.substring(0, 1) : "?"}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-base leading-tight">
                        {lead.company}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{lead.contact_name || "Unknown Target"}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300`}>
                    {lead.status.replace("_", " ")}
                  </span>
                </div>
                
                <div className="space-y-2 mt-5">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300">
                    <Globe size={14} className="text-slate-400" />
                    <span className="truncate">{lead.website || "No website"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300">
                    <UserCircle size={14} className="text-slate-400" />
                    <span className="truncate">{lead.contact_role || "No role specified"}</span>
                  </div>
                </div>

              </motion.div>
            </Link>
          ))}
        </div>
      )}

      {/* CREATE MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !isSubmitting && setShowModal(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg relative z-10 overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-slate-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Target size={18} className="text-brand-500" />
                Target a New Prospect
              </h3>
            </div>
            <form onSubmit={handleCreate} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider mb-2">Company Name *</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Acme Corp"
                    value={formData.company}
                    onChange={e => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider mb-2">Website URL *</label>
                  <input
                    required
                    type="url"
                    className="w-full bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="https://acmecorp.com"
                    value={formData.website}
                    onChange={e => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider mb-2">Contact Name</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Jane Doe"
                      value={formData.contact_name}
                      onChange={e => setFormData({ ...formData, contact_name: e.target.value })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider mb-2">Role/Title</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="VP of Engineering"
                      value={formData.contact_role}
                      onChange={e => setFormData({ ...formData, contact_role: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider mb-2">Targeting Notes</label>
                  <textarea
                    className="w-full bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 min-h-[80px]"
                    placeholder="Any specific context you want the AI to know?"
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-sm transition-all flex items-center gap-2"
                >
                  {isSubmitting ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                  Deploy Agent
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
