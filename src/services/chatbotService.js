// ============================================================
// CHATBOT SERVICE — Production-Grade RAG Pipeline
// ============================================================
// Pipeline:
//  1. moderate()          — OpenAI Moderation API (input safety)
//  2. classifyIntent()    — LLM decides: GENERAL_CHAT | KB_QUERY
//  3. expandPrompt()      — Enhance KB queries for better retrieval
//  4. embedText()         — Get embedding via OpenAI
//  5. retrieveTopK()      — Cosine similarity search, threshold-filtered
//  6. trimHistoryToTokens()— BPE token counting via js-tiktoken
//  7. streamChat()        — Smart system prompt + GPT-4o streaming → SSE
//  8. moderate()          — Moderation on assistant output (post-check)
//
// Algorithms:
//  - Cosine similarity:   angle between embedding vectors (not magnitude)
//  - BPE tokenization:    byte-pair encoding — same tokenizer as GPT-4o
//  - Sliding window rate: handled in rateLimit middleware (upstream)
// ============================================================

"use strict";

const OpenAI = require("openai");
const {
  ChatKnowledgeChunk,
  ChatConversation,
  ChatMessage,
} = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("ChatbotService");
const { ingestText } = require("./knowledgeIngestService");
const { moderate, getSafeDeclineMessage } = require("./moderationService");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// ── Config ─────────────────────────────────────────────────────
const EMBED_MODEL    = "text-embedding-3-small";
const CHAT_MODEL     = "gpt-4o";
const FAST_MODEL     = "gpt-4o-mini";
const TOP_K          = 6;
const CHUNK_CHAR_LIMIT    = 1800;
const SIMILARITY_THRESHOLD = 0.35;

// Context window management
// gpt-4o supports 128K tokens — we cap at 100K to leave room for response
const MAX_CONTEXT_TOKENS = 100_000;
// Approximate tokens per avg message (used when tiktoken unavailable)
const AVG_TOKENS_PER_CHAR = 0.25;

// ── Tiktoken (BPE tokenizer) ────────────────────────────────────
// Byte-Pair Encoding: splits text into subword tokens.
// 1 token ≈ 4 characters in English.
// This is the same tokenizer GPT-4o uses internally.
let encoder = null;
async function getEncoder() {
  if (encoder) return encoder;
  try {
    const { encoding_for_model } = await import("js-tiktoken");
    encoder = encoding_for_model("gpt-4o");
    logger.info("[Token] BPE encoder loaded (js-tiktoken)");
  } catch (err) {
    logger.warn(`[Token] js-tiktoken unavailable, using char estimate: ${err.message}`);
  }
  return encoder;
}

/**
 * Count tokens in a string using BPE (or char estimate as fallback).
 */
async function countTokens(text) {
  const enc = await getEncoder();
  if (enc) {
    try {
      const tokens = enc.encode(text || "");
      return tokens.length;
    } catch {
      /* fall through */
    }
  }
  return Math.ceil((text || "").length * AVG_TOKENS_PER_CHAR);
}

/**
 * Count tokens in an array of chat messages.
 */
async function countMessageTokens(messages) {
  let total = 0;
  for (const m of messages) {
    // +4 per message for role/separator overhead
    total += 4 + await countTokens(m.content || "");
  }
  total += 2; // reply primer
  return total;
}

/**
 * Trim oldest history messages until total fits within maxTokens.
 * Always preserves at least the last 2 messages (current turn).
 */
async function trimHistoryToTokens(history, systemPrompt, maxTokens = MAX_CONTEXT_TOKENS) {
  const systemTokens = await countTokens(systemPrompt);
  let budget = maxTokens - systemTokens - 500; // 500 token response buffer

  // Work from newest to oldest
  const kept = [];
  let usedTokens = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msgTokens = 4 + await countTokens(history[i].content || "");
    if (usedTokens + msgTokens > budget && kept.length >= 2) break;
    kept.unshift(history[i]);
    usedTokens += msgTokens;
  }

  const trimmedCount = history.length - kept.length;
  if (trimmedCount > 0) {
    logger.info(`[Token] Trimmed ${trimmedCount} old messages to stay within ${maxTokens} token limit`);
  }

  return { trimmedHistory: kept, tokenCount: usedTokens + systemTokens };
}

