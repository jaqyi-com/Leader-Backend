import { useState, useEffect, useMemo } from "react";
import { getSheetsData } from "../api";
import { Loader2, Search, Filter, ArrowUpDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PRIORITIES = ["ALL", "HIGH", "MEDIUM", "LOW"];

export default function LeadsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const res = await getSheetsData();
        const leadsSheet = res.data["Lead Scores"];
        if (leadsSheet && leadsSheet.rows) {
          // Map array rows to objects based on headers
          const headers = leadsSheet.headers;
          const mapped = leadsSheet.rows.map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          });
          // Sort by Total Score descending
          mapped.sort((a, b) => Number(b["Total Score"] || 0) - Number(a["Total Score"] || 0));
          setData(mapped);
        } else {
          setData([]);
        }
      } catch (e) {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLeads();
  }, []);

  const uniqueSources = useMemo(() => {
    if (!data) return [];
    const sources = data
      .map(r => r["Source"] || "")
      .filter(s => s.trim() !== "");
    return [...new Set(sources)].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let result = data;
    if (filter !== "ALL") {
      result = result.filter(r => r["Priority"] === filter);
    }
    if (sourceFilter !== "ALL") {
      result = result.filter(r => r["Source"] === sourceFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r => 
        (r["Company Name"] || "").toLowerCase().includes(q) ||
        (r["Contact Name"] || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, filter, sourceFilter, search]);

  const getBadgeClass = (p) => {
    if (p === "HIGH") return "badge-high";
    if (p === "MEDIUM") return "badge-medium";
    return "badge-low";
  };

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center text-slate-500">
      <Loader2 size={32} className="animate-spin mb-4" />
      <p>Loading scored leads...</p>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex flex-col xl:flex-row justify-between gap-4 glass-card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              className="input pl-9" 
              placeholder="Search company or contact..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <select 
            value={sourceFilter} 
            onChange={e => setSourceFilter(e.target.value)}
            className="input w-full md:w-56 bg-white dark:bg-gray-800 text-sm"
          >
            <option value="ALL">All Campaigns / Sources</option>
            {uniqueSources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          <Filter size={16} className="text-slate-400 mr-2 shrink-0" />
          {PRIORITIES.map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === p 
                  ? "bg-slate-800 text-white shadow-md dark:bg-slate-200 dark:text-slate-900" 
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pb-6">
        <AnimatePresence>
          {filtered.map((lead, i) => {
            const score = Number(lead["Total Score"] || 0);
            return (
              <motion.div
                key={lead["Company ID"] + lead["Contact Name"] + i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="glass-card p-5 flex flex-col hover:shadow-xl hover:-translate-y-1 transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">
                      {lead["Company Name"] || "Unknown Company"}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {lead["Contact Name"]} • {lead["Title"]}
                    </p>
                  </div>
                  <span className={getBadgeClass(lead["Priority"])}>
                    {lead["Priority"]}
                  </span>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100 dark:border-gray-800">
                  <div className="flex justify-between text-xs mb-1.5 font-semibold text-slate-600 dark:text-slate-300">
                    <span>Lead Score</span>
                    <span>{score}/100</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        score >= 75 ? "bg-red-500" : score >= 50 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                    />
                  </div>
                  
                  <div className="flex justify-between text-[10px] text-slate-400 mt-3 uppercase font-semibold">
                    <span>Company: {lead["Company Score"] || 0}</span>
                    <span>Engagement: {lead["Engagement Score"] || 0}</span>
                    <span>Sentiment: {lead["Sentiment Score"] || 0}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500">
            No leads match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
