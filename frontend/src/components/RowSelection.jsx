// Selective export for the data tables: checkbox column, selection bar and the Export menu.
// Used with useRowSelection (selection state) and csv.js (the file).
import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, CheckSquare, X, FileDown } from "lucide-react";
import toast from "react-hot-toast";
import { downloadCsv, csvName } from "../csv";

const BOX = "w-3.5 h-3.5 cursor-pointer align-middle accent-[var(--accent)]";

/** Header checkbox: ticks / clears every row on this page; half-ticked when some are selected. */
export function SelectAllCheckbox({ selection, pageRows }) {
  const ref = useRef(null);
  const state = selection.pageState(pageRows);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "some"; }, [state]);
  return (
    <th className="w-9 pl-3 pr-1 py-3 text-left">
      <input
        ref={ref}
        type="checkbox"
        className={BOX}
        aria-label="Select all rows on this page"
        checked={state === "all"}
        disabled={!pageRows.length}
        onChange={() => selection.setRows(pageRows, state !== "all")}
      />
    </th>
  );
}

/** Row checkbox (Shift-click selects a range). */
export function RowCheckbox({ selection, pageRows, index }) {
  const row = pageRows[index];
  return (
    <td className="w-9 pl-3 pr-1 py-2.5">
      <input
        type="checkbox"
        className={BOX}
        aria-label={`Select row ${index + 1}`}
        checked={selection.isSelected(row)}
        onChange={() => {}}
        onClick={(e) => selection.toggle(pageRows, index, e.shiftKey)}
      />
    </td>
  );
}

/** The selected rows' background. */
export const selectedRowStyle = (selection, row) =>
  selection.isSelected(row) ? { background: "rgba(226,55,68,0.06)" } : undefined;

function exportRows(base, what, cols, rows) {
  const n = downloadCsv(csvName(base, what), cols, rows);
  if (n) toast.success(`Downloaded ${n.toLocaleString()} ${n === 1 ? "row" : "rows"}`);
}

/**
 * Export button with a menu: the selected rows, or every row on this page.
 * base: file name start ("companies", "people", …).
 */
export function ExportMenu({ selection, cols, pageRows, base }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const n = selection.count;
  const pick = (what) => {
    setOpen(false);
    if (what === "selected") exportRows(base, "selected", cols, selection.rows);
    else exportRows(base, "page", cols, pageRows);
  };
  const Item = ({ what, label, count, disabled, hint }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => pick(what)}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded-md hover:bg-[var(--surface-3)] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <FileDown size={13} className="text-[var(--text-3)]" />
      <span className="flex-1">
        <span className="block text-[var(--text)] font-medium">{label}</span>
        {hint && <span className="block text-[10px] text-[var(--text-3)]">{hint}</span>}
      </span>
      <span className="tabular-nums text-[var(--text-3)]">{count.toLocaleString()}</span>
    </button>
  );

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!pageRows.length && !n}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-ghost text-xs gap-1.5"
      >
        <Download size={13} />
        {n ? `Export (${n.toLocaleString()} selected)` : "Export CSV"}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 z-30 w-64 p-1 rounded-xl shadow-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Item what="selected" label="Selected rows" count={n} disabled={!n}
            hint={n ? "Rows you ticked, from any page" : "Tick rows in the table first"} />
          <Item what="page" label="All rows on this page" count={pageRows.length} disabled={!pageRows.length} />
        </div>
      )}
    </div>
  );
}

/** Bar above the table while rows are selected. */
export function SelectionBar({ selection, cols, pageRows, base }) {
  const n = selection.count;
  if (!n) return null;
  const onPage = selection.countOn(pageRows);
  const allOnPage = onPage === pageRows.length;
  return (
    <div role="region" aria-label="Selected rows" aria-live="polite" className="flex items-center gap-3 flex-wrap px-4 py-2 rounded-xl text-xs"
      style={{ background: "rgba(226,55,68,0.08)", border: "1px solid rgba(226,55,68,0.25)" }}>
      <CheckSquare size={14} style={{ color: "var(--accent)" }} />
      <span className="text-[var(--text)]">
        <strong>{n.toLocaleString()}</strong> {n === 1 ? "row" : "rows"} selected
        {n !== onPage && <span className="text-[var(--text-3)]"> ({onPage} on this page)</span>}
      </span>
      {!allOnPage && pageRows.length > 0 && (
        <button type="button" onClick={() => selection.setRows(pageRows, true)} className="font-semibold cursor-pointer" style={{ color: "var(--accent)" }}>
          Select all {pageRows.length} on this page
        </button>
      )}
      <div className="flex-1" />
      <button type="button" onClick={() => exportRows(base, "selected", cols, selection.rows)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white cursor-pointer" style={{ background: "var(--accent)" }}>
        <Download size={12} />Export selected
      </button>
      <button type="button" onClick={selection.clear} className="flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer">
        <X size={12} />Clear
      </button>
    </div>
  );
}
