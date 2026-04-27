import axios from "axios";

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const DEFAULT_LOCAL = "http://localhost:3001/api";

// In production, VITE_API_URL MUST be set to your backend Vercel URL
export const BASE = import.meta.env.VITE_API_URL || (isLocal ? DEFAULT_LOCAL : "");

if (!isLocal && !import.meta.env.VITE_API_URL) {
  console.error("[API] ⚠️  VITE_API_URL is not set! Set it in your Vercel frontend environment variables.");
}

const api = axios.create({ baseURL: BASE, timeout: 300000 });


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
