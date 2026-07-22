// ============================================================
// INTENT CLASSIFIER ENGINE
// Multi-signal NLP: keyword scoring + regex phrases + entity extraction
// Runs entirely on the frontend in <1ms
// ============================================================

export const FEATURE_REGISTRY = [];


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
