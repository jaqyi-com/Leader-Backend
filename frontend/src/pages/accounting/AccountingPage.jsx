import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BookOpen, Plus, Loader2, ArrowUpRight, ArrowDownLeft,
  IndianRupee, TrendingUp, TrendingDown, FileText, Filter,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getLedgerGroups, getLedgers, createLedger, createLedgerGroup,
  getVouchers, createVoucher, getTrialBalance, getProfitLoss, getBalanceSheet,
} from "../../api/accounting";

const TABS = ["ledgers", "vouchers", "trial_balance", "profit_loss", "balance_sheet"];
const TAB_LABELS = { ledgers: "Ledgers", vouchers: "Vouchers", trial_balance: "Trial Balance", profit_loss: "Profit & Loss", balance_sheet: "Balance Sheet" };

const VOUCHER_TYPES = ["payment", "receipt", "journal", "contra", "sales", "purchase"];
const NATURE_COLORS = { assets: "#3b82f6", liabilities: "#f59e0b", income: "#22c55e", expenses: "#ef4444" };

const fmt = (v) => `₹${Math.abs(v || 0).toLocaleString("en-IN")}`;

export default function AccountingPage() {
  const [tab, setTab] = useState("ledgers");
  const [groups, setGroups] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [trialBalance, setTrialBalance] = useState(null);
  const [pl, setPl] = useState(null);
  const [bs, setBs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddLedger, setShowAddLedger] = useState(false);
  const [showAddVoucher, setShowAddVoucher] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [g, l] = await Promise.all([getLedgerGroups(), getLedgers()]);
      setGroups(g.data.groups || []);
      setLedgers(l.data.ledgers || []);
    } catch { toast.error("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (tab === "vouchers") getVouchers().then(r => setVouchers(r.data.vouchers || [])).catch(() => {});
    if (tab === "trial_balance") getTrialBalance().then(r => setTrialBalance(r.data)).catch(() => {});
    if (tab === "profit_loss") getProfitLoss().then(r => setPl(r.data)).catch(() => {});
    if (tab === "balance_sheet") getBalanceSheet().then(r => setBs(r.data)).catch(() => {});
  }, [tab]);

  const handleCreateLedger = async (data) => {
    try {
      await createLedger(data);
      toast.success("Ledger created");
      setShowAddLedger(false);
      load();
    } catch { toast.error("Failed"); }
  };

  const handleCreateVoucher = async (data) => {
    try {
      await createVoucher(data);
      toast.success("Voucher created");
      setShowAddVoucher(false);
      getVouchers().then(r => setVouchers(r.data.vouchers || []));
    } catch { toast.error("Failed"); }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Accounting</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Chart of Accounts, Vouchers & Financial Reports</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "ledgers" && <button onClick={() => setShowAddLedger(true)} className="btn-primary" style={{ gap: 6, fontSize: 13 }}><Plus size={14} /> New Ledger</button>}
          {tab === "vouchers" && <button onClick={() => setShowAddVoucher(true)} className="btn-primary" style={{ gap: 6, fontSize: 13 }}><Plus size={14} /> New Voucher</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "none", border: "none", borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            color: tab === t ? "var(--accent)" : "var(--text-3)",
          }}>{TAB_LABELS[t]}</button>
        ))}
      </div>

      {loading && tab === "ledgers" ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Loader2 size={24} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} /></div>
      ) : (
        <>
          {tab === "ledgers" && (
            <>
              {showAddLedger && <LedgerForm groups={groups} onSubmit={handleCreateLedger} onCancel={() => setShowAddLedger(false)} />}
              <LedgerList ledgers={ledgers} groups={groups} />
            </>
          )}
          {tab === "vouchers" && (
            <>
              {showAddVoucher && <VoucherForm ledgers={ledgers} onSubmit={handleCreateVoucher} onCancel={() => setShowAddVoucher(false)} />}
              <VoucherList vouchers={vouchers} />
            </>
          )}
          {tab === "trial_balance" && trialBalance && <TrialBalanceView data={trialBalance} />}
          {tab === "profit_loss" && pl && <ProfitLossView data={pl} />}
          {tab === "balance_sheet" && bs && <BalanceSheetView data={bs} />}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function LedgerList({ ledgers, groups }) {
  const grouped = {};
  ledgers.forEach(l => { const gn = groups.find(g => g._id === l.groupId)?.name || "Ungrouped"; (grouped[gn] = grouped[gn] || []).push(l); });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {Object.entries(grouped).map(([gName, items]) => (
        <div key={gName}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", marginBottom: 8 }}>{gName}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map(l => (
              <div key={l._id} className="card" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: NATURE_COLORS[l.nature] || "#94a3b8" }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{l.name}</span>
                <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>{l.linkedType}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: (l.currentBalance || 0) >= 0 ? "var(--text)" : "#ef4444" }}>
                  {fmt(l.currentBalance)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {ledgers.length === 0 && <p style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>No ledgers yet. Create your first ledger to get started.</p>}
    </div>
  );
}

function VoucherList({ vouchers }) {
  const typeColors = { payment: "#ef4444", receipt: "#22c55e", journal: "#8b5cf6", contra: "#f59e0b", sales: "#3b82f6", purchase: "#f97316" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {vouchers.map((v, i) => (
        <motion.div key={v._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
          className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${typeColors[v.type] || "#94a3b8"}15` }}>
            {v.type === "receipt" ? <ArrowDownLeft size={16} style={{ color: "#22c55e" }} /> : <ArrowUpRight size={16} style={{ color: typeColors[v.type] }} />}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{v.voucherNumber}</span>
            <p style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 0" }}>{v.narration || "—"}</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${typeColors[v.type]}15`, color: typeColors[v.type], textTransform: "uppercase" }}>{v.type}</span>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>{new Date(v.date).toLocaleDateString("en-IN")}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", minWidth: 80, textAlign: "right" }}>{fmt(v.totalDebit)}</span>
        </motion.div>
      ))}
      {vouchers.length === 0 && <p style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>No vouchers yet.</p>}
    </div>
  );
}

