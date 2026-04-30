// ============================================================
// CHATBOT SERVICE — Smart Intent-Gated RAG Pipeline
// ============================================================
// Flow:
//  1. classifyIntent()  — LLM decides: GENERAL_CHAT | KB_QUERY | MIXED
//  2. expandPrompt()    — enhance KB queries for better retrieval
//  3. embedText()       — get embedding via OpenAI (only for KB_QUERY)
//  4. retrieveTopK()    — cosine similarity search, filtered by threshold
//  5. streamChat()      — smart system prompt + GPT-4o streaming → SSE
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// ── Config ────────────────────────────────────────────────────
const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o";
const TOP_K = 5;
const CHUNK_CHAR_LIMIT = 1800;
// Minimum cosine similarity to consider a chunk "relevant"
// Chunks below this score are discarded even if retrieved
const SIMILARITY_THRESHOLD = 0.35;

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

// ── Intent classifier — decides if KB retrieval is needed ──────
// Returns: "GENERAL_CHAT" | "KB_QUERY"
// GENERAL_CHAT: greetings, chitchat, math, general world knowledge,
//               coding help, writing help, anything not org-specific
// KB_QUERY:     questions about the organization, its products,
//               policies, team, data, clients, processes, etc.
async function classifyIntent(userMessage, orgName, conversationHistory = []) {
  try {
    // Fast heuristic: very short greetings / chitchat → skip LLM call entirely
    const normalized = userMessage.trim().toLowerCase();
    const GREETINGS = ["hi", "hello", "hey", "good morning", "good afternoon",
      "good evening", "how are you", "what's up", "sup", "yo", "hiya",
      "greetings", "howdy", "thanks", "thank you", "bye", "goodbye",
      "ok", "okay", "sure", "great", "cool", "nice", "awesome"];
    if (GREETINGS.some(g => normalized === g || normalized === g + "!")) {
      return "GENERAL_CHAT";
    }

    // Recent conversation context (last 4 messages) to help classify follow-ups
    const historySnippet = conversationHistory.slice(-4)
      .map(m => `${m.role}: ${m.content.slice(0, 80)}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
  - Venting or off-topic conversation

Recent conversation:
${historySnippet || "(none)"}

Respond with ONLY one word: KB_QUERY or GENERAL_CHAT`
        },
        { role: "user", content: userMessage },
      ],
    });

    const intent = response.choices[0]?.message?.content?.trim().toUpperCase();
    if (intent === "KB_QUERY" || intent === "GENERAL_CHAT") return intent;
    return "KB_QUERY"; // safe default: try KB first
  } catch (err) {
    logger.warn(`Intent classification failed: ${err.message}, defaulting to KB_QUERY`);
    return "KB_QUERY";
  }
}

