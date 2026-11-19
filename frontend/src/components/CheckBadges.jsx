// "Checks" column for the data tables: how each record's email and phone were checked, and when.
//   Email: valid / risky (catch-all or uncertain) / invalid / unknown / not checked yet
//   Phone: mobile / phone (mobile or landline) / landline / toll-free / invalid / not checked yet
// Only the first email and first phone of a record are checked (that is what the stored status is for).
// The phone check is a numbering-plan check (the number exists in its country's plan, and its type);
// it does not call the number. The wording says "checked", not "verified live", on purpose.
import { Mail, Phone } from "lucide-react";

// The raw check fields. Hidden from the table (the badges show them) but kept in CSV exports.
export const CHECK_COLS = new Set([
  "is_email_valid", "email_status", "email_score", "email_verified_at",
  "phone_status", "phone_e164", "phones_valid", "phone_line_type", "phone_country", "phone_carrier", "phone_verified_at",
]);

/** Table columns without the raw check fields. */
export const withoutCheckCols = (cols) => cols.filter((c) => !CHECK_COLS.has(c.key));

const TONES = {
  good: { color: "#16a34a", bg: "rgba(22,163,74,0.10)", border: "rgba(22,163,74,0.30)" },
  warn: { color: "#d97706", bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.30)" },
  bad:  { color: "#dc2626", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.30)" },
  none: { color: "var(--text-3)", bg: "var(--surface-2)", border: "var(--border)" },
};

const DAY = 86400000;

/** "today", "yesterday", "12 days ago", "3 months ago", "1 year ago"; "" for no / bad date. */
export function ago(value, now = Date.now()) {
  if (!value) return "";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "";
  const days = Math.max(0, Math.floor((now - t) / DAY));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

const has = (v) => !!v && v !== "{}" && String(v).replace(/[{}"\s,]/g, "") !== "";
const firstOf = (v) => String(v || "").replace(/^\{|\}$/g, "").split(",")[0].trim().replace(/^"|"$/g, "");
const dateText = (v) => { const t = Date.parse(v); return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };

const emailOf = (r) => (has(r.emails) ? r.emails : r.email) || "";
const phoneOf = (r) => (has(r.phone) ? r.phone : r.phones) || "";

/** The email badge for a row, or null when the row has no email. */
export function emailCheck(r) {
  if (!has(emailOf(r))) return null;
  const status = String(r.email_status || "").toLowerCase();
  const when = ago(r.email_verified_at);
  const email = firstOf(emailOf(r));
  const map = {
    deliverable:    ["good", "Email valid", "The mailbox accepted mail in an SMTP check."],
    valid:          ["good", "Email valid", "The mailbox accepted mail in an SMTP check."],
    risky:          ["warn", "Email risky", "The domain accepts every address (catch-all) or the server answered unclearly. Mail may bounce."],
    catch_all:      ["warn", "Email risky", "The domain accepts every address (catch-all). Mail may bounce."],
    undeliverable:  ["bad",  "Email invalid", "The mail server rejected this address."],
    invalid:        ["bad",  "Email invalid", "The mail server rejected this address."],
    invalid_syntax: ["bad",  "Email invalid", "The address is not a valid email address."],
    unknown:        ["none", "Email unknown", "The mail server did not give a clear answer."],
  };
  const [tone, label, why] = map[status] || ["none", "Email not checked", "This email has not been checked yet."];
  const checked = map[status] && when;
  return {
    tone, label, when: checked ? when : "",
    title: [`${label}: ${email}`, why, checked ? `Checked ${dateText(r.email_verified_at)} (${when}).` : ""].filter(Boolean).join("\n"),
  };
}

/** The phone badge for a row, or null when the row has no phone. */
export function phoneCheck(r) {
  if (!has(phoneOf(r))) return null;
  const status = String(r.phone_status || "").toLowerCase();
  const type = String(r.phone_line_type || "").toLowerCase();
  const when = ago(r.phone_verified_at);
  const number = r.phone_e164 || firstOf(phoneOf(r));
  const note = "Checked against the country's numbering plan (the number is not called).";
  let tone, label, why;
  if (status === "valid") {
    const types = {
      mobile:          ["good", "Mobile", "A valid mobile number."],
      fixed_or_mobile: ["good", "Phone valid", "A valid number; in this country mobile and landline numbers look the same."],
      fixed_line:      ["good", "Landline", "A valid landline number."],
      toll_free:       ["good", "Toll-free", "A valid toll-free number."],
      voip:            ["warn", "VoIP", "A valid internet (VoIP) number."],
    };
    [tone, label, why] = types[type] || ["good", "Phone valid", "A valid number."];
  } else if (status === "invalid") {
    [tone, label, why] = ["bad", "Phone invalid", "This is not a valid number in its country."];
  } else {
    [tone, label, why] = ["none", "Phone not checked", "This phone has not been checked yet."];
  }
  const checked = (status === "valid" || status === "invalid") && when;
  return {
    tone, label, when: checked ? when : "",
    title: [`${label}: ${number}`, why, checked ? `${note}\nChecked ${dateText(r.phone_verified_at)} (${when}).` : ""].filter(Boolean).join("\n"),
  };
}

function Badge({ check, Icon }) {
  const t = TONES[check.tone];
  return (
    <span
      title={check.title}
      aria-label={check.title.replace(/\n/g, " ")}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap"
      style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}` }}
    >
      <Icon size={9} className="flex-shrink-0" />
      {check.label}
      {check.when && <span className="font-normal opacity-80">· {check.when}</span>}
    </span>
  );
}

/** Header cell of the "Checks" column. */
export function CheckHeader() {
  return (
    <th
      className="text-left px-3 py-3 text-[var(--text-3)] font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap"
      title="How this record's email and phone were checked, and when. Hover a badge for details."
    >
      Checks
    </th>
  );
}

/** Body cell of the "Checks" column. */
export function CheckCell({ row }) {
  const email = emailCheck(row);
  const phone = phoneCheck(row);
  return (
    <td className="px-3 py-2.5">
      {email || phone ? (
        <div className="flex flex-col items-start gap-1">
          {phone && <Badge check={phone} Icon={Phone} />}
          {email && <Badge check={email} Icon={Mail} />}
        </div>
      ) : (
        <span className="text-[var(--text-3)]">—</span>
      )}
    </td>
  );
}