function TrialBalanceView({ data }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Trial Balance</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: "2px solid var(--border)" }}>
          <th style={{ textAlign: "left", padding: 8, color: "var(--text-2)" }}>Ledger</th>
          <th style={{ textAlign: "left", padding: 8, color: "var(--text-2)" }}>Group</th>
          <th style={{ textAlign: "right", padding: 8, color: "var(--text-2)" }}>Debit (₹)</th>
          <th style={{ textAlign: "right", padding: 8, color: "var(--text-2)" }}>Credit (₹)</th>
        </tr></thead>
        <tbody>
          {(data.rows || []).map(r => (
            <tr key={r.ledgerId} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 8, color: "var(--text)" }}>{r.name}</td>
              <td style={{ padding: 8, color: "var(--text-3)" }}>{r.group}</td>
              <td style={{ padding: 8, textAlign: "right", color: "var(--text)", fontWeight: 600 }}>{r.debit > 0 ? fmt(r.debit) : ""}</td>
              <td style={{ padding: 8, textAlign: "right", color: "var(--text)", fontWeight: 600 }}>{r.credit > 0 ? fmt(r.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr style={{ borderTop: "2px solid var(--accent)" }}>
          <td colSpan={2} style={{ padding: 8, fontWeight: 800, color: "var(--text)" }}>Total</td>
          <td style={{ padding: 8, textAlign: "right", fontWeight: 800, color: "var(--text)" }}>{fmt(data.totalDebit)}</td>
          <td style={{ padding: 8, textAlign: "right", fontWeight: 800, color: "var(--text)" }}>{fmt(data.totalCredit)}</td>
        </tr></tfoot>
      </table>
    </div>
  );
}

function ProfitLossView({ data }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><TrendingUp size={14} /> Income</h3>
        {(data.income || []).map(l => (
          <div key={l._id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
            <span style={{ color: "var(--text)" }}>{l.name}</span><span style={{ fontWeight: 600, color: "var(--text)" }}>{fmt(l.currentBalance)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 14, fontWeight: 800, color: "#22c55e" }}>
          <span>Total Income</span><span>{fmt(data.totalIncome)}</span>
        </div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#ef4444", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><TrendingDown size={14} /> Expenses</h3>
        {(data.expenses || []).map(l => (
          <div key={l._id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
            <span style={{ color: "var(--text)" }}>{l.name}</span><span style={{ fontWeight: 600, color: "var(--text)" }}>{fmt(l.currentBalance)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 14, fontWeight: 800, color: "#ef4444" }}>
          <span>Total Expenses</span><span>{fmt(data.totalExpenses)}</span>
        </div>
      </div>
      <div className="card" style={{ padding: 20, gridColumn: "1 / -1", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 4px" }}>Net Profit / Loss</p>
        <p style={{ fontSize: 32, fontWeight: 800, color: (data.netProfit || 0) >= 0 ? "#22c55e" : "#ef4444", margin: 0 }}>
          {(data.netProfit || 0) >= 0 ? "+" : "-"}{fmt(data.netProfit)}
        </p>
      </div>
    </div>
  );
}

function BalanceSheetView({ data }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6", marginBottom: 12 }}>Assets</h3>
        {(data.assets || []).map(l => (
          <div key={l._id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
            <span style={{ color: "var(--text)" }}>{l.name}</span><span style={{ fontWeight: 600, color: "var(--text)" }}>{fmt(l.currentBalance)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 14, fontWeight: 800, color: "#3b82f6" }}>
          <span>Total Assets</span><span>{fmt(data.totalAssets)}</span>
        </div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b", marginBottom: 12 }}>Liabilities</h3>
        {(data.liabilities || []).map(l => (
          <div key={l._id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
            <span style={{ color: "var(--text)" }}>{l.name}</span><span style={{ fontWeight: 600, color: "var(--text)" }}>{fmt(l.currentBalance)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 14, fontWeight: 800, color: "#f59e0b" }}>
          <span>Total Liabilities</span><span>{fmt(data.totalLiabilities)}</span>
        </div>
      </div>
    </div>
  );
}

function LedgerForm({ groups, onSubmit, onCancel }) {
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?._id || "");
  const [linkedType, setLinkedType] = useState("general");
  const [openingBalance, setOpeningBalance] = useState(0);
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>New Ledger</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <input placeholder="Ledger Name *" value={name} onChange={e => setName(e.target.value)} autoFocus
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
        <select value={groupId} onChange={e => setGroupId(e.target.value)}
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}>
          {groups.map(g => <option key={g._id} value={g._id}>{g.name} ({g.nature})</option>)}
        </select>
        <select value={linkedType} onChange={e => setLinkedType(e.target.value)}
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}>
          {["general", "customer", "supplier", "bank", "cash", "tax"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="number" placeholder="Opening Balance" value={openingBalance} onChange={e => setOpeningBalance(Number(e.target.value))}
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
        <button onClick={() => name && onSubmit({ name, groupId, linkedType, openingBalance, currentBalance: openingBalance })} className="btn-primary" style={{ fontSize: 12 }}>Create</button>
      </div>
    </div>
  );
}

function VoucherForm({ ledgers, onSubmit, onCancel }) {
  const [type, setType] = useState("payment");
  const [narration, setNarration] = useState("");
  const [entries, setEntries] = useState([{ ledgerId: ledgers[0]?._id || "", debit: 0, credit: 0 }, { ledgerId: ledgers[1]?._id || ledgers[0]?._id || "", debit: 0, credit: 0 }]);

  const updateEntry = (i, field, val) => { const next = [...entries]; next[i] = { ...next[i], [field]: val }; setEntries(next); };
  const addEntry = () => setEntries([...entries, { ledgerId: ledgers[0]?._id || "", debit: 0, credit: 0 }]);
  const totalDebit = entries.reduce((a, e) => a + (Number(e.debit) || 0), 0);
  const totalCredit = entries.reduce((a, e) => a + (Number(e.credit) || 0), 0);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>New Voucher</h4>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {VOUCHER_TYPES.map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            padding: "5px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer", textTransform: "capitalize",
            border: type === t ? "1px solid var(--accent)" : "1px solid var(--border)",
            background: type === t ? "rgba(226,55,68,0.08)" : "var(--surface-3)",
            color: type === t ? "var(--accent)" : "var(--text-3)", fontWeight: 600,
          }}>{t}</button>
        ))}
      </div>
      {entries.map((e, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <select value={e.ledgerId} onChange={ev => updateEntry(i, "ledgerId", ev.target.value)}
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text)", outline: "none" }}>
            {ledgers.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
          <input type="number" placeholder="Debit" value={e.debit} onChange={ev => updateEntry(i, "debit", ev.target.value)}
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
          <input type="number" placeholder="Credit" value={e.credit} onChange={ev => updateEntry(i, "credit", ev.target.value)}
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text)", outline: "none" }} />
        </div>
      ))}
      <button onClick={addEntry} style={{ background: "none", border: "1px dashed var(--border)", borderRadius: 8, padding: "5px 12px", fontSize: 11, color: "var(--text-3)", cursor: "pointer", marginBottom: 8 }}>+ Add Entry</button>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: "var(--text-2)" }}>Dr: {fmt(totalDebit)}</span>
        <span style={{ color: "var(--text-2)" }}>Cr: {fmt(totalCredit)}</span>
        {totalDebit !== totalCredit && <span style={{ color: "#ef4444", fontWeight: 600 }}>Not balanced!</span>}
      </div>
      <input placeholder="Narration / Description" value={narration} onChange={e => setNarration(e.target.value)}
        style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
        <button onClick={() => totalDebit === totalCredit && totalDebit > 0 && onSubmit({ type, narration, entries: entries.map(e => ({ ...e, debit: Number(e.debit), credit: Number(e.credit), ledgerName: ledgers.find(l => l._id === e.ledgerId)?.name })) })}
          disabled={totalDebit !== totalCredit || totalDebit === 0} className="btn-primary" style={{ fontSize: 12 }}>Create Voucher</button>
      </div>
    </div>
  );
}
