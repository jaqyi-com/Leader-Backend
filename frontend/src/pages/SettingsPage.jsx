import { useState, useEffect } from "react";
import { resetState, getEnv, saveEnv } from "../api";
import { AlertCircle, Trash2, ShieldAlert, Key, Save, Loader2, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [envData, setEnvData] = useState({});
  const [loadingEnv, setLoadingEnv] = useState(true);
  const [savingEnv, setSavingEnv] = useState(false);
  const [showKeys, setShowKeys] = useState({});

  useEffect(() => {
    fetchEnv();
  }, []);

  const fetchEnv = async () => {
    try {
      const { data } = await getEnv();
      setEnvData(data || {});
    } catch (e) {
      toast.error("Failed to load credentials");
    } finally {
      setLoadingEnv(false);
    }
  };

  const handleEnvChange = (key, value) => {
    setEnvData(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveEnv = async () => {
    setSavingEnv(true);
    try {
      await saveEnv(envData);
      toast.success("Credentials saved successfully! (Some changes may require a server restart)");
    } catch (e) {
      toast.error("Failed to save credentials");
    } finally {
      setSavingEnv(false);
    }
  };

  const toggleVisibility = (key) => {
    setShowKeys(p => ({ ...p, [key]: !p[key] }));
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const { data } = await resetState();
      toast.success(data.message || "State reset successfully");
      setShowConfirm(false);
    } catch (e) {
      toast.error(e.response?.data?.error || "Failed to reset state");
    } finally {
      setLoading(false);
    }
  };

  const ENV_GROUPS = [
    { title: "OpenAI Config", keys: ["OPENAI_API_KEY", "OPENAI_MODEL"] },
    { title: "Apollo Data Enrichment", keys: ["APOLLO_API_KEY"] },
    { title: "SMTP Email Settings", keys: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_NAME", "SMTP_FROM_EMAIL"] },
    { title: "Google Places API", keys: ["GOOGLE_API_KEY"] },
    { title: "Database", keys: ["MONGO_URI"] },
  ];


  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Credentials Section */}
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 border-b border-slate-100 dark:border-gray-800 pb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-1">
              <Key className="text-brand-500" />
              Credentials & API Keys
            </h2>
            <p className="text-sm text-slate-500">Securely manage your integrations without leaving the dashboard.</p>
          </div>
          <button 
            onClick={handleSaveEnv} 
            disabled={savingEnv || loadingEnv}
            className="btn-primary"
          >
            {savingEnv ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Credentials
          </button>
        </div>

        {loadingEnv ? (
          <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-8">
            {ENV_GROUPS.map((group, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{group.title}</h3>
                <div className="grid grid-cols-1 gap-4 bg-slate-50 dark:bg-gray-900/40 p-5 rounded-2xl border border-slate-100 dark:border-gray-800">
                  {group.keys.map(key => {
                    const isSecret = key.includes("KEY") || key.includes("PASS") || key.includes("URI");

                    const isVisible = showKeys[key];
                    
                    return (
                      <div key={key}>
                        <label className="text-xs font-semibold text-slate-500 mb-1.5 block">{key}</label>
                        <div className="relative">
                          <input 
                            type={isSecret && !isVisible ? "password" : "text"}
                            className="input font-mono text-sm w-full pr-10"
                            value={envData[key] || ""}
                            onChange={e => handleEnvChange(key, e.target.value)}
                            placeholder={`Enter ${key}...`}
                          />

                          {isSecret && (
                            <button 
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              onClick={() => toggleVisibility(key)}
                            >
                              {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
          <ShieldAlert className="text-brand-500" />
          System Settings
        </h2>
        <p className="text-sm text-slate-500 mb-6">Manage global configuration for the Leader agent.</p>

        <div className="p-5 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-700 dark:text-red-400 font-bold mb-1">Danger Zone: Reset Memory</h3>
              <p className="text-sm text-red-600/80 dark:text-red-400/80 mb-4">
                This will clear the deduplication cache, meaning the agent will forget all previously 
                seen companies and contacts. It will re-scrape and re-email them if they match the ICP again.
              </p>
              
              {!showConfirm ? (
                <button 
                  onClick={() => setShowConfirm(true)}
                  className="btn-danger w-full sm:w-auto"
                >
                  <Trash2 size={16} /> Delete Deduplication Cache
                </button>
              ) : (
                <div className="p-4 rounded-xl bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 flex flex-col gap-3">
                  <p className="font-bold text-red-800 dark:text-red-300">Are you absolutely sure?</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleReset} 
                      disabled={loading}
                      className="btn-danger flex-1"
                    >
                      {loading ? "Deleting..." : "Yes, Reset Memories"}
                    </button>
                    <button 
                      onClick={() => setShowConfirm(false)}
                      disabled={loading}
                      className="btn-secondary flex-1"
                    >
                      Cancel
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
