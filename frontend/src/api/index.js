import axios from "axios";

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const DEFAULT_LOCAL = "http://localhost:3001/api";

// In production, VITE_API_URL MUST be set to your backend Vercel URL
export const BASE = import.meta.env.VITE_API_URL || (isLocal ? DEFAULT_LOCAL : "");

if (!isLocal && !import.meta.env.VITE_API_URL) {
  console.error("[API] ⚠️  VITE_API_URL is not set! Set it in your Vercel frontend environment variables.");
}

// ── Auth & Retry interceptors ───────────────────────────────────────────────────────
function applyAuthInterceptors(instance) {
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem("leader_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  // Automatic Retry Interceptor (exponential backoff for transient network / gateway failures only).
  // Never retry what the server deliberately refused or what is already slow: re-running a
  // timed-out search (HTTP 500/503) multiplies the load on the database, and 429 means "slow down".
  instance.interceptors.response.use(
    (res) => res,
    async (err) => {
      if (err.response?.status === 401) {
        // Token expired or invalid — clear and redirect to login
        localStorage.removeItem("leader_token");
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(err);
      }

      // Keep the server's plain-language message (e.g. "add more filters") for the UI.
      const code = err.response?.data?.code;
      if (err.response?.data?.error) err.userMessage = err.response.data.error;

      const config = err.config;
      if (!config) return Promise.reject(err);

      // Only automatically retry GET requests (idempotent)
      const method = (config.method || "get").toLowerCase();
      const isGet = method === "get";

      // Retry only on network errors and 502/503/504 gateway errors that carry no application code.
      const status = err.response?.status;
      const isRetryable = !code && (!err.response || [502, 503, 504].includes(status));

      if (isGet && isRetryable) {
        config.__retryCount = config.__retryCount || 0;
        const maxRetries = 2;

        if (config.__retryCount < maxRetries) {
          config.__retryCount += 1;
          const delay = 1000 * Math.pow(2, config.__retryCount - 1); // 1s, 2s
          console.warn(`[API Retry] ${method.toUpperCase()} ${config.url} failed (${err.message || status}). Automatic retry ${config.__retryCount}/${maxRetries} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return instance(config);
        }
      }

      return Promise.reject(err);
    }
  );
}



// ============================================================
// DATA API (companies, people, emails, numbers)
// ============================================================
// BASE ends in /api (e.g. https://backend.vercel.app/api)
// Strip it so lgApi can call /api/final-... cleanly
const BACKEND_ROOT = BASE.replace(/\/api$/, "");
export { BACKEND_ROOT };

const lgApi = axios.create({ baseURL: BACKEND_ROOT, timeout: 120000 });
applyAuthInterceptors(lgApi);

// ============================================================
// FINAL PEOPLE DATABASE (final_people)
// ============================================================
export const fpGetDatabase   = (params = {}) => lgApi.get("/api/final-people", { params });
export const fpGetStats      = ()             => lgApi.get("/api/final-people/stats");
export const fpGetColumns    = ()             => lgApi.get("/api/final-people/columns");
export const fpRefresh       = ()             => lgApi.post("/api/final-people/refresh");
export const fpGetCategories = ()             => lgApi.get("/api/final-people/categories");
export const fpGetCities     = ()             => lgApi.get("/api/final-people/cities");

// ============================================================
// FINAL COMPANIES DATABASE (final_companies)
// ============================================================
export const fcGetDatabase   = (params = {}) => lgApi.get("/api/final-companies", { params });
export const fcGetStats      = ()             => lgApi.get("/api/final-companies/stats");
export const fcGetColumns    = ()             => lgApi.get("/api/final-companies/columns");
export const fcRefresh       = ()             => lgApi.post("/api/final-companies/refresh");
export const fcGetCategories = ()             => lgApi.get("/api/final-companies/categories");
export const fcGetCities     = ()             => lgApi.get("/api/final-companies/cities");

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

