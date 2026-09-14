import { useState, useRef, useEffect, useMemo } from "react";
import { X, Plus, ChevronDown } from "lucide-react";
import CATEGORIES_DATA from "../categories.json";
import CITIES_DATA from "../cities.json";

// ── Extract curated DB values from data sources ─────────────
const DB_VALUES_MAP = (() => {
  // Job Titles from categories
  const peopleTitles = [
    ...(CATEGORIES_DATA.india?.people || []),
    ...(CATEGORIES_DATA.usa?.people || []),
    ...(CATEGORIES_DATA.people || [])
  ];
  const uniqueTitles = Array.from(
    new Map(peopleTitles.map(item => [item.name, item.count || null])).entries()
  ).map(([name, count]) => ({ label: name, value: name, count }));

  // Industries from categories
  const companyIndustries = [
    ...(CATEGORIES_DATA.india?.company || []),
    ...(CATEGORIES_DATA.usa?.company || []),
    ...(CATEGORIES_DATA.company || [])
  ];
  const uniqueIndustries = Array.from(
    new Map(companyIndustries.map(item => [item.name, item.count || null])).entries()
  ).map(([name, count]) => ({ label: name, value: name, count }));

  // Cities from cities.json
  const citiesList = [
    ...(CITIES_DATA.india || []),
    ...(CITIES_DATA.companies || []),
    ...(CITIES_DATA.people || [])
  ];
  const uniqueCities = Array.from(
    new Map(citiesList.map(item => [`${item.name}${item.state ? ` (${item.state})` : ""}`, item])).entries()
  ).map(([_, item]) => ({
    label: item.name,
    sub: item.state || "",
    value: item.name,
    count: item.count || null
  }));

  // States
  const allStates = [
    "Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "Gujarat", "Telangana", "Uttar Pradesh", "West Bengal", "Rajasthan", "Haryana", "Kerala", "Madhya Pradesh", "Punjab", "Andhra Pradesh", "Bihar", "Odisha", "Assam", "Jharkhand", "Chhattisgarh", "Uttarakhand", "Goa", "Himachal Pradesh", "Jammu and Kashmir", "Chandigarh",
    "CA - California", "TX - Texas", "NY - New York", "FL - Florida", "WA - Washington", "IL - Illinois", "GA - Georgia", "NC - North Carolina", "OH - Ohio", "PA - Pennsylvania", "VA - Virginia", "MA - Massachusetts", "AZ - Arizona", "CO - Colorado", "MI - Michigan", "NJ - New Jersey", "TN - Tennessee", "MN - Minnesota", "MD - Maryland", "OR - Oregon", "WI - Wisconsin", "NV - Nevada", "UT - Utah", "SC - South Carolina", "IN - Indiana", "MO - Missouri", "AL - Alabama", "KY - Kentucky", "OK - Oklahoma", "CT - Connecticut", "IA - Iowa", "MS - Mississippi", "AR - Arkansas", "KS - Kansas", "LA - Louisiana", "NE - Nebraska", "NM - New Mexico", "ID - Idaho", "WV - West Virginia", "HI - Hawaii", "NH - New Hampshire", "ME - Maine", "MT - Montana", "RI - Rhode Island", "DE - Delaware", "SD - South Dakota", "ND - North Dakota", "AK - Alaska", "VT - Vermont", "WY - Wyoming"
  ].map(s => {
    const val = s.includes(" - ") ? s.split(" - ")[0] : s;
    return { label: s, value: val };
  });

  const geoSources = [
    { label: "US Zip Code (us_zip)", value: "us_zip" },
    { label: "India Pincode (in_pincode)", value: "in_pincode" },
    { label: "OpenStreetMap (osm)", value: "osm" },
    { label: "Google Places (places)", value: "places" },
    { label: "Web Scraped (crawled)", value: "crawled" },
    { label: "Verified Record (verified)", value: "verified" },
  ];

  const ratings = [
    { label: "5.0 Stars", value: "5.0" },
    { label: "4.5+ Stars", value: "4.5" },
    { label: "4.0+ Stars", value: "4.0" },
    { label: "3.5+ Stars", value: "3.5" },
    { label: "3.0+ Stars", value: "3.0" },
  ];

  return {
    job_title: uniqueTitles,
    title: uniqueTitles,
    role: uniqueTitles,
    industry: uniqueIndustries,
    category: uniqueIndustries,
    sector: uniqueIndustries,
    city: uniqueCities,
    location: uniqueCities,
    state: allStates,
    geo_source: geoSources,
    rating: ratings,
  };
})();

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

