// ============================================================
// CHATBOT SERVICE — Core RAG (Retrieval-Augmented Generation)
// ============================================================
// Flow:
//  1. expandPrompt()  — enhance short/vague user prompt via LLM
//  2. embedText()     — get 1536-dim embedding via OpenAI
//  3. retrieveTopK()  — cosine similarity search in MongoDB chunks
//  4. streamChat()    — assemble context + GPT-4o streaming → SSE
// ============================================================

"use strict";

const OpenAI = require("openai");
const {
  ChatKnowledgeChunk,
  ChatConversation,
  ChatMessage,
} = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("ChatbotService");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// ── Embedding model ────────────────────────────────────────────
const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims, cheap
const CHAT_MODEL = "gpt-4o";
const TOP_K = 5; // number of chunks to retrieve
const CHUNK_CHAR_LIMIT = 1800; // max chars per chunk in context

// ── Pure JS cosine similarity ──────────────────────────────────
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Embed a single string ──────────────────────────────────────
async function embedText(text) {
  const response = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text.replace(/\n/g, " ").trim().slice(0, 8000),
  });
  return response.data[0].embedding;
}

// ── Retrieve top-K chunks for a query embedding ─────────────────
async function retrieveTopK(orgId, queryEmbedding, k = TOP_K) {
  // Load all chunks for this org (projection: skip the embedding array from wire if too large)
  const chunks = await ChatKnowledgeChunk.find({ orgId })
    .select("text embedding chunkIndex metadata sourceId")
    .lean();

  if (!chunks.length) return [];

  // Score each chunk
  const scored = chunks.map((c) => ({
    ...c,
    similarity: cosineSimilarity(queryEmbedding, c.embedding),
  }));

  // Sort descending and take top K
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

// ── Expand a short/vague user prompt via LLM ──────────────────
async function expandPrompt(userPrompt, orgName = "the organization") {
  // Only expand if the prompt is short (< 60 chars) or clearly under-specified
  const trimmed = userPrompt.trim();
  if (trimmed.length > 80) return trimmed; // already descriptive enough

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 120,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a query expansion assistant for an organization chatbot called "${orgName} AI Assistant".
When given a short, vague, or ambiguous user query, expand it into a clear, specific question that will help retrieve relevant information from the organization's knowledge base.
Return ONLY the expanded question — no explanation, no quotes, no extra text.
If the prompt is already clear and detailed, return it unchanged.`,
        },
        {
          role: "user",
          content: `Short prompt: "${trimmed}"\n\nExpand this into a clear, specific question about ${orgName}'s knowledge base:`,
        },
      ],
    });
    const expanded = response.choices[0]?.message?.content?.trim() || trimmed;
    // Don't return the expansion if it's the same as input
    return expanded === trimmed ? trimmed : expanded;
  } catch (err) {
    logger.warn(`Prompt expansion failed: ${err.message}, using original`);
    return trimmed;
  }
}

// ── Build conversation history for the LLM ────────────────────
async function getConversationHistory(conversationId, limit = 10) {
  const messages = await ChatMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("role content")
    .lean();
  // Reverse to chronological order
  return messages.reverse().map((m) => ({ role: m.role, content: m.content }));
}

// ── Main streaming chat function ────────────────────────────────
/**
 * streamChat — runs the full RAG pipeline and writes SSE events to res.
 *
 * SSE event format:
 *   data: {"type":"expanded","content":"..."}      ← prompt expansion (sent first)
 *   data: {"type":"sources","chunks":[...]}         ← retrieved sources
 *   data: {"type":"delta","content":"..."}          ← streamed answer tokens
 *   data: {"type":"done","conversationId":"..."}    ← completion signal
 *   data: {"type":"error","message":"..."}          ← error
 *
 * @param {Object} opts
 * @param {string} opts.orgId
 * @param {string} opts.userId
 * @param {string|null} opts.conversationId  — null to create new
 * @param {string} opts.userMessage
 * @param {string} opts.orgName
 * @param {Object} res — Express response object for SSE writing
 */
