import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, ShieldCheck, Terminal, MessageSquare, Plug, ArrowRight } from "lucide-react";
import { Nav, Footer } from "./LandingPage";
import { MCP_URL, CLAUDE_CODE_COMMAND, CLAUDE_TOOLS, EXAMPLE_PROMPTS } from "../claudeConnector";

/** Public setup guide for the Doott connector for Claude (pre-rendered at /claude). */
export default function ClaudeConnectorPage() {
  return (
    <main className="relative z-[2] min-h-screen bg-background text-foreground">
      <Nav />

      {/* Intro */}
      <section className="border-b border-border" aria-label="Doott connector for Claude">
        <div className="mx-auto max-w-4xl px-6 py-20 md:py-28">
          <p className="eyebrow mb-4 opacity-60">Doott × Claude</p>
          <h1 className="display text-4xl md:text-6xl mb-6">Search Doott from inside Claude.</h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl mb-10">
            Connect your Doott account to Claude once. Then ask for leads in plain English: Claude searches
            43.9M people and 1.5M companies for you and answers with names, emails and phone numbers.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Connector URL</p>
          <CopyField value={MCP_URL} />
          <p className="text-muted-foreground text-sm mt-4">
            You need a Doott account. <Link to="/pricing" className="text-primary underline underline-offset-4">Get lifetime access</Link> if you don't have one.
          </p>
        </div>
      </section>

      {/* Claude apps */}
      <section className="border-b border-border bg-secondary/10" aria-label="Connect in Claude web, desktop and mobile">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <Heading icon={MessageSquare} eyebrow="Claude on the web, desktop and mobile" title="Connect in four steps" />
          <ol className="grid gap-0 border-t border-l border-border">
            {[
              ["Open Connectors", <>In Claude, go to <b>Settings → Connectors</b> and click <b>Add custom connector</b>.</>],
              ["Add Doott", <>Type <b>Doott</b> as the name and paste the connector URL above. Click <b>Add</b>.</>],
              ["Sign in and allow", <>Click <b>Connect</b>. A Doott page opens: sign in, check that it names Claude, and click <b>Allow</b>.</>],
              ["Ask Claude", <>In a new chat, turn on <b>Doott</b> in the tools menu (the <b>+</b> or sliders button) and ask for the leads you need.</>],
            ].map(([title, body], i) => (
              <li key={title} className="border-b border-r border-border p-6 md:p-8 flex gap-5 bg-background">
                <span className="h-9 w-9 shrink-0 border border-border flex items-center justify-center font-mono text-[11px] text-muted-foreground">{`0${i + 1}`}</span>
                <div>
                  <h3 className="font-serif text-xl mb-1">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground list-disc pl-5">
            <li>Add the connector once on claude.ai or Claude Desktop; it then also works in the Claude mobile app.</li>
            <li>On Claude Team and Enterprise plans, an owner first adds the connector for the organization in Claude's admin settings; each member then clicks <b>Connect</b>.</li>
            <li>Start a new chat after connecting, so Claude sees the latest Doott tools.</li>
          </ul>
        </div>
      </section>

      {/* Claude Code */}
      <section className="border-b border-border" aria-label="Connect in Claude Code">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <Heading icon={Terminal} eyebrow="Claude Code" title="Connect from the terminal" />
          <p className="text-muted-foreground text-sm mb-3">1. Add the server:</p>
          <CopyField value={CLAUDE_CODE_COMMAND} />
          <p className="text-muted-foreground text-sm mt-6">
            2. Start Claude Code, run <code className="font-mono text-foreground">/mcp</code>, choose <b>doott</b> and then <b>Authenticate</b>.
            Your browser opens the same Doott sign-in and Allow page.
          </p>
        </div>
      </section>

      {/* What Claude can do */}
      <section className="border-b border-border bg-secondary/10" aria-label="What Claude can do with Doott">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <Heading icon={Plug} eyebrow="What Claude can do" title="Read-only tools for finding leads" />
          <div className="grid md:grid-cols-2 gap-0 border-t border-l border-border mb-12">
            {CLAUDE_TOOLS.map((t) => (
              <div key={t.name} className="border-b border-r border-border p-6 bg-background">
                <h3 className="font-serif text-lg mb-1">{t.name}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-4">Try asking</p>
          <div className="flex flex-col gap-3">
            {EXAMPLE_PROMPTS.map((p) => (
              <div key={p} className="border border-border bg-background px-5 py-3 text-sm">“{p}”</div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="border-b border-border" aria-label="Privacy and access">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <Heading icon={ShieldCheck} eyebrow="Your account" title="What Claude can and can't do" />
          <ul className="space-y-3 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
            <li>Claude signs in as you, after you click <b>Allow</b>. Doott never sees your Claude account, and Claude never sees your Doott password.</li>
            <li>Access is read-only: Claude can search and verify, but it can't change your account or any data.</li>
            <li>Searches count toward your normal Doott search limits.</li>
            <li>Disconnect any time in Doott under <Link to="/app/settings" className="text-primary underline underline-offset-4">Settings → Claude</Link>, or remove the connector in Claude.</li>
          </ul>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="border-b border-border bg-secondary/10" aria-label="Troubleshooting">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <p className="eyebrow mb-4 opacity-60">Troubleshooting</p>
          <div className="space-y-4">
            {[
              ["Claude says the connector isn't connected", "Open Settings → Connectors in Claude, click Doott and then Connect, and sign in again."],
              ["The Doott page says the link has expired", "The sign-in link lasts 15 minutes. Go back to Claude and click Connect again."],
              ["Claude doesn't use Doott", "Start a new chat and check that Doott is switched on in the tools menu. Mentioning “Doott” in your question also helps."],
              ["“Upgrade required” or “rate limit” messages", "The connector uses your Doott plan and limits. Wait a few minutes after many searches in a row."],
              ["Few or no results with “deliverable” emails", "Only verified emails count as deliverable. Ask without that filter to see everyone who has an email."],
            ].map(([q, a]) => (
              <details key={q} className="group border border-border bg-background p-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between font-serif text-lg">
                  <span className="pr-6">{q}</span>
                  <span className="shrink-0 transition duration-300 group-open:-rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-4 text-muted-foreground leading-relaxed text-sm">{a}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap gap-4">
            <Link to="/app/settings" className="inline-flex h-11 items-center gap-2 bg-primary px-6 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground transition hover:opacity-90">
              Open Doott settings <ArrowRight size={14} />
            </Link>
            <Link to="/pricing" className="inline-flex h-11 items-center border border-border px-6 font-mono text-[11px] uppercase tracking-[0.18em] transition hover:bg-secondary">
              Get a Doott account
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Heading({ icon: Icon, eyebrow, title }) {
  return (
    <div className="mb-10">
      <p className="eyebrow mb-4 opacity-60 flex items-center gap-2"><Icon size={14} /> {eyebrow}</p>
      <h2 className="display text-3xl md:text-4xl">{title}</h2>
    </div>
  );
}

export function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => {});
  }
  return (
    <div className="flex items-stretch border border-border bg-background max-w-full">
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap px-4 py-3 font-mono text-sm">{value}</code>
      <button
        onClick={copy}
        className="shrink-0 inline-flex items-center gap-2 border-l border-border px-4 font-mono text-[11px] uppercase tracking-[0.18em] transition hover:bg-secondary"
        aria-label="Copy to clipboard"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
