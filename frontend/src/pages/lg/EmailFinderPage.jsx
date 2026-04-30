import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Search, Loader2, CheckCircle2, XCircle, Upload, Plus, Trash2, UserPlus, Info } from "lucide-react";
import { lgEmailFind, lgSaveLead } from "../../api";
import toast from "react-hot-toast";

function ConfidenceBadge({ score }) {
  if (!score) return null;
  const color = score >= 80 ? "text-[var(--emerald)]" : score >= 60 ? "text-amber-400" : "text-[var(--rose)]";
  return <span className={`text-xs font-bold ${color}`}>{score}% confidence</span>;
}

export default function EmailFinderPage() {
  const [mode, setMode] = useState("single"); // "single" | "bulk"
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [domain, setDomain]         = useState("");
  const [finding, setFinding]       = useState(false);
  const [result, setResult]         = useState(null);
  const [isMock, setIsMock]         = useState(false);

  // Bulk mode
  const [bulkRows, setBulkRows]     = useState([{ firstName: "", lastName: "", domain: "" }]);
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkRunning, setBulkRunning] = useState(false);

  const findSingle = async () => {
    if (!domain) { toast.error("Domain is required"); return; }
    setFinding(true); setResult(null);
    try {
      const { data } = await lgEmailFind({ firstName, lastName, domain });
      setResult(data);
      setIsMock(data.source === "mock");
      if (data.source === "mock") toast("Demo data shown. Add HUNTER_API_KEY for real results.", { icon: "ℹ️" });
    } catch (err) { toast.error(err.response?.data?.error || "Search failed"); }
    finally { setFinding(false); }
  };

  const runBulk = async () => {
    const valid = bulkRows.filter(r => r.domain);
    if (!valid.length) { toast.error("Add at least one row with a domain"); return; }
    setBulkRunning(true); setBulkResults([]);
    const results = [];
    for (const row of valid) {
      try {
        const { data } = await lgEmailFind(row);
        results.push({ ...row, ...data, ok: !!data.email });
      } catch {
        results.push({ ...row, ok: false, email: null });
      }
      setBulkResults([...results]);
    }
    setBulkRunning(false);
    toast.success(`Found ${results.filter(r => r.ok).length}/${valid.length} emails`);
  };

  const saveLead = async (r) => {
    try {
      await lgSaveLead({ email: r.email, firstName: r.firstName, lastName: r.lastName, fullName: `${r.firstName} ${r.lastName}`.trim(), companyDomain: r.domain, emailConfidence: r.confidence, emailVerified: r.verified, source: "email_finder", status: "new" });
      toast.success("Lead saved to database");
    } catch { toast.error("Save failed"); }
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Mail size={22} className="text-[var(--accent)]" /> Email Finder
        </h2>
        <p className="text-sm text-[var(--text-3)] mt-0.5">Find verified business emails from name + company domain</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-[var(--surface-2)] p-1 rounded-xl w-fit">
        {[["single", "Single Lookup"], ["bulk", "Bulk Mode"]].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === m ? "bg-[var(--accent)] text-white" : "text-[var(--text-2)] hover:text-[var(--text)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Mock notice */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-400">
        <Info size={13} className="mt-0.5 flex-shrink-0" />
        <span>Add <code className="bg-amber-500/20 px-1 rounded">HUNTER_API_KEY=your_key</code> to .env for real email lookup. Free at <a href="https://hunter.io" target="_blank" rel="noreferrer" className="underline">hunter.io</a> (25 searches/month free).</span>
      </div>

      {mode === "single" ? (
        <>
          <motion.div className="card p-5 space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1.5 block">First Name</label>
                <input className="input w-full text-sm" placeholder="John" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1.5 block">Last Name</label>
                <input className="input w-full text-sm" placeholder="Smith" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-1.5 block">Company Domain <span className="text-[var(--rose)]">*</span></label>
              <input className="input w-full text-sm" placeholder="stripe.com" value={domain} onChange={e => setDomain(e.target.value)}
                onKeyDown={e => e.key === "Enter" && findSingle()} />
              <p className="text-[11px] text-[var(--text-3)] mt-1">Enter domain without https:// (e.g. stripe.com)</p>
            </div>
            <button onClick={findSingle} disabled={finding || !domain}
              className="btn-primary w-full gap-2 py-2.5 text-sm font-bold disabled:opacity-40">
              {finding ? <><Loader2 size={15} className="animate-spin" /> Finding...</> : <><Search size={15} /> Find Email</>}
            </button>
          </motion.div>

          {result && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card p-5 space-y-3">
              {result.email ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {result.verified ? <CheckCircle2 size={18} className="text-[var(--emerald)]" /> : <Mail size={18} className="text-[var(--accent)]" />}
                      <span className="font-mono text-lg font-bold text-[var(--text)]">{result.email}</span>
                    </div>
                    <button onClick={() => saveLead({ ...result, firstName, lastName, domain })}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20">
                      <UserPlus size={12} /> Save Lead
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <ConfidenceBadge score={result.confidence} />
                    {result.verified && <span className="flex items-center gap-1 text-[var(--emerald)] text-xs"><CheckCircle2 size={11} /> Verified</span>}
                    {isMock && <span className="badge badge-amber text-[9px]">Demo data</span>}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-[var(--rose)]">
                  <XCircle size={18} /> <span className="text-sm">{result.message || "No email found for this contact."}</span>
                </div>
              )}
            </motion.div>
          )}
        </>
      ) : (
        <>
          <motion.div className="card p-5 space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">Bulk Rows</p>
            <div className="space-y-2">
              {bulkRows.map((row, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 items-center">
                  <input className="input text-sm" placeholder="First Name" value={row.firstName} onChange={e => setBulkRows(p => p.map((r, j) => j === i ? { ...r, firstName: e.target.value } : r))} />
                  <input className="input text-sm" placeholder="Last Name" value={row.lastName} onChange={e => setBulkRows(p => p.map((r, j) => j === i ? { ...r, lastName: e.target.value } : r))} />
                  <div className="flex gap-1">
                    <input className="input text-sm flex-1" placeholder="domain.com" value={row.domain} onChange={e => setBulkRows(p => p.map((r, j) => j === i ? { ...r, domain: e.target.value } : r))} />
                    <button onClick={() => setBulkRows(p => p.filter((_, j) => j !== i))} className="text-[var(--text-3)] hover:text-[var(--rose)] p-1.5"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setBulkRows(p => [...p, { firstName: "", lastName: "", domain: "" }])} className="btn-ghost text-xs gap-1"><Plus size={12} /> Add Row</button>
              <button onClick={runBulk} disabled={bulkRunning} className="btn-primary text-xs gap-1.5 ml-auto disabled:opacity-40">
                {bulkRunning ? <><Loader2 size={12} className="animate-spin" /> Running...</> : <><Search size={12} /> Find All Emails</>}
              </button>
            </div>
          </motion.div>

          {bulkResults.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  {["Name", "Domain", "Email Found", "Confidence", ""].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[var(--text-3)] font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {bulkResults.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                      <td className="px-4 py-2.5">{r.firstName} {r.lastName}</td>
                      <td className="px-4 py-2.5 text-[var(--text-3)]">{r.domain}</td>
                      <td className="px-4 py-2.5">
                        {r.email ? <span className="font-mono text-[var(--accent)]">{r.email}</span> : <span className="text-[var(--rose)]">Not found</span>}
                      </td>
                      <td className="px-4 py-2.5"><ConfidenceBadge score={r.confidence} /></td>
                      <td className="px-4 py-2.5">
                        {r.email && <button onClick={() => saveLead(r)} className="text-[var(--accent)] hover:underline text-[10px]">Save</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
