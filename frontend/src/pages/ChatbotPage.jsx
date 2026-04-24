import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Plus, Trash2, Send, Database, ChevronDown,
  ChevronRight, Bot, User, Sparkles, BookOpen, X, Loader2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  fetchConversations, createConversation, fetchMessages,
  deleteConversation, sendMessage
} from "../api/chatbot";

const SUGGESTIONS = [
  "What does our organization do?",
  "What are our key products or services?",
  "Who are our target customers?",
  "What is our company's mission?",
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
        background: "rgba(108,99,255,0.08)",
        border: "1px solid rgba(108,99,255,0.2)",
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
                  background: "rgba(255,255,255,0.04)",
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

function MessageBubble({ msg, isStreaming }) {
  const isUser = msg.role === "user";
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
        maxWidth: "78%",
      }}>
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isUser
            ? "linear-gradient(135deg,var(--accent),#8b5cf6)"
            : "rgba(255,255,255,0.06)",
          border: "1px solid var(--border)",
        }}>
          {isUser ? <User size={14} color="white" /> : <Bot size={14} color="var(--accent)" />}
        </div>

        <div style={{ flex: 1 }}>
          {/* Expanded prompt (user messages) */}
          {isUser && msg.expandedPrompt && (
            <ExpandedPromptBadge expandedPrompt={msg.expandedPrompt} original={msg.content} />
          )}

          {/* Bubble */}
          <div style={{
            background: isUser
              ? "linear-gradient(135deg,var(--accent) 0%,#8b5cf6 100%)"
              : "rgba(255,255,255,0.05)",
            border: isUser ? "none" : "1px solid var(--border)",
            borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            padding: "12px 16px",
            color: isUser ? "white" : "var(--text)",
            fontSize: 14,
            lineHeight: 1.65,
            backdropFilter: "blur(8px)",
          }}>
            {isStreaming && !msg.content ? (
              <TypingDots />
            ) : (
              <div style={{ margin: 0 }} className="markdown-content">
                <ReactMarkdown>{msg.content || ""}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* Source citations (assistant messages) */}
          {!isUser && <SourceCitations chunks={msg.sourceChunks} />}
        </div>
      </div>
    </motion.div>
  );
}

