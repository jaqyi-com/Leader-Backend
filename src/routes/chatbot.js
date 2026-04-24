// ============================================================
// CHATBOT ROUTES — /api/chatbot/*
// ============================================================
// All routes require authentication (auth middleware applied in server.js)
// Organization is resolved from req.user.orgId
// ============================================================

"use strict";

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { auth } = require("../middleware/auth");
const { streamChat } = require("../services/chatbotService");
const {
  ingestText,
  ingestFile,
  deleteSource,
  updateSource,
  autoSeedOrgKnowledge,
} = require("../services/knowledgeIngestService");
const {
  ChatConversation,
  ChatMessage,
  ChatKnowledgeSource,
  Organization,
} = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("ChatbotRouter");

// Multer: store files in memory (max 20 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "text/plain",
      "application/pdf",
      "application/octet-stream",
    ];
    const allowedExts = [".txt", ".pdf", ".md"];
    const ext = (file.originalname || "").toLowerCase();
    const isAllowedExt = allowedExts.some((e) => ext.endsWith(e));
    if (allowed.includes(file.mimetype) || isAllowedExt) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ── Helper: get org from user ──────────────────────────────────
async function getOrgFromUser(req) {
  // req.user is populated by the auth middleware (JWT)
  const orgId = req.user?.orgId;
  if (!orgId) throw new Error("No organization associated with your account");
  return orgId;
}

// ── Helper: get org display name ──────────────────────────────
async function getOrgName(orgId) {
  try {
    const org = await Organization.findById(orgId).select("name").lean();
    return org?.name || "Your Organization";
  } catch {
    return "Your Organization";
  }
}

// ============================================================
// CONVERSATION ROUTES
// ============================================================

// GET /api/chatbot/conversations — list user's conversations
router.get("/conversations", auth, async (req, res) => {
  try {
    const orgId = await getOrgFromUser(req);
    const conversations = await ChatConversation.find({
      orgId,
      userId: req.user.userId,
    })
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean();

    res.json({ conversations });
  } catch (err) {
    logger.error(`GET /conversations: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chatbot/conversations — create new empty conversation
router.post("/conversations", auth, async (req, res) => {
  try {
    const orgId = await getOrgFromUser(req);
    const conversation = await ChatConversation.create({
      orgId,
      userId: req.user.userId,
      title: req.body.title || "New Conversation",
    });
    res.json({ conversation });
  } catch (err) {
    logger.error(`POST /conversations: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chatbot/conversations/:id/messages — load messages for a conversation
router.get("/conversations/:id/messages", auth, async (req, res) => {
  try {
    const orgId = await getOrgFromUser(req);
    const conversation = await ChatConversation.findOne({
      _id: req.params.id,
      orgId,
      userId: req.user.userId,
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const messages = await ChatMessage.find({ conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ messages, conversation });
  } catch (err) {
    logger.error(`GET /conversations/:id/messages: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chatbot/conversations/:id — delete a conversation and its messages
router.delete("/conversations/:id", auth, async (req, res) => {
  try {
    const orgId = await getOrgFromUser(req);
    const conversation = await ChatConversation.findOne({
      _id: req.params.id,
      orgId,
      userId: req.user.userId,
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    await ChatMessage.deleteMany({ conversationId: conversation._id });
    await ChatConversation.findByIdAndDelete(conversation._id);

    res.json({ success: true });
  } catch (err) {
    logger.error(`DELETE /conversations/:id: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CHAT (SSE Streaming) ROUTE
// ============================================================

// POST /api/chatbot/conversations/:id/chat — send a message (SSE stream)
// conversationId can be "new" to auto-create one
router.post("/conversations/:id/chat", auth, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const orgId = await getOrgFromUser(req);
    const orgName = await getOrgName(orgId);

    // Trigger auto-seed if knowledge base is empty (non-blocking)
    autoSeedOrgKnowledge(orgId).catch(() => {});

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders();

    const conversationId =
      req.params.id === "new" ? null : req.params.id;

    await streamChat({
      orgId,
      userId: req.user.userId,
      conversationId,
      userMessage: message.trim(),
      orgName,
      res,
    });

    res.end();
  } catch (err) {
    logger.error(`POST /conversations/:id/chat: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      res.end();
    }
  }
});

// ============================================================
// KNOWLEDGE BASE ROUTES
// ============================================================

// GET /api/chatbot/knowledge — list org's knowledge sources
router.get("/knowledge", auth, async (req, res) => {
  try {
    const orgId = await getOrgFromUser(req);
    const sources = await ChatKnowledgeSource.find({ orgId })
      .sort({ createdAt: -1 })
      .select("-rawContent") // don't send raw content in list view (can be large)
      .lean();

    // Include a short preview
    const withPreview = sources.map((s) => ({
      ...s,
      preview: s.rawContent ? s.rawContent.slice(0, 200) : undefined,
    }));

    res.json({ sources: withPreview });
  } catch (err) {
    logger.error(`GET /knowledge: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chatbot/knowledge/:id — get single source with full content
router.get("/knowledge/:id", auth, async (req, res) => {
  try {
    const orgId = await getOrgFromUser(req);
    const source = await ChatKnowledgeSource.findOne({ _id: req.params.id, orgId }).lean();
    if (!source) return res.status(404).json({ error: "Source not found" });
    res.json({ source });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chatbot/knowledge/text — add a text knowledge block
router.post("/knowledge/text", auth, async (req, res) => {
  const { name, text } = req.body;
  if (!name || !text) {
    return res.status(400).json({ error: "name and text are required" });
  }
  if (text.trim().length < 10) {
    return res.status(400).json({ error: "Text is too short (min 10 characters)" });
  }

  try {
    const orgId = await getOrgFromUser(req);
    const source = await ingestText(orgId, req.user.userId, name.trim(), text.trim());
    res.json({ success: true, source });
  } catch (err) {
    logger.error(`POST /knowledge/text: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chatbot/knowledge/file — upload a file
router.post(
  "/knowledge/file",
  auth,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const orgId = await getOrgFromUser(req);
      const source = await ingestFile(orgId, req.user.userId, req.file);
      res.json({ success: true, source });
    } catch (err) {
      logger.error(`POST /knowledge/file: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /api/chatbot/knowledge/:id — edit a source (re-embeds)
router.put("/knowledge/:id", auth, async (req, res) => {
  const { text, name } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  try {
    const orgId = await getOrgFromUser(req);

    // Optionally update name too
    if (name) {
      await ChatKnowledgeSource.findOneAndUpdate(
        { _id: req.params.id, orgId },
        { name }
      );
    }

    const source = await updateSource(orgId, req.params.id, text.trim());
    res.json({ success: true, source });
  } catch (err) {
    logger.error(`PUT /knowledge/:id: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chatbot/knowledge/:id — delete a source and all its chunks
router.delete("/knowledge/:id", auth, async (req, res) => {
  try {
    const orgId = await getOrgFromUser(req);
    await deleteSource(orgId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error(`DELETE /knowledge/:id: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chatbot/knowledge/stats — get stats for the knowledge base
router.get("/knowledge-stats", auth, async (req, res) => {
  try {
    const orgId = await getOrgFromUser(req);
    const { ChatKnowledgeChunk } = require("../db/mongoose");
    const [sourceCount, chunkCount] = await Promise.all([
      ChatKnowledgeSource.countDocuments({ orgId }),
      ChatKnowledgeChunk.countDocuments({ orgId }),
    ]);
    res.json({ sourceCount, chunkCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
