import axios from "axios";

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const DEFAULT_LOCAL = "http://localhost:3001/api";

// In production, VITE_API_URL MUST be set to your backend Vercel URL
export const BASE = import.meta.env.VITE_API_URL || (isLocal ? DEFAULT_LOCAL : "");

if (!isLocal && !import.meta.env.VITE_API_URL) {
  console.error("[API] ⚠️  VITE_API_URL is not set! Set it in your Vercel frontend environment variables.");
}

const api = axios.create({ baseURL: BASE, timeout: 300000 });

// ── Auth interceptor ───────────────────────────────────────────────────────
// Automatically attach JWT to every request and redirect on token expiry.
function applyAuthInterceptors(instance) {
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem("leader_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        // Token expired or invalid — clear and redirect to login
        localStorage.removeItem("leader_token");
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
      return Promise.reject(err);
    }
  );
}

applyAuthInterceptors(api);


// --- Stats ---
export const getStats       = ()         => api.get("/stats");

// --- Pipeline ---
export const runFull        = ()         => api.post("/pipeline/all");
export const runScrape      = (cfg = {}) => api.post("/pipeline/scrape", cfg);
export const runEnrich      = (cfg = {}) => api.post("/pipeline/enrich", cfg);
export const runOutreach    = (step = 1, approved = []) => api.post("/pipeline/outreach", { step, approved });
export const previewOutreach = (cfg = {}) => api.post("/pipeline/outreach/preview", cfg);
export const runScore       = ()         => api.post("/pipeline/score");
export const runReport      = ()         => api.post("/pipeline/report");
export const processReply   = (data)     => api.post("/pipeline/reply", data);
export const resetState     = ()         => api.post("/reset");

// --- ICP ---
export const getIcp         = ()         => api.get("/icp");
export const saveIcp        = (data)     => api.post("/icp", data);

// --- Environment / Credentials ---
export const getEnv         = ()         => api.get("/env");
export const saveEnv        = (data)     => api.post("/env", data);

// --- Logs ---
export const getLogs        = ()         => api.get("/logs");

// --- Sheets ---
export const getSheetsData   = ()                          => api.get("/sheets/data");
export const deleteSheetRow  = (sheet, rowIndex)           => api.delete("/sheets/row", { data: { sheet, rowIndex } });
export const clearSheet      = (sheet)                     => api.delete("/sheets/clear", { data: { sheet } });
export const listScrapeRuns  = ()                          => api.get("/sheets/runs");
export const getScrapeRunData = (tabName)                  => api.get(`/sheets/runs/${encodeURIComponent(tabName)}`);

// --- Scheduler ---
export const getSchedules   = ()         => api.get("/schedule");
export const saveSchedule   = (phase, cronExpr, enabled) =>
  api.post("/schedule", { phase, cron: cronExpr, enabled });

// --- Autonomous SDR ---
export const getAutonomousLeads  = ()            => api.get("/autonomous");
export const createAutonomousLead= (data)        => api.post("/autonomous", data);
export const getAutonomousLead   = (id)          => api.get(`/autonomous/${id}`);
export const runAutonomousResearch = (id)        => api.post(`/autonomous/${id}/research`);
export const runAutonomousOutreach = (id)        => api.post(`/autonomous/${id}/outreach`);

// ============================================================
// CRAWLER API
// ============================================================
const CRAWLER_BASE =
  import.meta.env.VITE_CRAWLER_API_URL ||
  (isLocal ? "http://localhost:3001/api/crawler" : `${BASE.replace(/\/api$/, "")}/api/crawler`);

export const crawlerApi = axios.create({ baseURL: CRAWLER_BASE, timeout: 300000 });
applyAuthInterceptors(crawlerApi);


// --- Crawler (website crawl) ---
export const startCrawlFromUrls = (urls = [], keywords = [], customFields = []) =>
  crawlerApi.post("/start", { urls, keywords, customFields });

export const startCrawlFromCsv = (formData) =>
  crawlerApi.post("/upload-csv", formData);

// SSE log stream URL — used with EventSource directly in the component
export const getCrawlerLogStreamUrl = () => `${CRAWLER_BASE}/logs/stream`;

// --- Google Places ---
export const geocodePlacesAddress = (address) =>
  crawlerApi.get("/places/geocode", { params: { address } });

export const autocompletePlaces = (input) =>
  crawlerApi.get("/places/autocomplete", { params: { input } });

export const getPlaceDetails = (place_id) =>
  crawlerApi.get("/places/details", { params: { place_id } });

