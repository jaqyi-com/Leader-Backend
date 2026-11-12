import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, ChevronDown, Search, Check, X } from "lucide-react";
import { COUNTRIES, MAIN_MARKETS, SMALL_COUNTRY, countryByCode, flag, fmtCount } from "../countries";

/**
 * Country filter for Companies / People / Emails / Numbers.
 * value: ISO code ("IN", "DE") or "" for all countries. kind: "people" | "companies" (which count to show).
 */
export default function CountryPicker({ value, onChange, kind = "people" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showSmall, setShowSmall] = useState(false);
  const wrap = useRef(null);
  const input = useRef(null);
  const selected = countryByCode(value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    setTimeout(() => input.current?.focus(), 0);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const { main, others, small } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q;
    const withCount = COUNTRIES.filter((c) => c[kind] > 0 && match(c)).sort((a, b) => b[kind] - a[kind]);
    return {
      main: withCount.filter((c) => MAIN_MARKETS.includes(c.code)),
      others: withCount.filter((c) => !MAIN_MARKETS.includes(c.code) && (q || c[kind] >= SMALL_COUNTRY)),
      small: q ? [] : withCount.filter((c) => !MAIN_MARKETS.includes(c.code) && c[kind] < SMALL_COUNTRY),
    };
  }, [query, kind]);

  const pick = (code) => { onChange(code); setOpen(false); setQuery(""); };

  const Row = ({ c }) => (
    <button
      type="button"
      role="option"
      aria-selected={value === c.code}
      onClick={() => pick(c.code)}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left rounded-md hover:bg-[var(--surface-3)]"
      style={value === c.code ? { background: "var(--surface-3)", fontWeight: 600 } : undefined}
    >
      <span className="text-sm leading-none">{flag(c.code)}</span>
      <span className="flex-1 truncate text-[var(--text)]">{c.name}</span>
      <span className="tabular-nums text-[var(--text-3)]">{fmtCount(c[kind])}</span>
      {value === c.code && <Check size={12} className="text-[var(--accent-2)]" />}
    </button>
  );
  const Heading = ({ children }) => (
    <p className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-3)]">{children}</p>
  );

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Country"
        className="btn-ghost text-xs gap-1.5 whitespace-nowrap"
        style={{ background: "var(--surface)", border: "1.5px solid rgba(100,116,139,0.55)", color: "var(--text)", fontWeight: 500 }}
      >
        {selected ? <span className="text-sm leading-none">{flag(selected.code)}</span> : <Globe size={12} />}
        {selected ? selected.name : "All countries"}
        {selected && <span className="text-[var(--text-3)] tabular-nums">{fmtCount(selected[kind])}</span>}
        <ChevronDown size={11} />
      </button>
      {selected && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear country"
          title="All countries"
          className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
        >
          <X size={9} />
        </button>
      )}

      {open && (
        <div
          className="absolute z-50 mt-1 w-72 max-w-[calc(100vw-32px)] rounded-xl p-1.5 shadow-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", left: 0 }}
        >
          <div className="relative mb-1">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              ref={input}
              className="input text-xs pl-7 py-1.5"
              placeholder="Type a country…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search countries"
            />
          </div>
          <div role="listbox" aria-label="Countries" className="max-h-80 overflow-y-auto">
            {!query && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => pick("")}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left rounded-md hover:bg-[var(--surface-3)]"
                style={!value ? { background: "var(--surface-3)", fontWeight: 600 } : undefined}
              >
                <Globe size={13} /> <span className="flex-1 text-[var(--text)]">All countries</span>
                {!value && <Check size={12} className="text-[var(--accent-2)]" />}
              </button>
            )}
            {main.length > 0 && <><Heading>Main markets</Heading>{main.map((c) => <Row key={c.code} c={c} />)}</>}
            {others.length > 0 && <><Heading>{query ? "Countries" : "Other countries"}</Heading>{others.map((c) => <Row key={c.code} c={c} />)}</>}
            {small.length > 0 && (showSmall
              ? <><Heading>Fewer than {SMALL_COUNTRY} records</Heading>{small.map((c) => <Row key={c.code} c={c} />)}</>
              : (
                <button type="button" onClick={() => setShowSmall(true)}
                  className="w-full px-3 py-2 text-[11px] text-left text-[var(--accent-2)] hover:underline">
                  Show {small.length} countries with fewer than {SMALL_COUNTRY} records
                </button>
              ))}
            {query && main.length + others.length === 0 && (
              <p className="px-3 py-3 text-xs text-[var(--text-3)]">No {kind} in a country matching “{query}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
