// Row selection for the data tables. Selected rows are kept while the user pages, sorts or
// changes filters (a basket built across searches) and are only cleared by "Clear", by leaving the
// page, or when `resetKey` changes (e.g. Emails / Numbers switching between people and companies,
// whose columns differ).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// API rows carry no id (uuid is not returned), so a row is identified by its content.
export const rowKey = (r) => (r && (r.uuid || r.id)) || JSON.stringify(r);

export default function useRowSelection(resetKey) {
  const [selected, setSelected] = useState(() => new Map()); // key → row, in the order picked
  const lastIndex = useRef(null);

  useEffect(() => { setSelected(new Map()); lastIndex.current = null; }, [resetKey]);

  const isSelected = useCallback((r) => selected.has(rowKey(r)), [selected]);

  /** Set rows on or off. */
  const setRows = useCallback((rows, on) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        const k = rowKey(r);
        if (on) { if (!next.has(k)) next.set(k, r); } else next.delete(k);
      }
      return next;
    });
  }, []);

  /** Checkbox click on row `index` of `pageRows`; Shift-click selects / clears the whole range. */
  const toggle = useCallback((pageRows, index, shiftKey = false) => {
    const row = pageRows[index];
    const on = !selected.has(rowKey(row));
    if (shiftKey && lastIndex.current !== null && lastIndex.current < pageRows.length) {
      const [a, b] = [Math.min(lastIndex.current, index), Math.max(lastIndex.current, index)];
      setRows(pageRows.slice(a, b + 1), on);
    } else {
      setRows([row], on);
    }
    lastIndex.current = index;
  }, [selected, setRows]);

  const clear = useCallback(() => { setSelected(new Map()); lastIndex.current = null; }, []);

  const rows = useMemo(() => [...selected.values()], [selected]);

  /** How many of these page rows are selected: "none" | "some" | "all". */
  const pageState = useCallback((pageRows) => {
    if (!pageRows.length) return "none";
    const n = pageRows.reduce((s, r) => s + (selected.has(rowKey(r)) ? 1 : 0), 0);
    return n === 0 ? "none" : n === pageRows.length ? "all" : "some";
  }, [selected]);

  const countOn = useCallback((pageRows) => pageRows.reduce((s, r) => s + (selected.has(rowKey(r)) ? 1 : 0), 0), [selected]);

  return { count: selected.size, rows, isSelected, toggle, setRows, clear, pageState, countOn };
}
