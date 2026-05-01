import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, FileText, Trash2, Edit3, Plus, Check,
  X, Loader2, Database, AlertCircle, File, RefreshCw
} from "lucide-react";
import {
  fetchKnowledgeSources, fetchKnowledgeSource, addTextKnowledge,
  uploadFileKnowledge, updateKnowledgeSource, deleteKnowledgeSource,
  fetchKnowledgeStats,
} from "../api/chatbot";

const STATUS_COLORS = {
  ready: { bg: "rgba(34,197,94,0.12)", text: "#22c55e", label: "Ready" },
  processing: { bg: "rgba(251,191,36,0.12)", text: "#fbbf24", label: "Processing" },
  error: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", label: "Error" },
};

const TYPE_ICONS = { text: FileText, file: File, auto_seeded: Database };

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.processing;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
      background: s.bg, color: s.text,
    }}>
      {status === "processing" && (
        <Loader2 size={9} style={{ animation: "spin 1s linear infinite", marginRight: 4, display: "inline" }} />
      )}
      {s.label}
    </span>
  );
}

function SourceCard({ source, onEdit, onDelete, onRefresh }) {
  const [deleting, setDeleting] = useState(false);
  const Icon = TYPE_ICONS[source.type] || FileText;
  const wordCount = source.rawContent
    ? source.rawContent.split(/\s+/).length
    : Math.round((source.chunkCount || 0) * 80);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteKnowledgeSource(source._id);
      onRefresh();
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14, padding: 18,
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.2)", flexShrink: 0,
          }}>
            <Icon size={16} color="var(--accent)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontWeight: 600, fontSize: 14, color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {source.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              {source.type === "file" ? source.fileName : source.type === "auto_seeded" ? "Auto-seeded" : "Text block"}
              {" · "}~{wordCount.toLocaleString()} words · {source.chunkCount || 0} chunks
            </div>
          </div>
        </div>
        <StatusBadge status={source.status} />
      </div>

      {/* Preview */}
      {source.preview && (
        <div style={{
          fontSize: 12, color: "var(--text-3)", lineHeight: 1.6,
          background: "var(--overlay-1)", borderRadius: 8, padding: "8px 10px",
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {source.preview}
        </div>
      )}

      {/* Error */}
      {source.status === "error" && source.errorMessage && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          color: "#ef4444", fontSize: 12, background: "rgba(239,68,68,0.08)",
          borderRadius: 8, padding: "6px 10px",
        }}>
          <AlertCircle size={12} />
          {source.errorMessage}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        {source.type !== "file" && (
          <button
            onClick={() => onEdit(source)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--overlay-2)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: "var(--text-2)", fontSize: 12,
            }}
          >
            <Edit3 size={12} /> Edit
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: "#ef4444", fontSize: 12,
          }}
        >
          {deleting ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />}
          Delete
        </button>
      </div>
    </motion.div>
  );
}

