import { useState, useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";

// ── Operator definitions ────────────────────────────────────
const TEXT_OPS = [
  { value: "contains",    label: "contains" },
  { value: "equals",      label: "equals" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with",   label: "ends with" },
  { value: "not_empty",   label: "is not empty" },
  { value: "empty",       label: "is empty" },
];

const BOOL_OPS = [
  { value: "true",  label: "is true" },
  { value: "false", label: "is false" },
];

// Build the operator list for a given column type
function getOps(colType) {
  if (colType === "bool") return BOOL_OPS;
  return TEXT_OPS;
}

// Whether this operator needs a value input
function needsValue(op) {
  return op !== "not_empty" && op !== "empty" && op !== "true" && op !== "false";
}

// ── Column Dropdown ─────────────────────────────────────────
function ColDropdown({ columns, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = columns.filter(c =>
    c.label.toLowerCase().includes(search.toLowerCase()) ||
    c.key.toLowerCase().includes(search.toLowerCase())
  );

  const selected = columns.find(c => c.key === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="qb-pill"
      >
        {selected?.label || value || "column"}
        <span className="qb-chevron">▾</span>
      </button>
      {open && (
        <div className="qb-dropdown">
          <div className="qb-dropdown-search">
            <input
              autoFocus
              placeholder="Search column..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="qb-search-input"
            />
          </div>
          <div className="qb-dropdown-list">
            {filtered.map(c => (
              <button
                key={c.key}
                type="button"
                className={`qb-dropdown-item ${value === c.key ? "active" : ""}`}
                onClick={() => { onChange(c.key); setOpen(false); setSearch(""); }}
              >
                {c.label}
                {c.type && <span className="qb-col-type">{c.type}</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="qb-dropdown-empty">No columns found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Operator Dropdown ────────────────────────────────────────
function OpDropdown({ ops, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = ops.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="qb-pill"
      >
        {selected?.label || value}
        <span className="qb-chevron">▾</span>
      </button>
      {open && (
        <div className="qb-dropdown">
          <div className="qb-dropdown-list">
            {ops.map(op => (
              <button
                key={op.value}
                type="button"
                className={`qb-dropdown-item ${value === op.value ? "active" : ""}`}
                onClick={() => { onChange(op.value); setOpen(false); }}
              >
                {op.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single filter row ────────────────────────────────────────
function FilterRow({ filter, index, isFirst, columns, onChange, onRemove }) {
  const col = columns.find(c => c.key === filter.col);
  const ops = getOps(col?.type);
  const showValue = needsValue(filter.op);

  return (
    <div className="qb-row">
      {/* Remove */}
      <button type="button" className="qb-remove" onClick={() => onRemove(index)}>
        <X size={12} />
      </button>

      {/* where / and label */}
      <span className="qb-connector">
        {isFirst ? "where" : "and"}
      </span>

      {/* Column */}
      <ColDropdown
        columns={columns}
        value={filter.col}
        onChange={col => onChange(index, { ...filter, col, op: getOps(columns.find(c => c.key === col)?.type)[0]?.value || "contains", val: "" })}
      />

      {/* Operator */}
      <OpDropdown
        ops={ops}
        value={filter.op}
        onChange={op => onChange(index, { ...filter, op, val: "" })}
      />

      {/* Value */}
      {showValue && (
        <input
          className="qb-value-input"
          placeholder="Value..."
          value={filter.val}
          onChange={e => onChange(index, { ...filter, val: e.target.value })}
        />
      )}
    </div>
  );
}

// ── Main QueryBuilder ────────────────────────────────────────
/**
 * columns: [{ key, label, type? }]  — type can be "bool" | "text" (default)
 * filters: [{ col, op, val }]
 * onChange(filters) — called whenever filters change
 */
export default function QueryBuilder({ columns, filters, onChange }) {
  const addFilter = () => {
    const firstCol = columns[0];
    if (!firstCol) return;
    const ops = getOps(firstCol.type);
    onChange([...filters, { col: firstCol.key, op: ops[0].value, val: "" }]);
  };

  const updateFilter = (index, updated) => {
    const next = filters.map((f, i) => i === index ? updated : f);
    onChange(next);
  };

  const removeFilter = (index) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const clearAll = () => onChange([]);

  if (columns.length === 0) return null;

  return (
    <div className="qb-container">
      {filters.map((filter, i) => (
        <FilterRow
          key={i}
          filter={filter}
          index={i}
          isFirst={i === 0}
          columns={columns}
          onChange={updateFilter}
          onRemove={removeFilter}
        />
      ))}
      <div className="qb-actions">
        <button type="button" className="qb-add-btn" onClick={addFilter}>
          <Plus size={12} /> Add filter
        </button>
        {filters.length > 0 && (
          <button type="button" className="qb-clear-btn" onClick={clearAll}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

// ── Convert QB filters → API params ─────────────────────────
export function qbFiltersToParams(filters) {
  const params = {};
  for (const f of filters) {
    if (!f.col || !f.op) continue;
    const val = f.val?.trim() || "";
    switch (f.op) {
      case "contains":    if (val) params[`f_${f.col}`]         = val;     break;
      case "equals":      if (val) params[`f_${f.col}_eq`]      = val;     break;
      case "starts_with": if (val) params[`f_${f.col}_sw`]      = val;     break;
      case "ends_with":   if (val) params[`f_${f.col}_ew`]      = val;     break;
      case "not_empty":           params[`f_${f.col}_nonempty`] = "true";  break;
      case "empty":               params[`f_${f.col}_empty`]    = "true";  break;
      // bool ops
      case "true":
      case "false":               params[`f_${f.col}`]          = f.op;    break;
      default: break;
    }
  }
  return params;
}