export const searchPlaces = (lat, lng, radius, keyword) =>
  crawlerApi.post("/places/search", { lat, lng, radius, keyword });

export const getStoredPlaces = (params = {}) =>
  crawlerApi.get("/places", { params });

export const getPlacesHistory = () =>
  crawlerApi.get("/places/history");

export const exportPlacesCsv = (places) =>
  crawlerApi.post("/places/export-csv", places, { responseType: "blob" });

// --- Website Intelligence ---
export const getWebsites = (params = {}) =>
  crawlerApi.get("/websites", { params });

export const getWebsitesByDateRange = (from, to, params = {}) =>
  crawlerApi.get("/websites", { params: { from, to, ...params } });

// --- Crawl Runs ---
export const getCrawlRuns = () =>
  crawlerApi.get("/runs");

export const getCrawlRunWebsites = (runId, params = {}) =>
  crawlerApi.get(`/runs/${encodeURIComponent(runId)}/websites`, { params });

// --- Auto Scraper ---
export const startAutoScraper = (body) =>
  crawlerApi.post("/auto-scraper/start", body);

export const getAutoScraperSessions = () =>
  crawlerApi.get("/auto-scraper/sessions");

export const geocodeLocation = (q) =>
  crawlerApi.get("/auto-scraper/geocode", { params: { q } });

export const autocompleteLocation = (q) =>
  crawlerApi.get("/auto-scraper/autocomplete", { params: { q } });

export const analyzeScraperDescription = (description) =>
  crawlerApi.post("/auto-scraper/analyze", { description });

// ============================================================
// LEAD GENERATOR API
// ============================================================
// BASE ends in /api (e.g. https://backend.vercel.app/api)
// Strip it so lgApi can call /api/lead-generator/... cleanly
const BACKEND_ROOT = BASE.replace(/\/api$/, "");
export { BACKEND_ROOT };

const lgApi = axios.create({ baseURL: BACKEND_ROOT, timeout: 120000 });
applyAuthInterceptors(lgApi);

export const lgAnalyzeProspect      = (description)  => lgApi.post("/api/lead-generator/analyze-prospect", { description });
export const lgLinkedInSearch       = (params)        => lgApi.post("/api/lead-generator/linkedin/search", params);
export const lgEmailFind            = (params)        => lgApi.post("/api/lead-generator/email/find", params);
export const lgCompanySearch        = (params)        => lgApi.post("/api/lead-generator/companies/search", params);
export const lgGetDatabase          = (params = {})   => lgApi.get("/api/lead-generator/database", { params });
export const lgSaveLead             = (data)          => lgApi.post("/api/lead-generator/database", data);
export const lgUpdateLead           = (id, data)      => lgApi.patch(`/api/lead-generator/database/${id}`, data);
export const lgDeleteLead           = (id)            => lgApi.delete(`/api/lead-generator/database/${id}`);
export const lgImportAutoScraper    = ()              => lgApi.post("/api/lead-generator/database/import-auto-scraper");
export const lgResearchStart        = (prompt)        => lgApi.post("/api/lead-generator/research/start", { prompt });

// ============================================================
// SOCIAL MEDIA API (Unified.to MCP Integration)
// ============================================================

// Connections
export const getSocialConnections   = ()             => api.get("/social/connections");
export const getSocialIntegrations  = ()             => api.get("/social/integrations");
export const createSocialConnectLink = (provider, redirectUrl) =>
  api.post("/social/connect/link", { provider, redirectUrl });
export const deleteSocialConnection = (id)           => api.delete(`/social/connections/${id}`);

// Content Generation
export const generateSocialPost     = (keywords, platform) =>
  api.post("/social/generate", { keywords, platform });

// Posts CRUD
export const getSocialPosts         = ()             => api.get("/social/posts");
export const createSocialPost       = (data)         => api.post("/social/posts", data);
export const publishSocialPost      = (id)           => api.post(`/social/posts/${id}/publish`);
export const deleteSocialPost       = (id)           => api.delete(`/social/posts/${id}`);

// ============================================================
// AUTO LEAD GENERATOR
// ============================================================
export const startAutoLeadGen = (body) =>
  api.post("/lead-generator/auto-gen/start", body);
export const getAutoLeadGenStatus = (sessionId) =>
  `${BASE}/lead-generator/auto-gen/status/${sessionId}`;  // returns raw URL for SSE EventSource