// ── Pure JS cosine similarity ───────────────────────────────────
// Compares two vectors by the angle between them (not magnitude).
// Score range: -1 to 1. 1.0 = identical direction (highly relevant).
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Embed a single string ───────────────────────────────────────
async function embedText(text) {
  const response = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text.replace(/\n/g, " ").trim().slice(0, 8000),
  });
  return response.data[0].embedding;
}

// ── Intent classifier ───────────────────────────────────────────
// GENERAL_CHAT: greetings, chitchat, math, general world knowledge
// KB_QUERY:     questions about the organization, products, policies
async function classifyIntent(userMessage, orgName, conversationHistory = []) {
  try {
    const normalized = userMessage.trim().toLowerCase();
    const GREETINGS = [
      "hi", "hello", "hey", "good morning", "good afternoon",
      "good evening", "how are you", "what's up", "sup", "yo", "hiya",
      "greetings", "howdy", "thanks", "thank you", "bye", "goodbye",
      "ok", "okay", "sure", "great", "cool", "nice", "awesome",
    ];
    if (GREETINGS.some(g => normalized === g || normalized === g + "!")) {
      return "GENERAL_CHAT";
    }

    const historySnippet = conversationHistory.slice(-4)
      .map(m => `${m.role}: ${m.content.slice(0, 80)}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 10,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are an intent classifier for an AI assistant of the company "${orgName}".
Classify the user's message into ONE of these two categories:

KB_QUERY — the user is asking something that might be found in the company's knowledge base:
  - Questions about the company, its products, services, team, processes, policies
  - Questions about the company's clients, revenue, strategy, data
  - Questions that reference "we", "our", "the company", "the organization"
  - Follow-up questions in a business/company context

GENERAL_CHAT — everything else:
  - Greetings ("hello", "hi", "how are you")
  - General world knowledge ("what is machine learning?", "who is Elon Musk?")
  - Math, coding, writing help not related to the company
  - Personal chitchat, opinions, jokes

Recent conversation:
${historySnippet || "(none)"}

Respond with ONLY one word: KB_QUERY or GENERAL_CHAT`,
        },
        { role: "user", content: userMessage },
      ],
    });

    const intent = response.choices[0]?.message?.content?.trim().toUpperCase();
    if (intent === "KB_QUERY" || intent === "GENERAL_CHAT") return intent;
    return "KB_QUERY";
  } catch (err) {
    logger.warn(`Intent classification failed: ${err.message}, defaulting to KB_QUERY`);
    return "KB_QUERY";
  }
}

// ── Retrieve top-K chunks by cosine similarity ──────────────────
async function retrieveTopK(orgId, queryEmbedding, k = TOP_K) {
  const chunks = await ChatKnowledgeChunk.find({ orgId })
    .select("text embedding chunkIndex metadata sourceId")
    .lean();

  if (!chunks.length) return [];

  const scored = chunks.map(c => ({
    ...c,
    similarity: cosineSimilarity(queryEmbedding, c.embedding),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);

  // Threshold filter — discard irrelevant chunks
  return scored.filter(c => c.similarity >= SIMILARITY_THRESHOLD).slice(0, k);
}

// ── Expand short KB queries for better retrieval ────────────────
async function expandPrompt(userPrompt, orgName = "the organization") {
  const trimmed = userPrompt.trim();
  if (trimmed.length > 80) return trimmed;

  try {
    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 120,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a search query optimizer for "${orgName}"'s internal knowledge base.
Rewrite the user's short question into a more specific, search-friendly query that will retrieve the most relevant documents.
Return ONLY the rewritten query — no explanation, no quotes.
If the question is already clear, return it unchanged.`,
        },
        {
          role: "user",
          content: `User question: "${trimmed}"\n\nRewrite for better search:`,
        },
      ],
    });
    const expanded = response.choices[0]?.message?.content?.trim() || trimmed;
    return expanded === trimmed ? trimmed : expanded;
  } catch (err) {
    logger.warn(`Prompt expansion failed: ${err.message}`);
    return trimmed;
  }
}

// ── Build conversation history for the LLM ─────────────────────
async function getConversationHistory(conversationId, limit = 20) {
  const messages = await ChatMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("role content")
    .lean();
  return messages.reverse().map(m => ({ role: m.role, content: m.content }));
}

// ── Silent knowledge ingestion from user messages ───────────────
async function detectAndIngestKnowledge(orgId, userId, userMessage, orgName) {
  try {
    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a knowledge extraction agent for "${orgName}". 
Detect if the user's message contains a factual statement about the organization that should be permanently remembered.
Do NOT extract questions, greetings, or conversational messages.
Respond ONLY with: { "containsKnowledge": boolean, "extractedKnowledge": "...", "title": "..." }`,
        },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
    });
    const result = JSON.parse(response.choices[0].message.content);
    if (result.containsKnowledge && result.extractedKnowledge) {
      await ingestText(orgId, userId, result.title || "Auto-detected Knowledge", result.extractedKnowledge);
      logger.info(`Auto-ingested knowledge: ${result.title}`);
    }
  } catch (err) {
    logger.error(`Knowledge detection failed: ${err.message}`);
  }
}

