// ============================================================
// CHATBOT SERVICE — "Ask Doott" AI Search Assistant
// ============================================================
// Pipeline:
//  1. moderate()           — OpenAI Moderation API (input safety)
//  2. classifyIntent()     — LLM decides: GENERAL_CHAT | DB_SEARCH
//  3. searchFinalDatabase()— Smart parameter extraction + Neon pgvector/HNSW search
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
const { DB_TOTALS } = require("./hybridSearchService");

// ── OpenAI-compatible client (routed through OpenRouter) ───────
// OpenRouter uses the same SDK — just a different baseURL + key.
const openai = new OpenAI({
  apiKey:  process.env.OPENAI_API_KEY || "dummy",
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://doott.in",   // shown in OpenRouter dashboard
    "X-Title":      "Ask Doott",
  },
});

// ── Config ───────────────────────────────────────────────────────
// OpenRouter model IDs  (prefix: provider/model-name)
const CHAT_MODEL     = "openai/gpt-4o-mini";   // fast + cheap for most queries
const FAST_MODEL     = "openai/gpt-4o-mini";   // intent classification
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

// ── Fast regex-based data query detector ─────────────────────────
// Detects 95%+ of data queries WITHOUT an LLM call.
// This ensures DB search always works even when LLM API is down.
const DATA_QUERY_KEYWORDS = [
  // Action verbs
  /\b(find|show|list|get|give|fetch|search|look for|display|tell me|provide|i need|i want)\b/i,
  // Business types
  /\b(company|companies|business|businesses|clinic|clinics|hospital|hospitals|restaurant|restaurants|cafe|cafes|hotel|hotels|shop|shops|store|stores|agency|agencies|firm|firms|dentist|dentists|gym|gyms|school|schools|college|colleges|office|offices|lawyer|lawyers|doctor|doctors)\b/i,
  // People types
  /\b(engineer|engineers|developer|developers|manager|managers|ceo|cfo|cto|founder|founders|director|directors|executive|executives|professional|professionals|consultant|consultants)\b/i,
  // Data fields
  /\b(email|emails|phone|phones|contact|contacts|number|numbers|website|websites|address|addresses|lead|leads)\b/i,
  // Location patterns
  /\b(in (mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|surat|indore|bhopal|lucknow|nagpur|patna|vadodara|visakhapatnam|agra|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas|austin|texas|california|florida|new york|illinois|ohio|georgia|north carolina|michigan|new jersey|virginia|washington|arizona|massachusetts|tennessee|indiana|missouri|maryland|wisconsin|colorado|minnesota|south carolina|alabama|louisiana|kentucky|oregon|oklahoma|connecticut|utah|iowa|nevada|arkansas|mississippi|kansas|new mexico|nebraska|west virginia|idaho|hawaii|new hampshire|maine|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming))\b/i,
];

const GREETINGS_ONLY = /^(hi|hello|hey|how are you|good morning|good afternoon|good evening|thanks|thank you|bye|goodbye|ok|okay|sup|yo|hiya|howdy|greetings)\W*$/i;

function isDataQueryByRegex(message) {
  if (GREETINGS_ONLY.test(message.trim())) return false;
  return DATA_QUERY_KEYWORDS.some(r => r.test(message));
}

