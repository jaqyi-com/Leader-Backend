// Shared facts about the Doott connector for Claude (MCP), used by the landing page, the /claude
// guide and Settings → Claude. The connector is served by the API host at /mcp.

const FALLBACK = "https://leader-backend.vercel.app/mcp";

export const MCP_URL = (() => {
  const api = import.meta.env.VITE_API_URL;
  try {
    if (api && /^https?:\/\//.test(api)) return new URL("/mcp", api).toString();
  } catch { /* fall through */ }
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://localhost:3001/mcp";
  }
  return FALLBACK;
})();

export const CLAUDE_CODE_COMMAND = `claude mcp add --transport http doott ${MCP_URL}`;

export const CLAUDE_TOOLS = [
  { name: "Search people", desc: "Find people by job title, city, state or country (India, the USA, Canada and more), with emails, phone numbers and LinkedIn URLs." },
  { name: "Search companies", desc: "Find companies by name, industry, domain or location, and keep only verified emails or mobile numbers." },
  { name: "Verify an email", desc: "Check whether an address is deliverable before you send to it." },
  { name: "Browse categories and cities", desc: "See the largest job titles, industries and cities in Doott, with exact counts." },
];

export const EXAMPLE_PROMPTS = [
  "Find 20 HR managers in Pune with an email address",
  "Mumbai companies with a deliverable email, as a table",
  "Which cities in the USA have the most software companies?",
  "Is priya@example.com a deliverable email?",
];
