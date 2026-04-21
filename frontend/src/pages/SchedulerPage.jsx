import { useState, useEffect } from "react";
import { getSchedules, saveSchedule } from "../api";
import { Clock, Save, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const PHASES = [
  { id: "all", name: "Full Pipeline" },
  { id: "scrape", name: "1. Scrape" },
  { id: "enrich", name: "2. Enrich" },
  { id: "outreach", name: "3. Outreach" },
  { id: "score", name: "4. Score Leads" },
  { id: "report", name: "5. Report" },
];

export default function SchedulerPage() {
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const { data } = await getSchedules();
      // data: { all: { cron, enabled, active }, scrape: {...} }
      setSchedules(data);
    } catch (e) {
      toast.error("Failed to load schedules");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (phaseId) => {
    const s = schedules[phaseId];
    if (!s) return;
    setSaving(p => ({ ...p, [phaseId]: true }));
    try {
      const { data } = await saveSchedule(phaseId, s.cron, s.enabled);
      setSchedules(prev => ({ ...prev, [phaseId]: { ...data } }));
      toast.success(`${PHASES.find(p => p.id === phaseId).name} schedule saved!`);
    } catch (e) {
      toast.error(e.response?.data?.error || `Failed to save schedule`);
    } finally {
      setSaving(p => ({ ...p, [phaseId]: false }));
    }
  };

  const cronToTime = (cron) => {
    if (!cron) return "09:00";
    const parts = cron.split(" ");
    if (parts.length >= 2) {
      const min = parts[0].padStart(2, '0');
      const hr = parts[1].padStart(2, '0');
      if (!isNaN(min) && !isNaN(hr)) return `${hr}:${min}`;
    }
    return "09:00";
  };

  const timeToCron = (time) => {
    if (!time) return "0 9 * * *";
    const [hr, min] = time.split(":");
    return `${parseInt(min)} ${parseInt(hr)} * * *`;
  };

  const handleChange = (phaseId, field, value) => {
    setSchedules(prev => ({
      ...prev,
      [phaseId]: { ...prev[phaseId], [field]: value }
    }));
  };

  if (loading) return <div className="p-6">Loading schedules...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="p-6 glass-card border-l-4 border-l-brand-500">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
          <Clock className="text-brand-500" />
          Automation Scheduler
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Set up a daily schedule to run pipeline phases automatically. Simply pick the time and turn it on!
        </p>
      </div>

      <div className="space-y-4">
        {PHASES.map((phase) => {
          const s = schedules[phase.id] || { cron: "0 9 * * *", enabled: false, active: false };
          const isSaving = saving[phase.id];
          const timeValue = cronToTime(s.cron);

          return (
            <div key={phase.id} className="glass-card p-5 flex flex-col md:flex-row md:items-center gap-4">
              <div className="w-48 flex-shrink-0">
                <p className="font-semibold text-slate-900 dark:text-white">{phase.name}</p>
                {s.active ? (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 mt-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 inline-block">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 mt-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 inline-block">
                    Inactive
                  </span>
                )}
              </div>

              <div className="flex-1 flex items-center gap-6">
                <div className="flex-1 max-w-[140px]">
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Run Daily At</label>
                  <input 
                    type="time" 
                    className="input font-mono text-sm cursor-pointer" 
                    value={timeValue}
                    onChange={(e) => handleChange(phase.id, "cron", timeToCron(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Status</label>
                  <button 
                    onClick={() => handleChange(phase.id, "enabled", !s.enabled)}
                    className="p-1 rounded text-slate-500 hover:text-brand-500 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    title={s.enabled ? "Disable" : "Enable"}
                  >
                    {s.enabled ? <ToggleRight size={32} className="text-brand-500" /> : <ToggleLeft size={32} />}
                  </button>
                </div>
              </div>

              <div className="pt-5 md:pt-0">
                <button 
                  onClick={() => handleSave(phase.id)}
                  disabled={isSaving}
                  className="btn-primary w-full md:w-auto"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