// ============================================================
// IN BUILD - DATABASE (Cloud SQL + pgvector semantic search)
// ============================================================
export const ibGetDatabase    = (params = {}) => lgApi.get("/api/inbuild-database", { params });
export const ibGetStats       = ()             => lgApi.get("/api/inbuild-database/stats");
export const ibGetColumns     = ()             => lgApi.get("/api/inbuild-database/columns");
export const ibAIFilter       = (query)        => lgApi.post("/api/inbuild-database/ai-filter", { query });
export const ibRefreshCache   = ()             => lgApi.post("/api/inbuild-database/refresh");
export const ibGetHealth      = ()             => lgApi.get("/api/inbuild-database/health");
export const ibSemanticSearch = (body)         => lgApi.post("/api/inbuild-database/semantic-search", body);
export const ibEmbedStatus    = ()             => lgApi.get("/api/inbuild-database/embedding-status");
// ── New intelligence features ──────────────────────────────────────────────
export const ibGetMap         = (params = {})  => lgApi.get("/api/inbuild-database/map", { params });
export const ibGetMarketIntel = (params = {})  => lgApi.get("/api/inbuild-database/market-intel", { params });
export const ibIdealCustomer  = (body)         => lgApi.post("/api/inbuild-database/ideal-customer", body);
export const ibLaunchCampaign = (body)         => lgApi.post("/api/inbuild-database/launch-campaign", body);

// ============================================================
// PUBLIC CONTACTS DATABASE (usa_public_contacts_82m)
// ============================================================
export const pcGetDatabase = (params = {}) => lgApi.get("/api/public-contacts", { params });
export const pcGetStats    = ()             => lgApi.get("/api/public-contacts/stats");
export const pcGetColumns  = ()             => lgApi.get("/api/public-contacts/columns");
export const pcRefresh     = ()             => lgApi.post("/api/public-contacts/refresh");

// ============================================================
// NICHES 75M DATABASE (niches_75m_data)
// ============================================================
export const n2GetDatabase = (params = {}) => lgApi.get("/api/niches75m", { params });
export const n2GetStats    = ()             => lgApi.get("/api/niches75m/stats");
export const n2GetColumns  = ()             => lgApi.get("/api/niches75m/columns");
export const n2Refresh     = ()             => lgApi.post("/api/niches75m/refresh");

// ============================================================
// INDIA DATA DATABASE (india_data)
// ============================================================
export const indiaGetDatabase = (params = {}) => lgApi.get("/api/india-data", { params });
export const indiaGetStats    = ()             => lgApi.get("/api/india-data/stats");
export const indiaGetColumns  = ()             => lgApi.get("/api/india-data/columns");
export const indiaRefresh     = ()             => lgApi.post("/api/india-data/refresh");

// ============================================================
// FINAL PEOPLE DATABASE (final_people)
// ============================================================
export const fpGetDatabase = (params = {}) => lgApi.get("/api/final-people", { params });
export const fpGetStats    = ()             => lgApi.get("/api/final-people/stats");
export const fpGetColumns  = ()             => lgApi.get("/api/final-people/columns");
export const fpRefresh     = ()             => lgApi.post("/api/final-people/refresh");

// ============================================================
// FINAL COMPANIES DATABASE (final_companies)
// ============================================================
export const fcGetDatabase = (params = {}) => lgApi.get("/api/final-companies", { params });
export const fcGetStats    = ()             => lgApi.get("/api/final-companies/stats");
export const fcGetColumns  = ()             => lgApi.get("/api/final-companies/columns");
export const fcRefresh     = ()             => lgApi.post("/api/final-companies/refresh");

// ============================================================
// FINAL PEOPLE — EMAIL (final.people WHERE email IS NOT NULL)
// ============================================================
export const fpeGetDatabase = (params = {}) => lgApi.get("/api/final-people-email", { params });
export const fpeGetStats    = ()             => lgApi.get("/api/final-people-email/stats");
export const fpeGetColumns  = ()             => lgApi.get("/api/final-people-email/columns");
export const fpeRefresh     = ()             => lgApi.post("/api/final-people-email/refresh");

// ============================================================
// FINAL PEOPLE — NUMBER (final.people WHERE phone IS NOT NULL)
// ============================================================
export const fpnGetDatabase = (params = {}) => lgApi.get("/api/final-people-number", { params });
export const fpnGetStats    = ()             => lgApi.get("/api/final-people-number/stats");
export const fpnGetColumns  = ()             => lgApi.get("/api/final-people-number/columns");
export const fpnRefresh     = ()             => lgApi.post("/api/final-people-number/refresh");