async function isDataSearchQuery(userMessage) {
  // Step 1: Fast regex check — no LLM needed
  const regexResult = isDataQueryByRegex(userMessage);
  if (regexResult) {
    logger.info(`[DBClassifier] Regex detected data query: YES`);
    return true;
  }

  // Step 2: LLM check for ambiguous messages — fail OPEN on error
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
- Any B2B or business directory search (e.g. "find X in Y city", "show me businesses with websites")
- People, professionals, executives, engineers, doctors
Answer NO for greetings, general knowledge questions, math, jokes, etc.`,
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
  const { performHybridSearch } = require("./hybridSearchService");

  // ── Step 1: Try LLM-based parameter extraction ───────────────
  let parsed = null;
  try {
    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a search parameter extractor for a B2B leads database containing Indian and global businesses.
Given a natural language query, parse it into structured filters.
Respond in JSON with:
{
  "entityType": "companies" or "people",
  "search": "core search keywords (e.g. 'dentist', 'software engineer', 'restaurant')",
  "f_city": "city name if mentioned (e.g. 'Mumbai', 'Delhi', 'Bangalore', 'Austin')",
  "f_state": "state/province if mentioned (e.g. 'Maharashtra', 'Texas', 'California')",
  "f_industry": "industry if company search (e.g. 'healthcare', 'technology', 'food')",
  "f_job_title": "job title if people search (e.g. 'software engineer', 'doctor', 'CEO')",
  "f_has_email": "true" or "false" (or omit if not specified),
  "f_has_phone": "true" or "false" (or omit if not specified)
}
Examples:
  "Find software engineers in Delhi with verified emails"
  -> { "entityType": "people", "search": "software engineer", "f_city": "Delhi", "f_has_email": "true" }
  "Show dentists in Bangalore"
  -> { "entityType": "companies", "search": "dentist", "f_city": "Bangalore", "f_industry": "healthcare" }
  "List restaurants in Mumbai with phone numbers"
  -> { "entityType": "companies", "search": "restaurant", "f_city": "Mumbai", "f_has_phone": "true" }`
        },
        { role: "user", content: queryText }
      ]
    });
    parsed = JSON.parse(response.choices[0].message.content || "{}");
    logger.info(`[ChatbotSearch] LLM extracted: ${JSON.stringify(parsed)}`);
  } catch (err) {
    // ── Step 2: Regex fallback — no LLM needed ───────────────
    // If LLM is unavailable (quota/error), extract params from raw text
    logger.warn(`[ChatbotSearch] LLM extraction failed (${err.message}) — using regex fallback`);
    parsed = extractParamsByRegex(queryText);
    logger.info(`[ChatbotSearch] Regex fallback extracted: ${JSON.stringify(parsed)}`);
  }

  try {
    const { records, total, mode } = await performHybridSearch({
      entityType: parsed.entityType || "companies",
      search:     parsed.search    || queryText,  // use raw query if no search term extracted
      f_city:     parsed.f_city    || "",
      f_state:    parsed.f_state   || "",
      f_industry: parsed.f_industry || "",
      f_job_title: parsed.f_job_title || "",
      f_has_email: parsed.f_has_email || "",
      f_has_phone: parsed.f_has_phone || "",
      page: 1,
      limit: 20,
    });

    logger.info(`[ChatbotSearch] Search mode: ${mode} | Found: ${records.length} records`);

    // Always return a result object — never return null for data queries.
    // Returning null causes the LLM to hallucinate fake data.
    if (!records.length) {
      return {
        leads: [],
        contextBlock: `## 🗄️ Database Search Results\n> No records found for: "${parsed.search || queryText}" in ${parsed.f_city || "all locations"}`,
        entityType: parsed.entityType || "companies",
        total: 0,
        mode,
      };
    }

    const isComp = parsed.entityType === "companies";
    let rows;
    if (isComp) {
      rows = records.map((r, i) => {
        const name  = r.business_name || "—";
        const loc   = [r.city, r.state].filter(Boolean).join(", ") || "—";
        const ind   = r.industry || "—";
        const email = Array.isArray(r.emails) ? r.emails.join(", ") : (r.emails || "—");
        const phone = r.phone || "—";
        const score = r.similarity_score != null ? `${Math.round(r.similarity_score * 100)}%` : "—";
        return `| ${i+1} | ${name} | ${ind} | ${loc} | ${phone} | ${email} | ${score} |`;
      }).join("\n");
    } else {
      rows = records.map((r, i) => {
        const name  = r.full_name || "—";
        const title = r.job_title || "—";
        const loc   = [r.city, r.state].filter(Boolean).join(", ") || "—";
        const email = Array.isArray(r.emails) ? r.emails.join(", ") : (r.emails || "—");
        const phone = Array.isArray(r.phones) ? r.phones.join(", ") : (r.phones || "—");
        const score = r.similarity_score != null ? `${Math.round(r.similarity_score * 100)}%` : "—";
        return `| ${i+1} | ${name} | ${title} | ${loc} | ${phone} | ${email} | ${score} |`;
      }).join("\n");
    }

    const header    = isComp
      ? `| # | Company Name | Industry | Location | Phone | Emails | Match % |`
      : `| # | Full Name | Job Title | Location | Phones | Emails | Match % |`;
    const separator = `|---|---|---|---|---|---|---|`;
    const contextBlock =
      `## 🗄️ Live Database Search Results (${parsed.entityType || "companies"})\n` +
      `> Searched database for: "${parsed.search || queryText}"\n\n` +
      `${header}\n${separator}\n` + rows;

    return { leads: records, contextBlock, entityType: parsed.entityType || "companies", total, mode };

  } catch (err) {
    logger.error(`[ChatbotSearch] DB query failed: ${err.message}`);
    return null;
  }
}

