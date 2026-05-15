import { BASE } from "./index";
import axios from "axios";

const api = axios.create({ baseURL: BASE, timeout: 120000 });

// Inject auth token
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("leader_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// ── Pipelines ──
export const getPipelines = () => api.get("/crm/pipelines");
export const createPipeline = (d) => api.post("/crm/pipelines", d);
export const updatePipeline = (id, d) => api.put(`/crm/pipelines/${id}`, d);

// ── Deals ──
export const getDeals = (params) => api.get("/crm/deals", { params });
export const getDealsBoard = (params) => api.get("/crm/deals/board", { params });
export const createDeal = (d) => api.post("/crm/deals", d);
export const getDeal = (id) => api.get(`/crm/deals/${id}`);
export const updateDeal = (id, d) => api.put(`/crm/deals/${id}`, d);
export const moveDealStage = (id, stage) => api.patch(`/crm/deals/${id}/stage`, { stage });
export const markDealWon = (id) => api.patch(`/crm/deals/${id}/won`);
export const markDealLost = (id, reason) => api.patch(`/crm/deals/${id}/lost`, { reason });
export const deleteDeal = (id) => api.delete(`/crm/deals/${id}`);
export const convertLeadToDeal = (d) => api.post("/crm/deals/convert", d);
export const getDealStats = () => api.get("/crm/deals/stats");

// ── Activities ──
export const getActivities = (params) => api.get("/crm/activities", { params });
export const createActivity = (d) => api.post("/crm/activities", d);
export const updateActivity = (id, d) => api.put(`/crm/activities/${id}`, d);
export const completeActivity = (id) => api.patch(`/crm/activities/${id}/complete`);
export const deleteActivity = (id) => api.delete(`/crm/activities/${id}`);
export const getUpcomingActivities = () => api.get("/crm/activities/upcoming");

// ── Quotations ──
export const getQuotations = (params) => api.get("/crm/quotations", { params });
export const createQuotation = (d) => api.post("/crm/quotations", d);
export const updateQuotation = (id, d) => api.put(`/crm/quotations/${id}`, d);
export const updateQuotationStatus = (id, status) => api.patch(`/crm/quotations/${id}/status`, { status });

// ── Invoices ──
export const getInvoices = (params) => api.get("/crm/invoices", { params });
export const createInvoice = (d) => api.post("/crm/invoices", d);
export const createInvoiceFromQuotation = (qtId) => api.post(`/crm/invoices/from-quotation/${qtId}`);
export const updateInvoice = (id, d) => api.put(`/crm/invoices/${id}`, d);

// ── Payments ──
export const recordPayment = (d) => api.post("/crm/payments", d);
export const getPayments = (params) => api.get("/crm/payments", { params });

// ── Ledger ──
export const getReceivables = () => api.get("/crm/ledger/receivables");
