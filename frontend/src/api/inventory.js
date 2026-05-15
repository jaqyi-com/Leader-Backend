import { BASE } from "./index";
import axios from "axios";

const api = axios.create({ baseURL: BASE, timeout: 120000 });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("leader_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Stock Groups
export const getStockGroups = () => api.get("/inventory/groups");
export const createStockGroup = (d) => api.post("/inventory/groups", d);

// Stock Items
export const getStockItems = (params) => api.get("/inventory/items", { params });
export const createStockItem = (d) => api.post("/inventory/items", d);
export const updateStockItem = (id, d) => api.put(`/inventory/items/${id}`, d);
export const getStockItem = (id) => api.get(`/inventory/items/${id}`);

// Reorder Alerts
export const getReorderAlerts = () => api.get("/inventory/alerts/reorder");

// Stock Movements
export const createStockMovement = (d) => api.post("/inventory/movements", d);
export const getStockMovements = (params) => api.get("/inventory/movements", { params });

// Orders
export const getOrders = (params) => api.get("/inventory/orders", { params });
export const createOrder = (d) => api.post("/inventory/orders", d);
export const updateOrder = (id, d) => api.put(`/inventory/orders/${id}`, d);

// Reports
export const getStockSummary = () => api.get("/inventory/reports/summary");