// ── Value Selector Dropdown (Select options existing in DB) ───
function ValueDropdown({ colKey, value, onChange, placeholder = "Select from DB..." }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const options = DB_VALUES_MAP[colKey] || null;

  useEffect(() => {
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!options) return [];
    if (!search.trim()) return options.slice(0, 100);
    const q = search.toLowerCase().trim();
    return options.filter(opt =>
      opt.label.toLowerCase().includes(q) ||
      (opt.sub && opt.sub.toLowerCase().includes(q)) ||
      opt.value.toLowerCase().includes(q)
    ).slice(0, 100);
  }, [options, search]);

  if (options && options.length > 0) {
    const selectedItem = options.find(o => o.value.toLowerCase() === (value || "").toLowerCase());

    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="qb-pill"
          style={{
            background: value ? "rgba(226,55,68,0.12)" : "var(--surface-2)",
            borderColor: value ? "rgba(226,55,68,0.35)" : "var(--border)",
            color: value ? "var(--text)" : "var(--text-3)",
            fontWeight: value ? 600 : 400,
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={selectedItem?.label || value || placeholder}
        >
          <span className="truncate">
            {selectedItem?.label || value || placeholder}
          </span>
          <span className="qb-chevron">▾</span>
        </button>

        {open && (
          <div className="qb-dropdown" style={{ minWidth: 240, maxWidth: 320 }}>
            <div className="qb-dropdown-search">
              <input
                autoFocus
                placeholder={`Search ${colKey.replace(/_/g, " ")} from DB...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="qb-search-input"
              />
            </div>
            <div className="qb-dropdown-list" style={{ maxHeight: 220 }}>
              {filtered.map((opt, idx) => (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  className={`qb-dropdown-item ${value === opt.value ? "active" : ""}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="truncate mr-2 font-medium" title={opt.label}>
                    {opt.label}
                    {opt.sub && <span className="text-[10px] text-[var(--text-3)] ml-1">({opt.sub})</span>}
                  </span>
                  {opt.count && (
                    <span className="text-[9px] font-semibold text-[var(--accent)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded flex-shrink-0">
                      {opt.count.toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="qb-dropdown-empty">No matching values in DB</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback for non-mapped fields
  return (
    <input
      className="qb-value-input"
      placeholder="Value..."
      value={filterVal(value)}
      onChange={e => onChange(e.target.value)}
    />
  );
}

function filterVal(v) {
  return v === undefined || v === null ? "" : v;
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
        <ValueDropdown
          colKey={filter.col}
          value={filter.val}
          onChange={val => onChange(index, { ...filter, val })}
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

// ── Convert URL search params → QB filters ───────────────────
export function paramsToQbFilters(searchParams) {
  const filters = [];
  if (!searchParams) return filters;
  
  const entries = typeof searchParams.entries === "function" 
    ? Array.from(searchParams.entries())
    : Object.entries(searchParams);

  for (const [key, rawVal] of entries) {
    if (!key.startsWith("f_")) continue;
    const val = String(rawVal || "").trim();

    if (key.endsWith("_nonempty")) {
      const col = key.substring(2, key.length - 9);
      filters.push({ col, op: "not_empty", val: "" });
    } else if (key.endsWith("_empty")) {
      const col = key.substring(2, key.length - 6);
      filters.push({ col, op: "empty", val: "" });
    } else if (key.endsWith("_eq")) {
      const col = key.substring(2, key.length - 3);
      filters.push({ col, op: "equals", val });
    } else if (key.endsWith("_sw")) {
      const col = key.substring(2, key.length - 3);
      filters.push({ col, op: "starts_with", val });
    } else if (key.endsWith("_ew")) {
      const col = key.substring(2, key.length - 3);
      filters.push({ col, op: "ends_with", val });
    } else {
      const col = key.substring(2);
      if (val === "true" || val === "false") {
        filters.push({ col, op: val, val: "" });
      } else {
        filters.push({ col, op: "contains", val });
      }
    }
  }
  return filters;
}