async function streamChat({ orgId, userId, conversationId, userMessage, orgName, res }) {
  const sendEvent = (obj) => {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch (_) {}
  };

  try {
    // ── 1. Ensure / create conversation ─────────────────────────
    let conversation;
    if (conversationId) {
      conversation = await ChatConversation.findOne({ _id: conversationId, orgId, userId });
    }
    if (!conversation) {
      conversation = await ChatConversation.create({
        orgId,
        userId,
        title: userMessage.slice(0, 60),
        lastMessageAt: new Date(),
      });
      conversationId = conversation._id.toString();
    }

    // ── 2. Save user message ─────────────────────────────────────
    const userMsg = await ChatMessage.create({
      conversationId: conversation._id,
      orgId,
      role: "user",
      content: userMessage,
    });

    // ── 3. Expand prompt ─────────────────────────────────────────
    const expandedPrompt = await expandPrompt(userMessage, orgName);
    const wasExpanded = expandedPrompt !== userMessage.trim();

    // Update user message with expanded prompt
    if (wasExpanded) {
      await ChatMessage.findByIdAndUpdate(userMsg._id, { expandedPrompt });
    }

    sendEvent({ type: "expanded", content: expandedPrompt, wasExpanded });

    // ── 4. Embed expanded prompt ─────────────────────────────────
    const queryEmbedding = await embedText(expandedPrompt);

    // ── 5. Retrieve top-K chunks ─────────────────────────────────
    const topChunks = await retrieveTopK(orgId, queryEmbedding);

    // Format source chunks for SSE event
    const sourcesPayload = topChunks.map((c) => ({
      chunkId: c._id,
      sourceName: c.metadata?.sourceName || "Knowledge Base",
      similarity: Math.round(c.similarity * 100) / 100,
      textSnippet: c.text.slice(0, 120) + (c.text.length > 120 ? "…" : ""),
    }));

    sendEvent({ type: "sources", chunks: sourcesPayload });

    // ── 6. Build context string ──────────────────────────────────
    let context = "";
    if (topChunks.length > 0) {
      context = topChunks
        .map(
          (c, i) =>
            `[Source ${i + 1}: ${c.metadata?.sourceName || "Knowledge"}]\n${c.text.slice(0, CHUNK_CHAR_LIMIT)}`
        )
        .join("\n\n---\n\n");
    }

    // ── 7. Get conversation history ──────────────────────────────
    const history = await getConversationHistory(conversation._id);

    // ── 8. Build system prompt ───────────────────────────────────
    const systemPrompt = context
      ? `You are the AI assistant for "${orgName}". You help all organization members answer questions using the organization's knowledge base.

IMPORTANT RULES:
- Answer ONLY from the provided knowledge base context below
- If the answer is not in the context, say "I don't have that information in the knowledge base yet. You can add it via the Knowledge Base page."
- Be concise, clear, and helpful
- Format your response nicely using markdown when appropriate (bullet points, bold text, etc.)
- If referencing specific knowledge, you can say "According to our knowledge base..." 
- Always answer in a friendly, professional tone

ORGANIZATION KNOWLEDGE BASE CONTEXT:
${context}`
      : `You are the AI assistant for "${orgName}". You help all organization members.
The knowledge base is currently empty. Encourage the user to add knowledge via the Knowledge Base page.
For general questions, answer helpfully. For org-specific questions, politely explain you need more context.`;

    // ── 9. Stream GPT-4o response ────────────────────────────────
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(0, -1), // exclude the message we just saved
      { role: "user", content: wasExpanded ? expandedPrompt : userMessage },
    ];

    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      stream: true,
      max_tokens: 1500,
      temperature: 0.7,
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullContent += delta;
        sendEvent({ type: "delta", content: delta });
      }
    }

    // ── 10. Save assistant message ───────────────────────────────
    const assistantMsg = await ChatMessage.create({
      conversationId: conversation._id,
      orgId,
      role: "assistant",
      content: fullContent,
      sourceChunks: topChunks.map((c) => ({
        chunkId: c._id,
        sourceName: c.metadata?.sourceName || "Knowledge Base",
        similarity: c.similarity,
        textSnippet: c.text.slice(0, 150),
      })),
      isComplete: true,
    });

    // ── 11. Update conversation metadata ────────────────────────
    await ChatConversation.findByIdAndUpdate(conversation._id, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 }, // user + assistant
      // Auto-title from first real message (if still default)
      ...(conversation.messageCount === 0
        ? { title: userMessage.slice(0, 60) }
        : {}),
    });

    sendEvent({
      type: "done",
      conversationId: conversation._id.toString(),
      messageId: assistantMsg._id.toString(),
    });
  } catch (err) {
    logger.error(`streamChat error: ${err.message}`);
    sendEvent({ type: "error", message: err.message });
  }
}

module.exports = { embedText, retrieveTopK, expandPrompt, streamChat, cosineSimilarity };
