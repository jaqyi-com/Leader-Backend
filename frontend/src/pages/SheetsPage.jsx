import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSheetsData, deleteSheetRow, clearSheet,
  listScrapeRuns, getScrapeRunData,
} from "../api";
import {
  FileSpreadsheet, Download, Loader2, Search, Trash2,
  AlertTriangle, ExternalLink, ChevronRight, Clock, FileText,
  Table2, X,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Export helpers ───────────────────────────────────────────────────────────
function exportCSV(headers, rows, filename) {
  const lines = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportXLSX(headers, rows, sheetName, filename) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

function exportPDF(headers, rows, title, filename) {
  // Truncate extremely long strings to prevent column squishing
  const safeRows = rows.map(row => 
    row.map(cell => {
      const str = String(cell ?? "");
      return str.length > 80 ? str.slice(0, 77) + "..." : str;
    })
  );

  // Use a3 landscape for wide tables to give more breathing room
  const doc = new jsPDF({ 
    orientation: headers.length > 5 ? "landscape" : "portrait",
    format: headers.length > 8 ? "a3" : "a4"
  });
  
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Exported ${new Date().toLocaleString()}`, 14, 22);
  
  autoTable(doc, {
    head: [headers],
    body: safeRows,
    startY: 26,
    styles: { 
      fontSize: 6, 
      cellPadding: 1.5,
      overflow: 'linebreak',
      valign: 'top'
    },
    headStyles: { fillColor: [99, 102, 241], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(filename);
}

// ── Export Button Group ──────────────────────────────────────────────────────
function ExportButtons({ headers, rows, name }) {
  if (!rows || rows.length === 0) return null;
  const safe = name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 font-medium hidden sm:block">Export:</span>
      {[
        { label: "CSV",  onClick: () => exportCSV(headers, rows, `${safe}.csv`) },
        { label: "XLSX", onClick: () => exportXLSX(headers, rows, name, `${safe}.xlsx`) },
        { label: "PDF",  onClick: () => exportPDF(headers, rows, name, `${safe}.pdf`) },
      ].map(({ label, onClick }) => (
        <button key={label} onClick={onClick}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-600 dark:hover:text-brand-400 transition-colors border border-slate-200 dark:border-gray-700">
          <Download size={11} /> {label}
        </button>
      ))}
    </div>
  );
}

// ── Data Table ───────────────────────────────────────────────────────────────
function DataTable({ headers, rows, onDeleteRow, deletingRow }) {
  if (!headers || headers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 text-slate-400 dark:text-slate-500 text-sm">
        This sheet is currently empty.
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto relative">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-slate-50 dark:bg-gray-900 sticky top-0 z-10 shadow-sm">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-b border-slate-200 dark:border-gray-800 text-xs">{h}</th>
            ))}
            {onDeleteRow && <th className="px-4 py-3 border-b border-slate-200 dark:border-gray-800 w-12" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="group hover:bg-red-50/40 dark:hover:bg-red-900/10 border-b border-slate-100 dark:border-gray-800/60 transition-colors">
              {headers.map((_, cIdx) => {
                const val = row[cIdx];
                const isUrl = typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"));
                return (
                  <td key={cIdx} className="px-4 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate text-xs" title={val}>
                    {isUrl ? (
                      <a href={val} target="_blank" rel="noopener noreferrer" 
                        className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 transition-colors">
                        {val}
                        <ExternalLink size={10} className="shrink-0" />
                      </a>
                    ) : (val || "—")}
                  </td>
                );
              })}
              {onDeleteRow && (
                <td className="px-3 py-2 text-right">
                  <button onClick={() => onDeleteRow(rIdx)} disabled={deletingRow !== null} title="Delete row"
                    className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all disabled:pointer-events-none">
                    {deletingRow === rIdx ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="text-center p-8 text-slate-400 text-sm">No matching rows found.</div>}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function SheetsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("Companies");
  const [search, setSearch] = useState("");
  const [deletingRow, setDeletingRow] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Scrape run history
  const [scrapeRuns, setScrapeRuns] = useState([]);
  const [scrapeRunsLoading, setScrapeRunsLoading] = useState(false);
  const [activeRunTab, setActiveRunTab] = useState(null); // null = main sheets view
  const [runData, setRunData] = useState(null);
  const [runDataLoading, setRunDataLoading] = useState(false);
  const [runSearch, setRunSearch] = useState("");
  

  const fetchSheets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getSheetsData();
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to load data from MongoDB.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchScrapeRuns = useCallback(async () => {
    setScrapeRunsLoading(true);
    try {
      const res = await listScrapeRuns();
      setScrapeRuns(res.data.runs || []);
    } catch {
      setScrapeRuns([]);
    } finally {
      setScrapeRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSheets();
    fetchScrapeRuns();
  }, [fetchSheets, fetchScrapeRuns]);

  // Load data for a specific run tab
  const openRunTab = async (tabName) => {
    setActiveRunTab(tabName);
    setRunSearch("");
    setRunDataLoading(true);
    try {
      const res = await getScrapeRunData(tabName);
      setRunData(res.data);
    } catch {
      setRunData({ headers: [], rows: [] });
    } finally {
      setRunDataLoading(false);
    }
  };

  const closeRunTab = () => { setActiveRunTab(null); setRunData(null); };

  const currentSheet = data?.[activeTab];

  const filteredRows = useMemo(() => {
    if (!currentSheet?.rows) return [];
    if (!search) return currentSheet.rows;
    const q = search.toLowerCase();
    return currentSheet.rows.filter(r => r.some(c => String(c).toLowerCase().includes(q)));
  }, [currentSheet, search]);

  const filteredRunRows = useMemo(() => {
    if (!runData?.rows) return [];
    if (!runSearch) return runData.rows;
    const q = runSearch.toLowerCase();
    return runData.rows.filter(r => r.some(c => String(c).toLowerCase().includes(q)));
  }, [runData, runSearch]);

  const handleDeleteRow = async (filteredRowIndex) => {
    if (deletingRow !== null) return;
    const rowToDelete = filteredRows[filteredRowIndex];
    const actualIndex = currentSheet.rows.indexOf(rowToDelete);
    if (actualIndex === -1) return;
    setDeletingRow(filteredRowIndex);
    try {
      await deleteSheetRow(activeTab, actualIndex);
      setData(prev => {
        const newRows = [...prev[activeTab].rows];
        newRows.splice(actualIndex, 1);
        return { ...prev, [activeTab]: { ...prev[activeTab], rows: newRows } };
      });
    } catch { toast.error("Failed to delete row"); }
    finally { setDeletingRow(null); }
  };

  const handleClearAll = async () => {
    setShowClearConfirm(false);
    setClearingAll(true);
    try {
      await clearSheet(activeTab);
      await fetchSheets();
    } catch { toast.error("Failed to clear sheet"); }
    finally { setClearingAll(false); }
  };

  // ── Loading / Error states ────────────────────────────────────────────────
  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center text-slate-500">
      <Loader2 size={32} className="animate-spin mb-4" />
      <p>Fetching data from MongoDB...</p>
    </div>
  );

  if (error) return (
    <div className="glass-card p-6 border-l-4 border-l-red-500">
      <h3 className="text-red-500 font-bold mb-2">Error Loading Data</h3>
      <p className="text-sm dark:text-slate-300">{error}</p>
    </div>
  );


  const dataRowCount = currentSheet?.rows?.length ?? 0;

  // ── Scrape Run Detail View ────────────────────────────────────────────────
  if (activeRunTab) {
    return (
      <div className="h-full flex flex-col gap-4">
        {/* Header */}
        <div className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={closeRunTab} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-medium">
              <ChevronRight size={14} className="rotate-180" /> Back to Sheets
            </button>
            <span className="text-slate-300 dark:text-gray-600">|</span>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-brand-500" />
              <span className="font-bold text-slate-800 dark:text-white text-sm">{activeRunTab}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" className="input pl-8 text-sm py-1.5 w-48" placeholder="Search..."
                value={runSearch} onChange={e => setRunSearch(e.target.value)} />
            </div>
            {runData && (
              <ExportButtons headers={runData.headers} rows={filteredRunRows} name={activeRunTab} />
            )}
          </div>
        </div>

        {/* Stats badge */}
        {runData && (
          <div className="flex items-center gap-3 flex-wrap px-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {filteredRunRows.length} companies
              {runSearch && ` (filtered from ${runData.rows.length})`}
            </span>
          </div>
        )}

        {/* Table */}
        <div className="glass-card flex-1 overflow-hidden flex flex-col">
          {runDataLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-brand-500" />
            </div>
          ) : (
            <DataTable headers={runData?.headers || []} rows={filteredRunRows} />
          )}
        </div>
      </div>
    );
  }

  // ── Main View ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex gap-4">
      {/* Scrape History Sidebar */}
      <div className="w-60 shrink-0 flex flex-col gap-3">
        <div className="glass-card p-4 flex-1 flex flex-col gap-2 min-h-0">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-brand-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Run History</h3>
            {scrapeRunsLoading && <Loader2 size={12} className="animate-spin text-slate-400 ml-auto" />}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {scrapeRuns.length === 0 ? (
              <div className="text-xs text-slate-400 p-3 text-center leading-relaxed">
                No runs yet.<br />Run a phase from the <strong>Pipeline</strong> tab to get started.
              </div>
            ) : scrapeRuns.map((run) => (
              <button key={run.tabName} onClick={() => openRunTab(run.tabName)}
                className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-600 dark:hover:text-brand-400 transition-colors group border border-transparent hover:border-brand-200 dark:hover:border-brand-800">
                <FileText size={12} className="text-brand-400 shrink-0" />
                <span className="truncate flex-1">{run.tabName}</span>
                <ChevronRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
          <button onClick={fetchScrapeRuns} className="text-xs text-slate-400 hover:text-brand-600 transition-colors mt-1 flex items-center gap-1 self-center">
            Refresh list
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Clear confirm dialog */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="glass-card p-6 max-w-sm w-full mx-4 shadow-2xl border border-red-500/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-500/10 rounded-lg"><AlertTriangle size={20} className="text-red-500" /></div>
                <h3 className="font-bold text-lg dark:text-white">Clear All Data?</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                This will permanently delete all <strong>{dataRowCount}</strong> rows from <strong>{activeTab}</strong>. The header row is kept. This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                <button onClick={handleClearAll} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors flex items-center gap-2">
                  <Trash2 size={14} /> Yes, Clear All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top bar: tabs + actions */}
        <div className="glass-card p-3 flex flex-col gap-3">
          {/* Sheet tabs */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {["Companies", "Contacts", "Outreach Log", "Responses", "Lead Scores"].map(tab => (
              <button key={tab} onClick={() => { setActiveTab(tab); setSearch(""); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === tab ? "bg-brand-500 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300 dark:hover:bg-gray-700"}`}>
                <Table2 size={12} /> {tab}
              </button>
            ))}
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" className="input pl-8 text-sm py-1.5 w-48" placeholder={`Search ${activeTab}...`}
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <ExportButtons headers={currentSheet?.headers || []} rows={filteredRows} name={activeTab} />
            </div>
            <div className="flex items-center gap-2">
              {dataRowCount > 0 && (
                <button onClick={() => setShowClearConfirm(true)} disabled={clearingAll} title={`Clear all data in ${activeTab}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50">
                  {clearingAll ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Clear All
                </button>
              )}
            </div>
          </div>


          {/* Row count badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">
              {filteredRows.length} row{filteredRows.length !== 1 ? "s" : ""}
              {search && ` of ${dataRowCount} total`}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="glass-card flex-1 overflow-hidden flex flex-col">
          <DataTable
            headers={currentSheet?.headers || []}
            rows={filteredRows}
            onDeleteRow={handleDeleteRow}
            deletingRow={deletingRow}
          />
        </div>
      </div>
    </div>
  );
}
