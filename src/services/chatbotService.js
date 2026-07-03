// ============================================================
// CHATBOT SERVICE — Search-Engine Chat Integration
// ============================================================
// Pipeline:
//  1. moderate()           — OpenAI Moderation API (input safety)
//  2. classifyIntent()     — LLM decides: GENERAL_CHAT | DB_SEARCH
//  3. searchFinalDatabase()— Smart parameter extraction + local pgvector/FTS search
//  4. trimHistoryToTokens()— BPE token counting via js-tiktoken
//  5. streamChat()         — Smart system prompt + GPT-4o streaming → SSE
// ============================================================

"use strict";

const OpenAI = require("openai");
const {
  ChatConversation,
  ChatMessage,
} = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("ChatbotService");
const { moderate, getSafeDeclineMessage } = require("./moderationService");
const { query: pgQuery } = require("../db/cloudSql");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });

// ── Config ─────────────────────────────────────────────────────
const CHAT_MODEL     = "gpt-4o";
const FAST_MODEL     = "gpt-4o-mini";
const MAX_CONTEXT_TOKENS = 100_000;
const AVG_TOKENS_PER_CHAR = 0.25;

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

async function countMessageTokens(messages) {
  let total = 0;
  for (const m of messages) {
    total += 4 + await countTokens(m.content || "");
  }
  total += 2;
  return total;
}

async function trimHistoryToTokens(history, systemPrompt, maxTokens = MAX_CONTEXT_TOKENS) {
  const systemTokens = await countTokens(systemPrompt);
  let budget = maxTokens - systemTokens - 500;

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATABASE SEARCH INTEGRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function isDataSearchQuery(userMessage) {
  try {
    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 5,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a query classifier. Respond with only YES or NO.
Answer YES if the user is asking to search for, find, or list business records such as:
- Businesses, companies, cafes, restaurants, dentists, gyms, stores, agencies, clinics, shops
- Leads, contacts, prospects, phone numbers, emails, websites
- Any B2B or business directory search (e.g. "find X in Y city", "show me businesses with websites", "list dentists in Austin")
Answer NO for all other messages (greetings, general knowledge, math, etc.).`,
        },
        { role: "user", content: userMessage },
      ],
    });
    const ans = response.choices[0]?.message?.content?.trim().toUpperCase();
    return ans === "YES";
  } catch (err) {
    logger.warn(`[DBClassifier] isDataSearchQuery failed: ${err.message}`);
    return false;
  }
}

async function searchFinalDatabase(queryText) {
  try {
    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a search parameter extractor for a B2B leads database.
Given a natural language query, parse it into structured filters.
Respond in JSON with:
{
  "entityType": "companies" or "people",
  "search": "keywords for search",
  "f_city": "city name if mentioned",
  "f_state": "state name or abbreviation if mentioned",
  "f_industry": "industry if company search",
  "f_job_title": "job title if people search",
  "f_has_email": "true" or "false" (or leave empty if not specified),
  "f_has_phone": "true" or "false" (or leave empty if not specified)
}
Example: "Find software engineers in Delhi with verified emails"
-> { "entityType": "people", "search": "software engineer", "f_city": "Delhi", "f_has_email": "true" }`
        },
        { role: "user", content: queryText }
      ]
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    logger.info(`[ChatbotSearch] Extracted parameters: ${JSON.stringify(parsed)}`);

    const { performHybridSearch } = require("./hybridSearchService");
    const { records, total } = await performHybridSearch({
      entityType: parsed.entityType || "companies",
      search: parsed.search || "",
      f_city: parsed.f_city || "",
      f_state: parsed.f_state || "",
      f_industry: parsed.f_industry || "",
      f_job_title: parsed.f_job_title || "",
      f_has_email: parsed.f_has_email || "",
      f_has_phone: parsed.f_has_phone || "",
      page: 1,
      limit: 10,
    });

    if (!records.length) return null;

    const isComp = parsed.entityType === "companies";
    let rows;
    if (isComp) {
      rows = records.map((r, i) => {
        const name = r.business_name || "—";
        const loc = [r.city, r.state].filter(Boolean).join(", ") || "—";
        const ind = r.industry || "—";
        const email = Array.isArray(r.emails) ? r.emails.join(", ") : (r.emails || "—");
        const phone = r.phone || "—";
        const score = r.similarity_score != null ? `${Math.round(r.similarity_score * 100)}%` : "—";
        return `| ${i+1} | ${name} | ${ind} | ${loc} | ${phone} | ${email} | ${score} |`;
      }).join("\n");
    } else {
      rows = records.map((r, i) => {
        const name = r.full_name || "—";
        const title = r.job_title || "—";
        const loc = [r.city, r.state].filter(Boolean).join(", ") || "—";
        const email = Array.isArray(r.emails) ? r.emails.join(", ") : (r.emails || "—");
        const phone = Array.isArray(r.phones) ? r.phones.join(", ") : (r.phones || "—");
        const score = r.similarity_score != null ? `${Math.round(r.similarity_score * 100)}%` : "—";
        return `| ${i+1} | ${name} | ${title} | ${loc} | ${phone} | ${email} | ${score} |`;
      }).join("\n");
    }

    const header = isComp 
      ? `| # | Company Name | Industry | Location | Phone | Emails | Match % |`
      : `| # | Full Name | Job Title | Location | Phones | Emails | Match % |`;
    const separator = isComp
      ? `|---|---|---|---|---|---|---|`
      : `|---|---|---|---|---|---|---|`;

    const contextBlock = 
      `## 🗄️ Live Database Search Results (${parsed.entityType || "companies"})\n` +
      `> Searched database for: "${parsed.search || queryText}"\n\n` +
      `${header}\n${separator}\n` +
      rows;

    return { leads: records, contextBlock, entityType: parsed.entityType || "companies" };
  } catch (err) {
    logger.error(`[ChatbotSearch] searchFinalDatabase failed: ${err.message}`);
    return null;
  }
}