// ── Regex-based parameter extractor (LLM fallback) ───────────────
function extractParamsByRegex(query) {
  const q = query.toLowerCase();

  // Detect entity type
  const peopleWords = /\b(engineer|developer|manager|ceo|cfo|cto|founder|director|executive|doctor|nurse|teacher|professor|lawyer|consultant|analyst|designer|marketer|accountant|officer|professional|people|person|candidate|talent|staff|employee)\b/i;
  const entityType  = peopleWords.test(query) ? "people" : "companies";

  // Extract city
  const CITIES = ["mumbai","delhi","bangalore","bengaluru","chennai","hyderabad","pune","kolkata","ahmedabad","jaipur","surat","indore","bhopal","lucknow","nagpur","los angeles","new york","chicago","houston","dallas","austin","san francisco","seattle","boston","miami","atlanta","phoenix","denver","portland"];
  let f_city = "";
  for (const city of CITIES) {
    if (q.includes(city)) { f_city = city.split(" ").map(w => w[0].toUpperCase()+w.slice(1)).join(" "); break; }
  }

  // Extract has_email / has_phone
  const f_has_email = /\b(email|emails|verified email)\b/i.test(query) ? "true" : "";
  const f_has_phone = /\b(phone|phones|number|contact)\b/i.test(query) ? "true" : "";

  // Core search term — strip filler words
  const search = query
    .replace(/find|show|list|get|give|fetch|search|display|tell me|i need|i want|me the|give me|atleast|at least|\d+/gi, "")
    .replace(/\bin\s+(mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|surat|indore|bhopal|lucknow|nagpur|los angeles|new york|chicago|houston|dallas|austin)/gi, "")
    .replace(/with (email|phone|number|contact|verified)/gi, "")
    .replace(/\s+/g, " ").trim()
    .slice(0, 60);

  return { entityType, search: search || query.slice(0, 60), f_city, f_has_email, f_has_phone };
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
    const searchTerm = dbResult.contextBlock.match(/for: "([^"]+)"/)?.[1] || "business search";
    const entityLabel = dbResult.entityType === "people" ? "contacts/people" : "companies";
    const searchMode  = dbResult.mode === "vector" ? "semantic AI" : "structured";
    return `You are Ask Doott, the AI assistant for "${orgName}".
Current date and time: ${nowString}

The user searched for: "${searchTerm}" (${searchMode} search across ${entityLabel})

The search results are already displayed as cards in the UI. Do NOT list or repeat the records.

⚠️ CRITICAL RULES — YOU MUST FOLLOW THESE:
1. NEVER invent, fabricate, or guess ANY business names, addresses, phone numbers, emails, or contact details.
2. ONLY reference data that was actually returned from the Neon database search above.
3. The real data is shown in the UI cards — DO NOT make up additional records.
4. If results are empty, say "No records found" — do NOT fill in with made-up data.

INSTRUCTIONS:
- Briefly confirm the results found and what was searched.
- Offer to refine: filter by city, state, industry, email/phone availability.
- Suggest next steps: "Want to export these as CSV?" or "I can search a specific city."
- Keep response SHORT (2-3 sentences) — the data panel is visible to the user.
- Be friendly and professional.`;
  }

  // No DB results case — when DB returned empty or errored
  if (dbResult && dbResult.leads !== undefined) {
    // dbResult exists but leads is empty — DB was searched but no results found
    return `You are Ask Doott, the AI assistant for "${orgName}".
Current date and time: ${nowString}

⚠️ CRITICAL RULES — YOU MUST FOLLOW THESE:
1. NEVER invent, fabricate, or guess ANY business names, addresses, phone numbers, emails, or contact details.
2. The database search returned NO records for this query.
3. Do NOT make up data. Do NOT use your training knowledge to provide fake business listings.
4. Tell the user honestly that no records were found and suggest they try different search terms.

You searched the Neon database (1.78M companies, 43.9M people) but found no matching records.
Tell the user politely, suggest refining their search (different city, broader terms, etc.).`;
  }

  return `You are Ask Doott, a powerful AI-powered B2B lead intelligence assistant for "${orgName}".
Current date and time: ${nowString}

⚠️ CRITICAL RULES — YOU MUST ALWAYS FOLLOW:
1. NEVER invent, fabricate, or guess ANY business names, addresses, phone numbers, emails, or any contact details.
2. NEVER use your training data to generate business listings, company records, or people records.
3. ALL lead data MUST come from the live Neon PostgreSQL database search results ONLY.
4. If the database returns no results, say so clearly — do NOT fill in with made-up records.
5. You are a search interface, not a knowledge base — only report what the database returns.

You have access to a live Neon PostgreSQL database with:
- 🏢 1,781,218 verified companies (India + global)
- 👥 43,932,594 professional people records
- Vector-powered semantic search (all-MiniLM-L6-v2 embeddings)

When the user wants to search for leads, businesses, or people, just ask their query naturally:
  Examples:
  - "Find software engineers in Delhi with emails"
  - "Show dentists in Bangalore with phone numbers"
  - "List IT companies in Pune"
  - "Find restaurant businesses in Mumbai"

You will instantly pull live records from the database.

For general questions (greetings, knowledge questions, etc.) — answer naturally.
You know the current date and time — use it when asked.
Keep answers concise, friendly, and professional.
Format responses with markdown where helpful.`;
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
      // If searchFinalDatabase threw an error and returned null,
      // set an empty result so the LLM uses the no-hallucination prompt
      if (!dbResult) {
        dbResult = { leads: [], contextBlock: "Database search encountered an error.", entityType: "companies", total: 0, mode: "error" };
      }
      if (dbResult) {
        logger.info(`[Chat] ${dbResult.mode || "hybrid"} search: found ${dbResult.leads.length} leads (total in DB: ${dbResult.total?.toLocaleString()})`);
        sendEvent({
          type:   "db_results",
          count:  dbResult.leads.length,
          total:  dbResult.total || (dbResult.entityType === "companies" ? DB_TOTALS.companies : DB_TOTALS.people),
          query:  userMessage,
          mode:   dbResult.mode || "hybrid",
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
