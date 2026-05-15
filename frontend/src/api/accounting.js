import { BASE } from "./index";
import axios from "axios";

const api = axios.create({ baseURL: BASE, timeout: 120000 });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("leader_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Ledger Groups
export const getLedgerGroups = () => api.get("/accounting/groups");
export const createLedgerGroup = (d) => api.post("/accounting/groups", d);

// Ledgers
export const getLedgers = (params) => api.get("/accounting/ledgers", { params });
export const createLedger = (d) => api.post("/accounting/ledgers", d);
export const updateLedger = (id, d) => api.put(`/accounting/ledgers/${id}`, d);

// Vouchers
export const getVouchers = (params) => api.get("/accounting/vouchers", { params });
export const createVoucher = (d) => api.post("/accounting/vouchers", d);
export const getVoucher = (id) => api.get(`/accounting/vouchers/${id}`);

// Reports
export const getTrialBalance = () => api.get("/accounting/reports/trial-balance");
export const getProfitLoss = () => api.get("/accounting/reports/profit-loss");
export const getBalanceSheet = () => api.get("/accounting/reports/balance-sheet");
export const getDayBook = (params) => api.get("/accounting/reports/daybook", { params });
export const getAgingReport = () => api.get("/accounting/reports/aging");