// ── Build the right system prompt ──────────────────────────────
function buildSystemPrompt(orgName, intent, retrievedChunks) {
  const hasContext = retrievedChunks.length > 0;
  const context = hasContext
    ? retrievedChunks
        .map((c, i) => `[Source ${i + 1}: ${c.metadata?.sourceName || "Knowledge"}]\n${c.text.slice(0, CHUNK_CHAR_LIMIT)}`)
        .join("\n\n---\n\n")
    : null;

  const now = new Date();
  const nowString = now.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  if (intent === "GENERAL_CHAT") {
    return `You are a helpful, friendly AI assistant for "${orgName}".
Current date and time: ${nowString}
Engage naturally in conversation. Answer general questions from your own knowledge.
You know the current date and time — use it when asked.
For company-specific questions, let the user know you can look those up from the knowledge base.
Keep answers concise and friendly.
Format responses with markdown where it improves readability.`;
  }

  if (hasContext) {
    return `You are the AI assistant for "${orgName}". You help team members find information quickly.
Current date and time: ${nowString}

You have retrieved the following relevant information from the knowledge base:

${context}

INSTRUCTIONS:
- Use the retrieved context above to answer the user's question accurately.
- If the context fully answers the question, answer directly and confidently.
- If the context is partially relevant, use what's useful and note any gaps.
- If none of the context is relevant to the specific question, say: "I couldn't find specific information about that in our knowledge base. You can add it via the Knowledge Base page."
- You know the current date and time — use it when asked.
- Always answer in a friendly, professional tone.
- Format responses with markdown (bold, bullets, code blocks, etc.) where it improves readability.
- You may use your general knowledge to explain concepts, but for org-specific facts, rely on the context above.
- Chain-of-thought: reason step by step for complex questions before giving the final answer.`;
  }

  return `You are the AI assistant for "${orgName}". You help team members find information.
Current date and time: ${nowString}

The knowledge base was searched but no relevant information was found for this query.

INSTRUCTIONS:
- Let the user know you couldn't find relevant information in the knowledge base for their specific question.
- Be specific about what you searched for.
- Encourage them to add the relevant information via the Knowledge Base page.
- For any general/factual aspects of their question, you can still help with your general knowledge.
- You know the current date and time — use it when asked.
- Stay helpful and friendly — don't just give a flat "I don't know".`;
}

