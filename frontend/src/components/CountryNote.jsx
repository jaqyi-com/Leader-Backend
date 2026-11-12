import { Info } from "lucide-react";
import { countryByCode, flag, fmtCount, LIMITED_COVERAGE } from "../countries";
import { useLiveCounts } from "../liveCounts";

/** Line under the filters when a country is chosen: how many results, and a note when coverage is thin. */
export default function CountryNote({ country, kind, total, totalExact = true, loading, noun, showCount = true }) {
  useLiveCounts("countries");
  const c = countryByCode(country);
  if (!c) return null;
  const inCountry = c[kind];
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-2)]" aria-live="polite">
      {showCount && <span>
        <span className="text-sm">{flag(c.code)}</span>{" "}
        {loading ? "Loading…" : <><b className="text-[var(--text)]">{totalExact ? "" : "about "}{fmtCount(total)}</b> {noun} in {c.name}</>}
      </span>}
      {inCountry < LIMITED_COVERAGE && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{ background: "rgba(245,158,11,0.12)", color: "var(--amber, #b45309)" }}>
          <Info size={11} /> Doott has {fmtCount(inCountry)} {kind} in {c.name}. Coverage for this country is limited.
        </span>
      )}
    </div>
  );
}
