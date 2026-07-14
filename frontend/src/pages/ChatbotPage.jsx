import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Plus, Trash2, Send, Database, ChevronDown,
  ChevronRight, Bot, User, Sparkles, BookOpen, X, Loader2,
  Copy, Check, Cpu, Shield, ExternalLink, MoreHorizontal, Pencil, Pin
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import {
  fetchConversations, fetchMessages,
  deleteConversation, renameConversation, sendMessage, pinConversation
} from "../api/chatbot";
import { classifyIntent } from "../lib/intentClassifier";
import MentionDropdown from "../components/chatbot/MentionDropdown";
import FeatureDropdown from "../components/chatbot/FeatureDropdown";
import FeatureInvocationPanel from "../components/chatbot/FeatureInvocationPanel";

const MAX_CONTEXT = 100000;

const SUGGESTIONS = [
  "Find software engineers in Chennai",
  "Search companies in the medical industry",
  "List businesses located in Bangalore",
  "Find doctors with verified emails",
];

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "12px 16px" }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
      ))}
    </div>
  );
}

function ExpandedPromptBadge({ expandedPrompt, original }) {
  const [open, setOpen] = useState(false);
  if (!expandedPrompt || expandedPrompt === original) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "rgba(226,55,68,0.08)",
        border: "1px solid rgba(226,55,68,0.2)",
        borderRadius: 10,
        padding: "6px 12px",
        marginBottom: 6,
        fontSize: 12,
        cursor: "pointer",
        userSelect: "none",
      }}
      onClick={() => setOpen(!open)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent)" }}>
        <Sparkles size={11} />
        <span style={{ fontWeight: 600 }}>How I understood your question</span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", marginTop: 6, color: "var(--text-2)", lineHeight: 1.5 }}
          >
            {expandedPrompt}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SourceCitations({ chunks }) {
  const [open, setOpen] = useState(false);
  if (!chunks || chunks.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-3)", fontSize: 11, padding: 0,
        }}
      >
        <BookOpen size={11} />
        <span>{chunks.length} source{chunks.length !== 1 ? "s" : ""} referenced</span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}
          >
            {chunks.map((c, i) => (
              <div
                key={i}
                style={{
                  background: "var(--overlay-1)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 11,
                  color: "var(--text-2)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                  {c.sourceName}
                </span>
                {" · "}
                <span style={{ opacity: 0.7 }}>{c.textSnippet}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Source badge shown when response used the In-Build Database */
function InBuildDBBadge({ dbResults }) {
  const [open, setOpen] = useState(false);
  if (!dbResults || !dbResults.leads || dbResults.leads.length === 0) return null;
  const { count, total, query } = dbResults;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "none", border: "none", cursor: "pointer",
          color: "#22c55e", fontSize: 11, padding: 0, fontWeight: 600,
        }}
      >
        <Database size={11} />
        <span>In-Build Database · {count} result{count !== 1 ? "s" : ""}</span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", marginTop: 6 }}
          >
            <div style={{
              background: "rgba(34,197,94,0.07)",
              border: "1px solid rgba(34,197,94,0.25)",
              borderRadius: 8,
              padding: "7px 11px",
              fontSize: 11,
              color: "var(--text-2)",
              display: "flex", flexDirection: "column", gap: 3,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 700, color: "#22c55e" }}>🗄️ In-Build Database</span>
                <span style={{ opacity: 0.6 }}>Cloud SQL · pgvector semantic search</span>
              </div>
              <div style={{ opacity: 0.75 }}>
                Searched <b style={{ color: "var(--text)" }}>{total?.toLocaleString()}</b> business records
                {query && <> for <b style={{ color: "var(--text)" }}>"{query.slice(0, 60)}{query.length > 60 ? "…" : ""}"</b></>}
                {" · "}<b style={{ color: "#22c55e" }}>{count} match{count !== 1 ? "es" : ""} found</b>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Full panel showing actual In-Build DB records as cards */
function DBResultsPanel({ dbResults }) {
  if (!dbResults) return null;
  const { count, total, query, leads = [] } = dbResults;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ marginTop: 12, marginBottom: 4, width: "100%" }}
    >
      {/* Header bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: 10,
      }}>
        {/* Pulsing dot */}
        <motion.div
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }}
        />
        <Database size={13} color="#22c55e" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>In-Build Database</span>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>
          {count} result{count !== 1 ? "s" : ""} from {total?.toLocaleString()} records
        </span>
        {query && (
          <span style={{ fontSize: 11, color: "var(--text-3)", opacity: 0.6 }}>
            · "{query.slice(0, 40)}{query.length > 40 ? "…" : ""}"
          </span>
        )}
        <a href="/app/inbuild-db" style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
          fontSize: 11, color: "#22c55e", textDecoration: "none", fontWeight: 600,
          opacity: 0.8,
        }}>
          View all <ExternalLink size={10} />
        </a>
      </div>

      {/* Cards */}
      {leads.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {leads.map((lead, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              style={{
                background: "var(--overlay-1)",
                border: "1px solid var(--border)",
                borderLeft: "3px solid rgba(34,197,94,0.6)",
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Name + category */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                      {lead.name || "—"}
                    </span>
                    {lead.category && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: "var(--accent)",
                        background: "rgba(226,55,68,0.12)", border: "1px solid rgba(226,55,68,0.2)",
                        borderRadius: 4, padding: "1px 6px",
                      }}>{lead.category}</span>
                    )}
                    {lead.match && (
                      <span style={{
                        fontSize: 10, color: "#22c55e", fontWeight: 600,
                        background: "rgba(34,197,94,0.1)", borderRadius: 4, padding: "1px 6px",
                      }}>{lead.match}% match</span>
                    )}
                  </div>

                  {/* Details row */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 5 }}>
                    {(lead.city || lead.state) && (
                      <span style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 3 }}>
                        📍 {[lead.city, lead.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} style={{ fontSize: 11, color: "#60a5fa", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                        📞 {lead.phone}
                      </a>
                    )}
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} style={{ fontSize: 11, color: "#a78bfa", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                        ✉️ {lead.email}
                      </a>
                    )}
                    {lead.address && (
                      <span style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 3 }}>
                        🏠 {lead.address}
                      </span>
                    )}
                  </div>
                </div>

                {/* Website button */}
                {lead.website && lead.website !== "—" && (
                  <a
                    href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      flexShrink: 0, fontSize: 11, color: "#22c55e",
                      background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
                      borderRadius: 6, padding: "3px 8px",
                      textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    Visit <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>
          Results are displayed below.
        </div>
      )}
    </motion.div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} title="Copy" style={{
      background: "none", border: "none", cursor: "pointer",
      color: copied ? "var(--emerald)" : "var(--text-3)",
      padding: "2px 4px", borderRadius: 4, transition: "color 0.2s",
    }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function TokenBar({ count, max = MAX_CONTEXT }) {
  if (!count) return null;
  const pct = Math.min(100, (count / max) * 100);
  const color = pct > 80 ? "var(--rose)" : pct > 60 ? "var(--ember)" : "var(--emerald)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-3)" }}>
      <Cpu size={11} />
      <div style={{ width: 80, height: 4, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
        <motion.div animate={{ width: `${pct}%` }} style={{ height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span style={{ color }}>{Math.round(count / 1000)}k / {Math.round(max / 1000)}k tokens</span>
    </div>
  );
}

function MessageBubble({ msg, isStreaming }) {
  const isUser = msg.role === "user";
  const hasDbResults = !isUser && msg.dbResults && msg.dbResults.leads && msg.dbResults.leads.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 20,
        maxWidth: "100%",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        flexDirection: isUser ? "row-reverse" : "row",
        maxWidth: isUser ? "78%" : (hasDbResults ? "96%" : "78%"),
        width: hasDbResults ? "96%" : undefined,
      }}>
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isUser
            ? "linear-gradient(135deg,var(--accent),#f4576a)"
            : "var(--overlay-2)",
          border: "1px solid var(--border)",
          marginTop: hasDbResults ? 2 : 0,
        }}>
          {isUser ? <User size={14} color="white" /> : <Bot size={14} color="var(--accent)" />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Expanded prompt (user messages) */}
          {isUser && msg.expandedPrompt && (
            <ExpandedPromptBadge expandedPrompt={msg.expandedPrompt} original={msg.content} />
          )}

          {/* ── DB Results Panel (shown ABOVE the text bubble when results exist) ── */}
          {hasDbResults && (
            <DBResultsPanel dbResults={msg.dbResults} />
          )}

          {/* Bubble — show only if there is text content OR still streaming */}
          {(isStreaming || msg.content) && (
            <div style={{
              background: isUser
                ? "linear-gradient(135deg,var(--accent) 0%,#f4576a 100%)"
                : "var(--overlay-2)",
              border: isUser ? "none" : "1px solid var(--border)",
              borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              padding: "12px 16px",
              color: isUser ? "white" : "var(--text)",
              fontSize: 14,
              lineHeight: 1.65,
              backdropFilter: "blur(8px)",
              marginTop: hasDbResults ? 8 : 0,
            }}>
              {isStreaming && !msg.content ? (
                <TypingDots />
              ) : (
                <div style={{ margin: 0 }} className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ""}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Source citations + In-Build DB badge + copy button (assistant messages) */}
          {!isUser && (
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 4, gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <SourceCitations chunks={msg.sourceChunks} />
                <InBuildDBBadge dbResults={msg.dbResults} />
              </div>
              {msg.content && <CopyButton text={msg.content} />}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ConversationItem({ conv, isActive, onClick, onDelete, onRename, onPin }) {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [renaming, setRenaming]     = useState(false);
  const [renameVal, setRenameVal]   = useState(conv.title || "New Conversation");
  const menuRef   = useRef(null);
  const inputRef2 = useRef(null);

  const date    = new Date(conv.lastMessageAt || conv.createdAt);
  const timeStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  /* Close menu when clicking outside */
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [menuOpen]);

  /* Focus input when entering rename mode */
  useEffect(() => {
    if (renaming) { inputRef2.current?.focus(); inputRef2.current?.select(); }
  }, [renaming]);

  const startRename = () => {
    setRenameVal(conv.title || "New Conversation");
    setMenuOpen(false);
    setRenaming(true);
  };

  const commitRename = () => {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== conv.title) onRename(conv._id, trimmed);
    setRenaming(false);
  };

  const cancelRename = () => {
    setRenameVal(conv.title || "New Conversation");
    setRenaming(false);
  };

  return (
    <motion.div
      whileHover={{ x: 2 }}
      onClick={() => { if (!renaming) onClick(); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", borderRadius: 10, cursor: renaming ? "default" : "pointer",
        background: isActive ? "rgba(226,55,68,0.15)" : "transparent",
        border: isActive ? "1px solid rgba(226,55,68,0.3)" : "1px solid transparent",
        marginBottom: 2, transition: "all 0.15s", position: "relative",
        zIndex: menuOpen ? 50 : 1, // Fix stacking: lift the active conversation item's z-index
      }}
    >
      {/* Title / rename input */}
      <div style={{ minWidth: 0, flex: 1 }}>
        {renaming ? (
          <input
            ref={inputRef2}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", background: "var(--surface-3)",
              border: "1px solid var(--accent)", borderRadius: 6,
              padding: "3px 7px", fontSize: 13, color: "var(--text)",
              outline: "none",
            }}
          />
        ) : (
          <>
            <div style={{
              fontSize: 13, fontWeight: 500, color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {conv.title || "New Conversation"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              {conv.isPinned && (
                <Pin
                  size={11}
                  style={{
                    transform: "rotate(45deg)",
                    fill: "var(--accent)",
                    color: "var(--accent)",
                    flexShrink: 0
                  }}
                />
              )}
              <span>{timeStr} · {conv.messageCount || 0} msgs</span>
            </div>
          </>
        )}
      </div>

      {/* Three-dot button (shown on hover / when menu is open) */}
      {!renaming && (
        <div style={{ position: "relative", flexShrink: 0 }} ref={menuRef}>
          <motion.button
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            animate={{ opacity: menuOpen ? 1 : undefined }}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            style={{
              background: menuOpen ? "var(--surface-3)" : "transparent",
              border: "none", cursor: "pointer",
              color: "var(--text-3)", borderRadius: 6,
              padding: "3px 5px", marginLeft: 4,
              display: "flex", alignItems: "center",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--surface-3)"; }}
            onMouseLeave={(e) => { if (!menuOpen) { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "transparent"; } }}
          >
            <MoreHorizontal size={14} />
          </motion.button>

          {/* Dropdown */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: "absolute", right: 0, top: "calc(100% + 4px)",
                  minWidth: 160, zIndex: 9999,
                  background: "var(--surface)", // Solid background (no opacity bleed)
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04)",
                  overflow: "hidden",
                  padding: "4px",
                }}
              >
                {/* Pin / Unpin */}
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onPin(conv._id, !conv.isPinned); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 7, border: "none",
                    background: "transparent", color: "var(--text-2)",
                    fontSize: 13, cursor: "pointer", textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-3)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <Pin size={13} style={{ flexShrink: 0, transform: conv.isPinned ? "none" : "rotate(45deg)", fill: conv.isPinned ? "var(--text-2)" : "none" }} />
                  {conv.isPinned ? "Unpin" : "Pin"}
                </button>

                {/* Divider */}
                <div style={{ height: 1, background: "var(--border)", margin: "3px 6px" }} />

                {/* Rename */}
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 7, border: "none",
                    background: "transparent", color: "var(--text-2)",
                    fontSize: 13, cursor: "pointer", textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-3)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <Pencil size={13} style={{ flexShrink: 0 }} />
                  Rename
                </button>

                {/* Divider */}
                <div style={{ height: 1, background: "var(--border)", margin: "3px 6px" }} />

                {/* Delete */}
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(conv._id); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 7, border: "none",
                    background: "transparent", color: "var(--rose)",
                    fontSize: 13, cursor: "pointer", textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(244,63,94,0.08)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <Trash2 size={13} style={{ flexShrink: 0 }} />
                  Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

export default function ChatbotPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [model] = useState("gpt-4o-mini");
  const [tokenCount, setTokenCount] = useState(0);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  // ── AI Command Center state ──
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedFeature, setSelectedFeature] = useState(null); // from @mention or dropdown
  const inputWrapRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(false);

  // Countdown timer for rate limit
  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const t = setTimeout(() => setRateLimitCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [rateLimitCountdown]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations()
      .then(({ conversations }) => setConversations(conversations || []))
      .catch(console.error)
      .finally(() => setLoadingConvs(false));
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversation = useCallback(async (convId) => {
    setActiveConvId(convId);
    setMessages([]);
    try {
      const { messages } = await fetchMessages(convId);
      setMessages(messages || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleNewChat = async () => {
    setActiveConvId("new");
    setMessages([]);
    inputRef.current?.focus();
  };

  const handleDeleteConversation = async (convId) => {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c._id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameConversation = async (convId, newTitle) => {
    try {
      await renameConversation(convId, newTitle);
      setConversations((prev) =>
        prev.map((c) => c._id === convId ? { ...c, title: newTitle } : c)
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handlePinConversation = async (convId, isPinned) => {
    try {
      await pinConversation(convId, isPinned);
      setConversations((prev) => {
        const updated = prev.map((c) => c._id === convId ? { ...c, isPinned } : c);
        return updated.sort((a, b) => {
          const pinA = a.isPinned ? 1 : 0;
          const pinB = b.isPinned ? 1 : 0;
          if (pinA !== pinB) return pinB - pinA;
          const timeA = new Date(a.lastMessageAt || a.createdAt).getTime();
          const timeB = new Date(b.lastMessageAt || b.createdAt).getTime();
          return timeB - timeA;
        });
      });
      toast.success(isPinned ? "Conversation pinned" : "Conversation unpinned");
    } catch (err) {
      console.error(err);
      toast.error("Failed to pin conversation");
    }
  };

  const handleSend = async (messageText) => {
    const text = (messageText || input).trim();
    if (!text || isStreaming) return;
    setInput("");
    setMentionActive(false);

    // ── AI Command Center: feature invocation ──────────────
    const featureToInvoke = selectedFeature || (!text.startsWith("@") ? null : null);
    const intent = featureToInvoke ? { feature: featureToInvoke, params: {}, confidence: 100, explanation: `Invoking **${featureToInvoke.name}** as requested.` } : classifyIntent(text);

    if (intent && intent.confidence >= 22) {
      // Show user message
      const userMsg = { _id: `tmp-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() };
      // Show feature panel message
      const featureMsg = {
        _id: `feat-${Date.now()}`, role: "assistant", type: "feature_invocation",
        feature: intent.feature, params: intent.params,
        explanation: intent.explanation,
        content: "", createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg, featureMsg]);
      setSelectedFeature(null);
      if (activeConvId === null) setActiveConvId("new");
      return;
    }

    // ── Suggestion (medium confidence) ──
    if (intent && intent.isSuggestion) {
      toast(
        <span>💡 Did you mean to use <b>{intent.feature.name}</b>? Type <code>@{intent.feature.mention}</code> to invoke it.</span>,
        { duration: 5000, icon: "🔍" }
      );
    }

    setSelectedFeature(null);
    const convId = activeConvId === "new" || !activeConvId ? "new" : activeConvId;

    // Add user message optimistically
    const userMsg = {
      _id: `tmp-${Date.now()}`, role: "user", content: text,
      expandedPrompt: null, createdAt: new Date().toISOString(),
    };
    const streamingMsg = {
      _id: "streaming", role: "assistant", content: "", sourceChunks: [], createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, streamingMsg]);
    setIsStreaming(true);
    abortRef.current = false;

    let finalConvId = convId;

    await sendMessage(convId, text, {
      onExpanded: (expandedPrompt, wasExpanded) => {
        if (wasExpanded) setMessages(prev => prev.map(m => m._id === userMsg._id ? { ...m, expandedPrompt } : m));
      },
      onSources: (chunks) => {
        setMessages(prev => prev.map(m => m._id === "streaming" ? { ...m, sourceChunks: chunks } : m));
      },
      onDbResults: (event) => {
        setMessages(prev => prev.map(m =>
          m._id === "streaming" ? { ...m, dbResults: { count: event.count, total: event.total, query: event.query, leads: event.leads || [] } } : m
        ));
      },
      onDelta: (token) => {
        setMessages(prev => prev.map(m => m._id === "streaming" ? { ...m, content: m.content + token } : m));
      },
      onTokens: (count) => setTokenCount(count),
      onModerated: (categories) => {
        toast.error(`⚠️ Message flagged: ${categories.join(", ")}`, { duration: 5000 });
      },
      onRateLimit: (retryAfter) => {
        setRateLimitCountdown(retryAfter);
        toast.error(`Rate limit reached. Try again in ${retryAfter}s`, { icon: "⏱️" });
      },
      onDone: ({ conversationId, messageId }) => {
        finalConvId = conversationId;
        setMessages(prev => prev.map(m => m._id === "streaming" ? { ...m, _id: messageId } : m));
        if (convId === "new") {
          setActiveConvId(conversationId);
          fetchConversations().then(({ conversations }) => setConversations(conversations || [])).catch(console.error);
        } else {
          setConversations(prev => prev.map(c =>
            c._id === conversationId ? { ...c, messageCount: (c.messageCount || 0) + 2, lastMessageAt: new Date() } : c
          ));
        }
      },
      onError: (msg) => {
        setMessages(prev => prev.filter(m => m._id !== "streaming"));
        setMessages(prev => [...prev, {
          _id: `err-${Date.now()}`, role: "assistant",
          content: `❌ ${msg}`, sourceChunks: [], createdAt: new Date().toISOString(),
        }]);
      },
    }, model);

    setIsStreaming(false);
  };

  // ── @mention detection ─────────────────────────────────
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    // Resize
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
    // Detect @ at start or after space
    const atIdx = val.lastIndexOf("@");
    if (atIdx !== -1 && (atIdx === 0 || val[atIdx - 1] === " ")) {
      setMentionActive(true);
      setMentionQuery(val.slice(atIdx));
    } else {
      setMentionActive(false);
      setMentionQuery("");
    }
  };

  const handleMentionSelect = (feature) => {
    setSelectedFeature(feature);
    setMentionActive(false);
    // Replace the @... in input with @featurename 
    const atIdx = input.lastIndexOf("@");
    setInput(atIdx !== -1 ? input.slice(0, atIdx) + `@${feature.mention} ` : `@${feature.mention} `);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (mentionActive && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape")) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmptyState = messages.length === 0;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* ── Conversations panel — right side ── */}
      <div style={{
        width: 280, flexShrink: 0, display: "flex", flexDirection: "column",
        borderLeft: "1px solid var(--border)", background: "var(--surface)",
        order: 2,
      }}>

        {/* Header */}
        <div style={{
          padding: "18px 16px 12px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg,var(--accent),#f4576a)",
            }}>
              <Bot size={14} color="white" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>AI ChatBot</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>

            <button
              onClick={handleNewChat}
              title="New Chat"
              style={{
                background: "linear-gradient(135deg,var(--accent),#f4576a)",
                border: "none", borderRadius: 7, padding: "5px 8px", cursor: "pointer",
                color: "white", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600,
              }}
            >
              <Plus size={13} /> New
            </button>
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }} className="no-scrollbar">
          {loadingConvs ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)", fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-3)", fontSize: 12 }}>
              <MessageSquare size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div>No conversations yet</div>
              <div style={{ marginTop: 4 }}>Start a new chat above</div>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv._id}
                conv={conv}
                isActive={activeConvId === conv._id}
                onClick={() => loadConversation(conv._id)}
                onDelete={handleDeleteConversation}
                onRename={handleRenameConversation}
                onPin={handlePinConversation}
              />
            ))
          )}
        </div>


      </div>

      {/* ── Chat panel — left side (main area) ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", order: 1 }}>

        {/* Chat header */}
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--surface)", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center", background: "linear-gradient(135deg,var(--accent),#f4576a)",
              boxShadow: "0 0 12px rgba(226,55,68,0.4)", flexShrink: 0,
            }}>
              <Bot size={15} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Doott AI Assistant</div>
              <div style={{ fontSize: 11, color: "var(--accent)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                RAG · Streaming · Moderated
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            {/* Token bar */}
            <TokenBar count={tokenCount} />

            {/* Rate limit warning */}
            {rateLimitCountdown > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                color: "var(--rose)", background: "rgba(244,63,94,0.1)",
                border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "3px 8px"
              }}>
                <Shield size={11} /> Rate limit: {rateLimitCountdown}s
              </div>
            )}

            {activeConvId && activeConvId !== "new" && (
              <button onClick={() => { setActiveConvId(null); setMessages([]); setTokenCount(0); }}
                style={{
                  background: "none", border: "1px solid var(--border)", borderRadius: 7,
                  padding: "5px 10px", cursor: "pointer", color: "var(--text-2)", fontSize: 12,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                <X size={12} /> Close
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }} className="no-scrollbar">
          {isEmptyState ? (
            /* ── Empty state ── */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 24 }}>
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  width: 80, height: 80, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg,rgba(226,55,68,0.2),rgba(139,92,246,0.2))",
                  border: "2px solid rgba(226,55,68,0.3)",
                  boxShadow: "0 0 40px rgba(226,55,68,0.2)",
                }}
              >
                <Sparkles size={32} color="var(--accent)" />
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
                  Doott AI Assistant
                </h2>
                <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-3)" }}>
                  Search leads, companies, and people in the database
                </p>
              </div>

              {/* Suggestion chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 600 }}>
                {SUGGESTIONS.map((s) => (
                  <motion.button
                    key={s}
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (activeConvId === null) setActiveConvId("new");
                      handleSend(s);
                    }}
                    style={{
                      background: "var(--overlay-1)",
                      border: "1px solid var(--border)",
                      borderRadius: 12, padding: "10px 16px",
                      cursor: "pointer", color: "var(--text-2)",
                      fontSize: 13, fontWeight: 500, textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Messages ── */
            <>
              {messages.map((msg) => (
                msg.type === "feature_invocation" ? (
                  <motion.div
                    key={msg._id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginBottom: 20, maxWidth: "88%" }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "linear-gradient(135deg,var(--accent),#f4576a)",
                        border: "1px solid var(--border)", fontSize: 14,
                      }}>
                        {msg.feature.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        <FeatureInvocationPanel
                          feature={msg.feature}
                          params={msg.params}
                          explanation={msg.explanation}
                        />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <MessageBubble
                    key={msg._id}
                    msg={msg}
                    isStreaming={msg._id === "streaming" && isStreaming}
                  />
                )
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input bar */}
        <div style={{
          padding: "16px 24px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
        }}>
          {/* Selected feature chip */}
          <AnimatePresence>
            {selectedFeature && (
              <motion.div
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "rgba(226,55,68,0.15)", border: "1px solid rgba(226,55,68,0.3)",
                  borderRadius: 20, padding: "3px 10px 3px 6px",
                  fontSize: 12, color: "var(--accent)", fontWeight: 600, marginBottom: 8,
                }}
              >
                <span>{selectedFeature.emoji}</span>
                <span>{selectedFeature.name}</span>
                <button onClick={() => setSelectedFeature(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}>
                  <X size={10} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea wrapper — relative for MentionDropdown */}
          <div ref={inputWrapRef} style={{ position: "relative" }}>
            <AnimatePresence>
              {mentionActive && (
                <MentionDropdown
                  query={mentionQuery}
                  onSelect={handleMentionSelect}
                  onClose={() => setMentionActive(false)}
                />
              )}
            </AnimatePresence>

            <div style={{
              display: "flex", gap: 10, alignItems: "flex-end",
              background: "var(--overlay-1)",
              border: `1px solid ${selectedFeature ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 16, padding: "8px 8px 8px 16px",
              transition: "border-color 0.2s",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={selectedFeature ? `Describe your ${selectedFeature.name} request…` : "Ask anything, or type @ to invoke a feature…"}
                rows={1}
                disabled={isStreaming}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "var(--text)", fontSize: 14, lineHeight: 1.5, resize: "none",
                  padding: "4px 0", fontFamily: "inherit", maxHeight: 120,
                }}
              />
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                {/* ⚡ Feature Dropdown */}
                <FeatureDropdown onSelect={(f) => { setSelectedFeature(f); inputRef.current?.focus(); }} />

                {/* Send button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isStreaming}
                  style={{
                    background: input.trim() && !isStreaming
                      ? "linear-gradient(135deg,var(--accent),#f4576a)"
                      : "var(--overlay-2)",
                    border: "none", borderRadius: 10, padding: "8px 12px",
                    cursor: input.trim() && !isStreaming ? "pointer" : "not-allowed",
                    color: input.trim() && !isStreaming ? "white" : "var(--text-3)",
                    display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600,
                    transition: "all 0.2s",
                  }}
                >
                  {isStreaming ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
                  {isStreaming ? "Thinking…" : "Send"}
                </motion.button>
              </div>
            </div>
          </div>

          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
            Type <code style={{ background: "var(--overlay-2)", padding: "0 4px", borderRadius: 3 }}>@feature</code> to invoke · Click <b>⚡ Features</b> to browse · Or just describe what you need
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .markdown-content p { margin: 0 0 8px; }
        .markdown-content p:last-child { margin-bottom: 0; }
        .markdown-content ul, .markdown-content ol { padding-left: 18px; margin: 4px 0 8px; }
        .markdown-content li { margin-bottom: 3px; }
        .markdown-content strong { font-weight: 700; }
        .markdown-content code { background: var(--overlay-border); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
        .markdown-content pre { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; overflow-x: auto; }
        .markdown-content table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 12px; }
        .markdown-content th { background: rgba(226,55,68,0.15); color: var(--accent); font-weight: 700; padding: 7px 10px; border: 1px solid rgba(226,55,68,0.2); text-align: left; white-space: nowrap; }
        .markdown-content td { padding: 6px 10px; border: 1px solid var(--border); color: var(--text-2); vertical-align: top; }
        .markdown-content tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
        .markdown-content tr:hover td { background: rgba(226,55,68,0.05); }
      `}</style>
    </div>
  );
}
