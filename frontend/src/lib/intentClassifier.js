// ============================================================
// INTENT CLASSIFIER ENGINE
// Multi-signal NLP: keyword scoring + regex phrases + entity extraction
// Runs entirely on the frontend in <1ms
// ============================================================

export const FEATURE_REGISTRY = [
  {
    id: "linkedin",
    name: "LinkedIn Finder",
    description: "Find decision-makers on LinkedIn",
    icon: "👤",
    emoji: "👤",
    route: "/app/lg/linkedin",
    mention: "linkedin",
    aliases: ["linkedin", "li"],
    category: "Lead Gen",
    keywords: [
      "linkedin", "find people", "find person", "find professionals",
      "decision maker", "find ceo", "find cto", "find founder",
      "find contact", "people search", "professional search",
    ],
    phrases: [
      /find\s+(the\s+)?(ceo|cto|cmo|vp|founder|director|head)\s+(at|of|in)\s+\w+/i,
      /linkedin\s+(search|find|profile|lookup)/i,
      /who\s+is\s+the\s+(ceo|cto|founder|head|director)/i,
      /find\s+(person|someone|people)\s+(at|in|from)\s+\w+/i,
    ],
    params: ["name", "company", "title"],
  },
  {
    id: "email_finder",
    name: "Email Finder",
    description: "Find verified email addresses for any domain",
    icon: "📧",
    emoji: "📧",
    route: "/app/lg/email",
    mention: "email",
    aliases: ["email", "emailfinder"],
    category: "Lead Gen",
    keywords: [
      "find email", "email address", "contact email", "email for",
      "get email", "verify email", "email finder", "email of", "email at",
    ],
    phrases: [
      /find\s+(the\s+)?email\s+(of|for|at)\s+/i,
      /(get|find)\s+email\s+address/i,
      /email\s+of\s+(the\s+)?(ceo|founder|cto|person)/i,
    ],
    params: ["firstName", "lastName", "domain"],
  },
  {
    id: "company_intel",
    name: "Company Intel",
    description: "Deep company research and intelligence",
    icon: "🏢",
    emoji: "🏢",
    route: "/app/lg/companies",
    mention: "company",
    aliases: ["company", "companyintel", "intel"],
    category: "Lead Gen",
    keywords: [
      "company info", "company intelligence", "research company",
      "company details", "about company", "company profile",
      "tell me about", "company background",
    ],
    phrases: [
      /research\s+(the\s+)?company\s+\w+/i,
      /tell\s+me\s+about\s+\w+\s+(company|startup|firm)/i,
      /company\s+(info|details|profile|intelligence|research|background)/i,
    ],
    params: ["company"],
  },
  {
    id: "ai_research",
    name: "AI Research Agent",
    description: "Deep AI-powered research on any topic",
    icon: "🧠",
    emoji: "🧠",
    route: "/app/lg/research",
    mention: "research",
    aliases: ["research", "airesearch"],
    category: "Lead Gen",
    keywords: [
      "deep research", "investigate", "ai research", "analyze market",
      "market research", "research agent", "do research",
    ],
    phrases: [
      /do\s+(a\s+)?deep\s+research\s+(on|about)/i,
      /investigate\s+(the\s+)?\w+/i,
      /market\s+research\s+(on|for|about)/i,
      /research\s+(on|about)\s+\w+/i,
    ],
    params: ["prompt"],
  },
  {
    id: "places",
    name: "Google Places",
    description: "Find local businesses via Google Maps",
    icon: "📍",
    emoji: "📍",
    route: "/app/places",
    mention: "places",
    aliases: ["places", "maps", "nearby"],
    category: "Tools",
    keywords: [
      "nearby", "near me", "places near", "google maps", "local business",
      "find restaurant", "find shop", "find store", "map search",
    ],
    phrases: [
      /\w+\s+near\s+\w+/i,
      /find\s+\w+\s+(near|in|around)\s+\w+/i,
      /places?\s+(near|in|around|at)\s+\w+/i,
    ],
    params: ["keyword", "location"],
  },
  {
    id: "crawler",
    name: "Web Crawler",
    description: "Crawl websites and extract data",
    icon: "🕷️",
    emoji: "🕷️",
    route: "/app/crawler",
    mention: "crawler",
    aliases: ["crawler", "crawl"],
    category: "Tools",
    keywords: [
      "crawl", "crawl website", "crawl url", "extract from website",
      "website crawl", "crawl page",
    ],
    phrases: [
      /crawl\s+(the\s+)?(website|url|site|page)\s*/i,
      /extract\s+(data\s+)?from\s+(the\s+)?(website|url|site)/i,
    ],
    params: ["url"],
  },
  {
    id: "pipeline",
    name: "Full Pipeline",
    description: "Run the full automated lead generation pipeline",
    icon: "⚙️",
    emoji: "⚙️",
    route: "/app/pipeline",
    mention: "pipeline",
    aliases: ["pipeline"],
    category: "Tools",
    keywords: [
      "run pipeline", "full pipeline", "run full", "pipeline run",
      "run automation", "start pipeline", "run lead generation",
    ],
    phrases: [
      /run\s+(the\s+)?(full\s+)?pipeline/i,
      /start\s+(the\s+)?(full\s+)?pipeline/i,
    ],
    params: [],
  },
  {
    id: "social",
    name: "Social Media",
    description: "Generate and publish social media posts",
    icon: "📱",
    emoji: "📱",
    route: "/app/social",
    mention: "social",
    aliases: ["social", "socialmedia", "post"],
    category: "Outreach",
    keywords: [
      "post on linkedin", "social media post", "generate post",
      "linkedin post", "twitter post", "instagram post", "social post", "create post",
    ],
    phrases: [
      /post\s+(on\s+)?(linkedin|twitter|instagram|facebook)/i,
      /(create|generate|write)\s+(a\s+)?(social\s+)?post/i,
      /social\s+media\s+(post|content|marketing)/i,
    ],
    params: ["platform", "keywords"],
  },
  {
    id: "outreach",
    name: "Smart Outreach",
    description: "Build and send email outreach campaigns",
    icon: "✉️",
    emoji: "✉️",
    route: "/app/outreach",
    mention: "outreach",
    aliases: ["outreach", "email campaign"],
    category: "Outreach",
    keywords: [
      "send email", "email campaign", "outreach campaign",
      "email outreach", "cold email", "send outreach",
    ],
    phrases: [
      /send\s+(cold\s+)?email\s+(to|campaign)/i,
      /(start|run|create)\s+(an?\s+)?outreach\s+campaign/i,
    ],
    params: [],
  },
  {
    id: "leads",
    name: "Lead Database",
    description: "View and manage your saved leads",
    icon: "💾",
    emoji: "💾",
    route: "/app/lg/database",
    mention: "leads",
    aliases: ["leads", "database", "leaddb"],
    category: "Lead Gen",
    keywords: [
      "lead database", "my leads", "saved leads",
      "view leads", "lead list", "all leads",
    ],
    phrases: [
      /(show|view|open)\s+(my\s+)?(lead\s+)?database/i,
      /(show|list|get)\s+(all\s+)?leads/i,
    ],
    params: [],
  },
  {
    id: "websites",
    name: "Website Intelligence",
    description: "Browse crawled website data",
    icon: "🌐",
    emoji: "🌐",
    route: "/app/websites",
    mention: "websites",
    aliases: ["websites", "websiteintel"],
    category: "Tools",
    keywords: ["website intelligence", "website data", "crawled websites", "view websites"],
    phrases: [
      /website\s+(intelligence|data|info)/i,
      /(show|view|browse)\s+websites/i,
    ],
    params: [],
  },
];