// ── Intent classifier ───────────────────────────────────────────
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

DB_SEARCH — the user is asking to search, list, filter, find leads, companies, or people from the database.
GENERAL_CHAT — greetings, general world knowledge questions, or other chit-chat.

Recent conversation:
${historySnippet || "(none)"}

Respond with ONLY one word: DB_SEARCH or GENERAL_CHAT`,
        },
        { role: "user", content: userMessage },
      ],
    });

    const intent = response.choices[0]?.message?.content?.trim().toUpperCase();
    if (intent === "DB_SEARCH" || intent === "GENERAL_CHAT") return intent;
    return "DB_SEARCH";
  } catch (err) {
    return "DB_SEARCH";
  }
}

async function getConversationHistory(conversationId, limit = 20) {
  const messages = await ChatMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("role content")
    .lean();
  return messages.reverse().map(m => ({ role: m.role, content: m.content }));
}

// ── Build the right system prompt ──────────────────────────────
function buildSystemPrompt(orgName, dbResult = null) {
  const hasDbResult  = dbResult && dbResult.leads && dbResult.leads.length > 0;

  const now = new Date();
  const nowString = now.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  if (hasDbResult) {
    return `You are the AI assistant for "${orgName}". You have access to a live business database.
Current date and time: ${nowString}

The user asked: "${dbResult.contextBlock.match(/for: "([^"]+)"/)?.[1] || "business search"}"

The search results have already been displayed to the user as a visual card panel in the UI.
Do NOT list or repeat the business records — the user can already see them.

INSTRUCTIONS:
- Briefly confirm how many results were found and what was searched.
- Offer to help the user filter, sort, or export the results.
- If the user asks for more details about a specific business, answer based on the data.
- Suggest useful next steps (e.g. "Want me to filter by phone number?" or "I can search a specific city.").
- Keep your response SHORT (2-3 sentences max) since the data is already visible.
- Always answer in a friendly, professional tone.`;
  }

  return `You are "Ask Doott", a helpful, friendly AI assistant for the B2B Lead Generator platform "${orgName}".
Current date and time: ${nowString}
Engage naturally in conversation. Answer general questions from your own knowledge.
You know the current date and time — use it when asked.
If the user wants to search for leads, companies, or people, let them know they can type their query here (e.g., "Find software engineers in Chennai") and you will pull the live records directly.
Keep answers concise and friendly.
Format responses with markdown where it improves readability.`;
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

    // ── 4. Get conversation history ──────────────────────────────
    const history = await getConversationHistory(conversation._id);

    // ── 5. Classify intent + check data search in parallel ─────
    const [intent, isDataSearch] = await Promise.all([
      classifyIntent(userMessage, orgName, history.slice(0, -1)),
      isDataSearchQuery(userMessage),
    ]);
    logger.info(`[Chat] Intent: ${intent} | isDataSearch: ${isDataSearch} | Model: ${chatModel} | Msg: "${userMessage.slice(0, 50)}"`);

    let dbResult = null;

    // ── 6. DB search ──
    if (isDataSearch) {
      dbResult = await searchFinalDatabase(userMessage);
      if (dbResult) {
        logger.info(`[Chat] Hybrid Search: found ${dbResult.leads.length} leads`);
        sendEvent({
          type:   "db_results",
          count:  dbResult.leads.length,
          total:  dbResult.entityType === "companies" ? 1781218 : 43932594,
          query:  userMessage,
          leads:  dbResult.leads.map(r => {
            if (dbResult.entityType === "companies") {
              return {
                name:     r.business_name  || "",
                category: r.industry       || "",
                city:     r.city           || "",
                state:    r.state          || "",
                phone:    r.phone          || "",
                website:  r.website        || "",
                email:    Array.isArray(r.emails) ? r.emails.join(", ") : (r.emails || ""),
                match:    r.similarity_score != null ? Math.round(r.similarity_score * 100) : null,
              };
            } else {
              return {
                name:     r.full_name      || "",
                category: r.job_title      || "",
                city:     r.city           || "",
                state:    r.state          || "",
                phone:    Array.isArray(r.phones) ? r.phones.join(", ") : (r.phones || ""),
                website:  r.linked_url     || "",
                email:    Array.isArray(r.emails) ? r.emails.join(", ") : (r.emails || ""),
                match:    r.similarity_score != null ? Math.round(r.similarity_score * 100) : null,
              };
            }
          }),
        });
      }
    }

    // Send expanded prompt event (original query)
    sendEvent({ type: "expanded", content: userMessage, wasExpanded: false });

    // Send sources event (empty since knowledge RAG is removed)
    sendEvent({ type: "sources", chunks: [] });

    // ── 7. Build system prompt ───────────────────────────────────
    const systemPrompt = buildSystemPrompt(orgName, dbResult);

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
      { role: "user", content: userMessage },
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
      sourceChunks: [],
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
  expandPrompt: async (text) => text,
  classifyIntent,
  streamChat,
  countTokens,
};