// ── Main streaming chat function ────────────────────────────────
async function streamChat({ orgId, userId, conversationId, userMessage, orgName, model, res }) {
  const sendEvent = (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (_) {}
  };

  const chatModel = model || CHAT_MODEL;

  try {
    // ── 1. Content moderation on user input ─────────────────────
    const inputMod = await moderate(userMessage, "input");
    if (inputMod.flagged) {
      logger.warn(`[Chat] User message flagged by moderation: ${inputMod.categories.join(", ")}`);
      sendEvent({ type: "moderated", categories: inputMod.categories });
      sendEvent({ type: "delta", content: getSafeDeclineMessage(inputMod.categories) });
      sendEvent({ type: "done", conversationId: conversationId || "new", messageId: null, moderated: true });
      return;
    }

    // ── 2. Ensure / create conversation ─────────────────────────
    let conversation;
    if (conversationId) {
      conversation = await ChatConversation.findOne({ _id: conversationId, orgId, userId });
    }
    if (!conversation) {
      conversation = await ChatConversation.create({
        orgId, userId,
        title: userMessage.slice(0, 60),
        lastMessageAt: new Date(),
      });
      conversationId = conversation._id.toString();
    }

    // ── 3. Save user message ─────────────────────────────────────
    const userMsg = await ChatMessage.create({
      conversationId: conversation._id,
      orgId, role: "user", content: userMessage,
    });

    // ── Background: detect & ingest knowledge ───────────────────
    detectAndIngestKnowledge(orgId, userId, userMessage, orgName).catch(() => {});

    // ── 4. Get conversation history ──────────────────────────────
    const history = await getConversationHistory(conversation._id);

    // ── 5. Classify intent ───────────────────────────────────────
    const intent = await classifyIntent(userMessage, orgName, history.slice(0, -1));
    logger.info(`[Chat] Intent: ${intent} | Model: ${chatModel} | Msg: "${userMessage.slice(0, 50)}"`);

    let expandedPrompt = userMessage;
    let wasExpanded = false;
    let topChunks = [];

    if (intent === "KB_QUERY") {
      // ── 6a. Expand prompt ────────────────────────────────────
      expandedPrompt = await expandPrompt(userMessage, orgName);
      wasExpanded = expandedPrompt !== userMessage.trim();
      if (wasExpanded) {
        await ChatMessage.findByIdAndUpdate(userMsg._id, { expandedPrompt });
      }

      // ── 6b. Embed & retrieve ─────────────────────────────────
      const queryEmbedding = await embedText(expandedPrompt);
      topChunks = await retrieveTopK(orgId, queryEmbedding);

      logger.info(`[Chat] Retrieved ${topChunks.length} chunks (threshold: ${SIMILARITY_THRESHOLD})`);
      if (topChunks.length > 0) {
        logger.info(`[Chat] Top similarity: ${topChunks[0].similarity.toFixed(3)}`);
      }
    }

    // Send expanded prompt event
    sendEvent({ type: "expanded", content: expandedPrompt, wasExpanded });

    // Send sources event
    const sourcesPayload = topChunks.map(c => ({
      chunkId: c._id,
      sourceName: c.metadata?.sourceName || "Knowledge Base",
      similarity: Math.round(c.similarity * 100) / 100,
      textSnippet: c.text.slice(0, 120) + (c.text.length > 120 ? "…" : ""),
    }));
    sendEvent({ type: "sources", chunks: sourcesPayload });

    // ── 7. Build system prompt ───────────────────────────────────
    const systemPrompt = buildSystemPrompt(orgName, intent, topChunks);

    // ── 8. Token counting + history trimming ─────────────────────
    const { trimmedHistory, tokenCount } = await trimHistoryToTokens(
      history.slice(0, -1),
      systemPrompt
    );

    // Send token count info to UI
    sendEvent({ type: "tokens", count: tokenCount, model: chatModel });

    // ── 9. Stream GPT response ───────────────────────────────────
    const messages = [
      { role: "system", content: systemPrompt },
      ...trimmedHistory,
      { role: "user", content: wasExpanded ? expandedPrompt : userMessage },
    ];

    const stream = await openai.chat.completions.create({
      model: chatModel,
      messages,
      stream: true,
      max_tokens: 2000,
      temperature: intent === "GENERAL_CHAT" ? 0.8 : 0.4,
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullContent += delta;
        sendEvent({ type: "delta", content: delta });
      }
    }

    // ── 10. Moderate assistant output ────────────────────────────
    const outputMod = await moderate(fullContent, "output");
    if (outputMod.flagged) {
      logger.warn(`[Chat] Output flagged — replacing with safe message`);
      fullContent = getSafeDeclineMessage(outputMod.categories);
    }

    // ── 11. Save assistant message ───────────────────────────────
    const assistantMsg = await ChatMessage.create({
      conversationId: conversation._id,
      orgId,
      role: "assistant",
      content: fullContent,
      sourceChunks: topChunks.map(c => ({
        chunkId: c._id,
        sourceName: c.metadata?.sourceName || "Knowledge Base",
        similarity: c.similarity,
        textSnippet: c.text.slice(0, 150),
      })),
      isComplete: true,
    });

    // ── 12. Update conversation metadata ─────────────────────────
    await ChatConversation.findByIdAndUpdate(conversation._id, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 },
      ...(conversation.messageCount === 0 ? { title: userMessage.slice(0, 60) } : {}),
    });

    sendEvent({
      type: "done",
      conversationId: conversation._id.toString(),
      messageId: assistantMsg._id.toString(),
      tokenCount,
    });
  } catch (err) {
    logger.error(`streamChat error: ${err.message}`);
    sendEvent({ type: "error", message: err.message });
  }
}

module.exports = {
  embedText,
  retrieveTopK,
  expandPrompt,
  classifyIntent,
  streamChat,
  cosineSimilarity,
  countTokens,
};