// ── Retrieve top-K chunks and apply similarity threshold ────────
async function retrieveTopK(orgId, queryEmbedding, k = TOP_K) {
  const chunks = await ChatKnowledgeChunk.find({ orgId })
    .select("text embedding chunkIndex metadata sourceId")
    .lean();

  if (!chunks.length) return [];

  const scored = chunks.map((c) => ({
    ...c,
    similarity: cosineSimilarity(queryEmbedding, c.embedding),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);

  // Apply similarity threshold — only return chunks that are actually relevant
  const relevant = scored.filter(c => c.similarity >= SIMILARITY_THRESHOLD);
  return relevant.slice(0, k);
}

// ── Expand a KB query prompt for better retrieval ──────────────
// ONLY called when intent is KB_QUERY
async function expandPrompt(userPrompt, orgName = "the organization") {
  const trimmed = userPrompt.trim();
  if (trimmed.length > 80) return trimmed;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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

// ── Build conversation history for the LLM ────────────────────
async function getConversationHistory(conversationId, limit = 10) {
  const messages = await ChatMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("role content")
    .lean();
  return messages.reverse().map((m) => ({ role: m.role, content: m.content }));
}

// ── Silently ingest organizational knowledge from user messages ─
async function detectAndIngestKnowledge(orgId, userId, userMessage, orgName) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a knowledge extraction agent for "${orgName}". 
Detect if the user's message contains a factual statement about the organization that should be permanently remembered.
Do NOT extract questions, greetings, or conversational messages.
Respond ONLY with: { "containsKnowledge": boolean, "extractedKnowledge": "...", "title": "..." }`
        },
        { role: "user", content: userMessage }
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

// ── Build the right system prompt based on what was retrieved ───
function buildSystemPrompt(orgName, intent, retrievedChunks) {
  const hasContext = retrievedChunks.length > 0;
  const context = hasContext
    ? retrievedChunks
        .map((c, i) => `[Source ${i + 1}: ${c.metadata?.sourceName || "Knowledge"}]\n${c.text.slice(0, CHUNK_CHAR_LIMIT)}`)
        .join("\n\n---\n\n")
    : null;

  // Always inject current date/time so the bot can answer date-related questions
  const now = new Date();
  const nowString = now.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  if (intent === "GENERAL_CHAT") {
    // Pure conversational — no KB retrieval was done
    return `You are a helpful, friendly AI assistant for "${orgName}".
Current date and time: ${nowString}
Engage naturally in conversation. Answer general questions from your own knowledge.
You know the current date and time — use it when asked.
For company-specific questions, let the user know you can look those up from the knowledge base.
Keep answers concise and friendly.`;
  }

  if (hasContext) {
    // KB was queried and found relevant results
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
- Format responses with markdown (bold, bullets, etc.) where it improves readability.
- You may use your general knowledge to explain concepts, but for org-specific facts, rely on the context above.`;
  }

  // KB was queried but nothing relevant was found (below threshold)
  return `You are the AI assistant for "${orgName}". You help team members find information.
Current date and time: ${nowString}

The knowledge base was searched but no relevant information was found for this query.

INSTRUCTIONS:
- Let the user know you couldn't find relevant information in the knowledge base for their specific question.
- Be specific about what you searched for.
- Encourage them to add the relevant information via the Knowledge Base page so you can answer similar questions in the future.
- For any general/factual aspects of their question, you can still help with your general knowledge.
- You know the current date and time — use it when asked.
- Stay helpful and friendly — don't just give a flat "I don't know".`;
}

// ── Main streaming chat function ────────────────────────────────
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

    // ── Background: detect & ingest knowledge from user messages ─
    detectAndIngestKnowledge(orgId, userId, userMessage, orgName).catch(() => {});

    // ── 3. Get conversation history (needed for intent + LLM) ────
    const history = await getConversationHistory(conversation._id);

    // ── 4. Classify intent — THE GATING STEP ─────────────────────
    const intent = await classifyIntent(userMessage, orgName, history.slice(0, -1));
    logger.info(`[Chat] Intent classified as: ${intent} for: "${userMessage.slice(0, 50)}"`);

    let expandedPrompt = userMessage;
    let wasExpanded = false;
    let topChunks = [];

    if (intent === "KB_QUERY") {
      // ── 5a. Expand prompt for better retrieval ─────────────────
      expandedPrompt = await expandPrompt(userMessage, orgName);
      wasExpanded = expandedPrompt !== userMessage.trim();

      if (wasExpanded) {
        await ChatMessage.findByIdAndUpdate(userMsg._id, { expandedPrompt });
      }

      // ── 5b. Embed and retrieve relevant chunks ─────────────────
      const queryEmbedding = await embedText(expandedPrompt);
      topChunks = await retrieveTopK(orgId, queryEmbedding);

      logger.info(`[Chat] Retrieved ${topChunks.length} relevant chunks (threshold: ${SIMILARITY_THRESHOLD})`);
      if (topChunks.length > 0) {
        logger.info(`[Chat] Top similarity: ${topChunks[0].similarity.toFixed(3)}`);
      }
    }

    // Send expanded prompt event (for UI badge display)
    sendEvent({ type: "expanded", content: expandedPrompt, wasExpanded });

    // Send sources event (empty array for GENERAL_CHAT)
    const sourcesPayload = topChunks.map((c) => ({
      chunkId: c._id,
      sourceName: c.metadata?.sourceName || "Knowledge Base",
      similarity: Math.round(c.similarity * 100) / 100,
      textSnippet: c.text.slice(0, 120) + (c.text.length > 120 ? "…" : ""),
    }));
    sendEvent({ type: "sources", chunks: sourcesPayload });

    // ── 6. Build smart system prompt ────────────────────────────
    const systemPrompt = buildSystemPrompt(orgName, intent, topChunks);

    // ── 7. Stream GPT-4o response ────────────────────────────────
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(0, -1),
      { role: "user", content: wasExpanded ? expandedPrompt : userMessage },
    ];

    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      stream: true,
      max_tokens: 1500,
      temperature: intent === "GENERAL_CHAT" ? 0.8 : 0.5,
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullContent += delta;
        sendEvent({ type: "delta", content: delta });
      }
    }

    // ── 8. Save assistant message ─────────────────────────────────
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

    // ── 9. Update conversation metadata ─────────────────────────
    await ChatConversation.findByIdAndUpdate(conversation._id, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 },
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

module.exports = { embedText, retrieveTopK, expandPrompt, classifyIntent, streamChat, cosineSimilarity };

