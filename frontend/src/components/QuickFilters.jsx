import { MailCheck, Smartphone, Check } from "lucide-react";

/**
 * One-click filters shown at the right end of the filter bar on Companies, People, Emails and Numbers.
 *   Verified email → only records whose email was checked and is deliverable
 *   Valid mobile   → only records whose phone number is valid and is a mobile number
 * value: { verifiedEmail: boolean, validMobile: boolean }
 */
export const NO_QUICK_FILTERS = { verifiedEmail: false, validMobile: false };

/** API query parameters for the active quick filters. */
export function quickFilterParams(q) {
  const p = {};
  if (q?.verifiedEmail) p.f_email_status = "deliverable";
  if (q?.validMobile) p.f_phone_status = "mobile";
  return p;
}

export const hasQuickFilters = (q) => Boolean(q?.verifiedEmail || q?.validMobile);

const OPTIONS = [
  { key: "verifiedEmail", label: "Verified email", icon: MailCheck, title: "Show only records with a verified, deliverable email" },
  { key: "validMobile", label: "Valid mobile", icon: Smartphone, title: "Show only records with a valid mobile number" },
];

export default function QuickFilters({ value, onChange, className = "" }) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`} role="group" aria-label="Quick filters">
      {OPTIONS.map(({ key, label, icon: Icon, title }) => {
        const on = Boolean(value?.[key]);
        return (
          <button
            key={key}
            type="button"
            title={title}
            aria-pressed={on}
            onClick={() => onChange({ ...value, [key]: !on })}
            className="btn-ghost text-xs gap-1.5 whitespace-nowrap"
            style={on ? {
              background: "rgba(16,185,129,0.12)",
              borderColor: "rgba(16,185,129,0.45)",
              color: "#059669",
              fontWeight: 600,
            } : undefined}
          >
            {on ? <Check size={12} /> : <Icon size={12} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