// ── Build keyword → feature lookup map (O(1)) ──────────────────
const KEYWORD_MAP = new Map();
for (const feature of FEATURE_REGISTRY) {
  for (const kw of feature.keywords) {
    if (!KEYWORD_MAP.has(kw)) KEYWORD_MAP.set(kw, []);
    KEYWORD_MAP.get(kw).push({ feature, weight: kw.split(" ").length * 5 });
  }
}

// ── Entity Extraction ──────────────────────────────────────────
export function extractEntities(text) {
  const entities = {};

  // Location: "in Mumbai", "near Delhi", "at Bangalore", "from X"
  const locMatch = text.match(
    /\b(?:in|near|at|around|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/
  );
  if (locMatch) entities.location = locMatch[1];

  // Industry keywords
  const INDUSTRIES = [
    "automobile", "automotive", "fintech", "healthcare", "saas", "retail",
    "restaurant", "hotel", "pharmacy", "real estate", "technology",
    "manufacturing", "logistics", "e-commerce", "edtech", "legal",
    "consulting", "insurance", "construction", "media", "startup",
  ];
  const foundIndustries = INDUSTRIES.filter((i) => text.toLowerCase().includes(i));
  if (foundIndustries.length) entities.industryKeywords = foundIndustries;

  // URL
  const urlMatch = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/);
  if (urlMatch) entities.url = urlMatch[1];

  // Email domain
  const domainMatch = text.match(/(?:email\s+(?:for|at|of)\s+)([a-z0-9.-]+\.[a-z]{2,})/i);
  if (domainMatch) entities.domain = domainMatch[1];

  // Company name
  const companyMatch = text.match(/(?:company|startup|firm)\s+(?:called|named)?\s*"?([A-Z][a-zA-Z]+)"?/);
  if (companyMatch) entities.company = companyMatch[1];

  // Platform
  const platforms = ["linkedin", "twitter", "instagram", "facebook"];
  for (const p of platforms) {
    if (text.toLowerCase().includes(p)) { entities.platform = p; break; }
  }

  // Person name (after find/search/look for)
  const nameMatch = text.match(/(?:find|search|look\s+for)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/);
  if (nameMatch) {
    const [first, last] = nameMatch[1].split(" ");
    entities.firstName = first;
    entities.lastName = last;
  }

  return entities;
}