function EditModal({ source, onClose, onSaved }) {
  const [name, setName] = useState(source.name);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchKnowledgeSource(source._id)
      .then(({ source: s }) => { setText(s.rawContent || ""); setLoading(false); })
      .catch(() => setLoading(false));
  }, [source._id]);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await updateKnowledgeSource(source._id, text, name);
      onSaved();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 18, padding: 28, width: "100%", maxWidth: 600,
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Edit Knowledge Source</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}>
            <X size={16} />
          </button>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", background: "var(--overlay-1)",
              border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)",
              fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Content</label>
          {loading ? (
            <div style={{ textAlign: "center", padding: 20, color: "var(--text-3)" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              style={{
                width: "100%", padding: "10px 12px", background: "var(--overlay-1)",
                border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)",
                fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit",
                lineHeight: 1.6, boxSizing: "border-box",
              }}
            />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", background: "var(--overlay-2)", border: "1px solid var(--border)",
              borderRadius: 8, cursor: "pointer", color: "var(--text-2)", fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            style={{
              padding: "8px 20px",
              background: "linear-gradient(135deg,var(--accent),#8b5cf6)",
              border: "none", borderRadius: 8, cursor: "pointer", color: "white", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />}
            {saving ? "Re-processing…" : "Save & Re-embed"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ChatbotDataPage() {
  const navigate = useNavigate();
  const [sources, setSources] = useState([]);
  const [stats, setStats] = useState({ sourceCount: 0, chunkCount: 0 });
  const [loading, setLoading] = useState(true);
  const [editSource, setEditSource] = useState(null);

  // Text form
  const [textName, setTextName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [addingText, setAddingText] = useState(false);

  // File upload
  const [dragOver, setDragOver] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [{ sources }, s] = await Promise.all([fetchKnowledgeSources(), fetchKnowledgeStats()]);
      setSources(sources || []);
      setStats(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddText = async (e) => {
    e.preventDefault();
    if (!textName.trim() || !textContent.trim()) return;
    setAddingText(true);
    try {
      await addTextKnowledge(textName.trim(), textContent.trim());
      setTextName("");
      setTextContent("");
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingText(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploadingFile(true);
    try {
      await uploadFileKnowledge(file);
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => navigate("/app/chatbot")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--overlay-2)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: "var(--text-2)", fontSize: 13, fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> Back to ChatBot
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Knowledge Base</h1>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>
              Organization memory — {stats.sourceCount} sources · {stats.chunkCount} indexed chunks
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "1px solid var(--border)",
            borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: "var(--text-3)", fontSize: 12,
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, maxWidth: 1100 }}>

        {/* ── Left: Add Knowledge ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Text block */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: 24,
          }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
              <FileText size={16} color="var(--accent)" /> Add Text Knowledge
            </h3>
            <form onSubmit={handleAddText} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 5 }}>
                  Source Name *
                </label>
                <input
                  value={textName}
                  onChange={(e) => setTextName(e.target.value)}
                  placeholder="e.g. Company Overview, Product FAQ..."
                  style={{
                    width: "100%", padding: "9px 12px", background: "var(--overlay-1)",
                    border: "1px solid var(--border)", borderRadius: 9, color: "var(--text)",
                    fontSize: 13, outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 5 }}>
                  Content *
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your organization's knowledge here — facts, FAQs, processes, team info, products..."
                  rows={7}
                  style={{
                    width: "100%", padding: "10px 12px", background: "var(--overlay-1)",
                    border: "1px solid var(--border)", borderRadius: 9, color: "var(--text)",
                    fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit",
                    lineHeight: 1.6, boxSizing: "border-box",
                  }}
                />
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, textAlign: "right" }}>
                  {textContent.length} chars · ~{Math.round(textContent.split(/\s+/).length)} words
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={addingText || !textName.trim() || !textContent.trim()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: addingText || !textName.trim() || !textContent.trim()
                    ? "var(--overlay-2)"
                    : "linear-gradient(135deg,var(--accent),#8b5cf6)",
                  border: "none", borderRadius: 10, padding: "11px",
                  cursor: "pointer", color: "white", fontSize: 14, fontWeight: 600,
                }}
              >
                {addingText
                  ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Processing & Embedding…</>
                  : <><Plus size={14} /> Add to Knowledge Base</>
                }
              </motion.button>
            </form>
          </div>

          {/* File upload */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: 24,
          }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Upload size={16} color="var(--accent)" /> Upload File
            </h3>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !uploadingFile && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 12, padding: "32px 20px",
                textAlign: "center", cursor: uploadingFile ? "not-allowed" : "pointer",
                background: dragOver ? "rgba(108,99,255,0.06)" : "var(--overlay-1)",
                transition: "all 0.2s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                style={{ display: "none" }}
                onChange={(e) => handleFileUpload(e.target.files[0])}
              />
              {uploadingFile ? (
                <>
                  <Loader2 size={28} color="var(--accent)" style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                  <div style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>Processing & Embedding…</div>
                  <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4 }}>This may take a moment</div>
                </>
              ) : (
                <>
                  <Upload size={28} color={dragOver ? "var(--accent)" : "var(--text-3)"} style={{ marginBottom: 8 }} />
                  <div style={{ color: "var(--text)", fontWeight: 500, fontSize: 14 }}>
                    {dragOver ? "Drop to upload" : "Drag & drop or click to browse"}
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
                    Supports PDF, TXT, Markdown · Max 20 MB
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Sources list ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              Stored Sources ({sources.length})
            </h3>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ marginTop: 10 }}>Loading knowledge base…</div>
            </div>
          ) : sources.length === 0 ? (
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18,
              padding: "40px 24px", textAlign: "center", color: "var(--text-3)",
            }}>
              <Database size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: "var(--text)" }}>No knowledge yet</div>
              <div style={{ fontSize: 13 }}>Add text or upload files to train the chatbot on your organization's data.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <AnimatePresence mode="popLayout">
                {sources.map((src) => (
                  <SourceCard
                    key={src._id}
                    source={src}
                    onEdit={setEditSource}
                    onDelete={() => {}}
                    onRefresh={loadData}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editSource && (
          <EditModal
            source={editSource}
            onClose={() => setEditSource(null)}
            onSaved={() => { setEditSource(null); loadData(); }}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