function ConversationItem({ conv, isActive, onClick, onDelete }) {
  const [showDel, setShowDel] = useState(false);
  const date = new Date(conv.lastMessageAt || conv.createdAt);
  const timeStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <motion.div
      whileHover={{ x: 2 }}
      onMouseEnter={() => setShowDel(true)}
      onMouseLeave={() => setShowDel(false)}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", borderRadius: 10, cursor: "pointer",
        background: isActive ? "rgba(108,99,255,0.15)" : "transparent",
        border: isActive ? "1px solid rgba(108,99,255,0.3)" : "1px solid transparent",
        marginBottom: 2, transition: "all 0.15s",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {conv.title || "New Conversation"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {timeStr} · {conv.messageCount || 0} msgs
        </div>
      </div>
      <AnimatePresence>
        {showDel && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={(e) => { e.stopPropagation(); onDelete(conv._id); }}
            style={{
              background: "rgba(239,68,68,0.15)", border: "none", cursor: "pointer",
              color: "#ef4444", borderRadius: 6, padding: "4px 6px", marginLeft: 6, flexShrink: 0,
            }}
          >
            <Trash2 size={12} />
          </motion.button>
        )}
      </AnimatePresence>
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
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(false);

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

  const handleSend = async (messageText) => {
    const text = (messageText || input).trim();
    if (!text || isStreaming) return;
    setInput("");

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
        if (wasExpanded) {
          setMessages((prev) =>
            prev.map((m) => m._id === userMsg._id ? { ...m, expandedPrompt } : m)
          );
        }
      },
      onSources: (chunks) => {
        setMessages((prev) =>
          prev.map((m) => m._id === "streaming" ? { ...m, sourceChunks: chunks } : m)
        );
      },
      onDelta: (token) => {
        setMessages((prev) =>
          prev.map((m) => m._id === "streaming" ? { ...m, content: m.content + token } : m)
        );
      },
      onDone: ({ conversationId, messageId }) => {
        finalConvId = conversationId;
        setMessages((prev) =>
          prev.map((m) => m._id === "streaming" ? { ...m, _id: messageId } : m)
        );
        // Update or add conversation in list
        if (convId === "new") {
          setActiveConvId(conversationId);
          fetchConversations()
            .then(({ conversations }) => setConversations(conversations || []))
            .catch(console.error);
        } else {
          setConversations((prev) =>
            prev.map((c) =>
              c._id === conversationId
                ? { ...c, messageCount: (c.messageCount || 0) + 2, lastMessageAt: new Date() }
                : c
            )
          );
        }
      },
      onError: (msg) => {
        setMessages((prev) => prev.filter((m) => m._id !== "streaming"));
        setMessages((prev) => [...prev, {
          _id: `err-${Date.now()}`, role: "assistant",
          content: `❌ Error: ${msg}`, sourceChunks: [], createdAt: new Date().toISOString(),
        }]);
      },
    });

    setIsStreaming(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmptyState = messages.length === 0;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>

      {/* ── Left Panel: Conversations ── */}
      <div style={{
        width: 280, flexShrink: 0, display: "flex", flexDirection: "column",
        borderRight: "1px solid var(--border)", background: "var(--surface)",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 16px 12px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg,var(--accent),#8b5cf6)",
            }}>
              <Bot size={14} color="white" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>AI ChatBot</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => navigate("/app/chatbot/data")}
              title="Knowledge Base"
              style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
                borderRadius: 7, padding: "5px 7px", cursor: "pointer", color: "var(--text-2)",
                display: "flex", alignItems: "center",
              }}
            >
              <Database size={13} />
            </button>
            <button
              onClick={handleNewChat}
              title="New Chat"
              style={{
                background: "linear-gradient(135deg,var(--accent),#8b5cf6)",
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
              />
            ))
          )}
        </div>

        {/* Knowledge base link */}
        <div style={{ padding: "12px 12px", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => navigate("/app/chatbot/data")}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)",
              borderRadius: 10, padding: "10px 12px", cursor: "pointer",
              color: "var(--accent)", fontSize: 12, fontWeight: 500,
            }}
          >
            <Database size={14} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 600 }}>Knowledge Base</div>
              <div style={{ fontSize: 11, opacity: 0.7, color: "var(--text-3)" }}>Manage org data & memory</div>
            </div>
          </button>
        </div>
      </div>

      {/* ── Right Panel: Chat ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Chat header */}
        <div style={{
          padding: "14px 24px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--surface)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center", background: "linear-gradient(135deg,var(--accent),#8b5cf6)",
              boxShadow: "0 0 12px rgba(108,99,255,0.4)",
            }}>
              <Bot size={15} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Organization AI Assistant</div>
              <div style={{ fontSize: 11, color: "var(--accent)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                RAG · Powered by GPT-4o
              </div>
            </div>
          </div>
          {activeConvId && activeConvId !== "new" && (
            <button
              onClick={() => { setActiveConvId(null); setMessages([]); }}
              style={{
                background: "none", border: "1px solid var(--border)", borderRadius: 7,
                padding: "5px 10px", cursor: "pointer", color: "var(--text-2)", fontSize: 12,
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <X size={12} /> Close
            </button>
          )}
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
                  background: "linear-gradient(135deg,rgba(108,99,255,0.2),rgba(139,92,246,0.2))",
                  border: "2px solid rgba(108,99,255,0.3)",
                  boxShadow: "0 0 40px rgba(108,99,255,0.2)",
                }}
              >
                <Sparkles size={32} color="var(--accent)" />
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
                  Organization AI Assistant
                </h2>
                <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-3)" }}>
                  Ask anything about your organization's knowledge base
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
                      background: "rgba(255,255,255,0.05)",
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
                <MessageBubble
                  key={msg._id}
                  msg={msg}
                  isStreaming={msg._id === "streaming" && isStreaming}
                />
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
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-end",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 16, padding: "8px 8px 8px 16px",
            transition: "border-color 0.2s",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your organization..."
              rows={1}
              disabled={isStreaming}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "var(--text)", fontSize: 14, lineHeight: 1.5, resize: "none",
                padding: "4px 0", fontFamily: "inherit", maxHeight: 120,
              }}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
            />
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate("/app/chatbot/data")}
                title="Knowledge Base"
                style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
                  borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "var(--text-2)",
                  display: "flex", alignItems: "center",
                }}
              >
                <Database size={15} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                style={{
                  background: input.trim() && !isStreaming
                    ? "linear-gradient(135deg,var(--accent),#8b5cf6)"
                    : "rgba(255,255,255,0.06)",
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
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
            Answers are generated from your organization's knowledge base · Short prompts are automatically enhanced
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
        .markdown-content code { background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
        .markdown-content pre { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; overflow-x: auto; }
      `}</style>
    </div>
  );
}