// ── Main Classifier ────────────────────────────────────────────
export function classifyIntent(text) {
  if (!text || text.trim().length < 3) return null;

  const lower = text.toLowerCase().trim();
  const scores = new Map();

  // Init scores
  for (const f of FEATURE_REGISTRY) scores.set(f.id, 0);

  // @mention — highest priority (score 100)
  for (const f of FEATURE_REGISTRY) {
    for (const alias of f.aliases) {
      if (lower.startsWith(`@${alias}`)) {
        return {
          feature: f,
          score: 100,
          confidence: 100,
          params: extractEntities(text.replace(`@${alias}`, "").trim()),
          isSuggestion: false,
          explanation: `You mentioned @${alias}, activating **${f.name}**.`,
        };
      }
    }
  }

  // Keyword scoring
  for (const [kw, entries] of KEYWORD_MAP) {
    if (lower.includes(kw)) {
      for (const { feature, weight } of entries) {
        scores.set(feature.id, (scores.get(feature.id) || 0) + weight);
      }
    }
  }

  // Phrase pattern scoring
  for (const f of FEATURE_REGISTRY) {
    for (const pattern of f.phrases || []) {
      if (pattern.test(text)) {
        scores.set(f.id, (scores.get(f.id) || 0) + 18);
      }
    }
  }

  // Find winner
  let bestId = null, bestScore = 0;
  for (const [id, score] of scores) {
    if (score > bestScore) { bestScore = score; bestId = id; }
  }

  if (bestScore < 8) return null;

  const feature = FEATURE_REGISTRY.find((f) => f.id === bestId);
  const params = extractEntities(text);

  return {
    feature,
    score: bestScore,
    confidence: Math.min(100, bestScore),
    params,
    isSuggestion: bestScore < 22,
    explanation: `I detected you want to use **${feature.name}**. Here's the tool pre-filled with your query:`,
  };
}

// ── Mention search (for @mention dropdown) ──────────────────────
export function searchFeaturesByMention(query) {
  const q = query.toLowerCase();
  return FEATURE_REGISTRY.filter(
    (f) =>
      f.mention.includes(q) ||
      f.name.toLowerCase().includes(q) ||
      f.aliases.some((a) => a.includes(q))
  );
}
