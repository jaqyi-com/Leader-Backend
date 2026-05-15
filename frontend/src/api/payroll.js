import { BASE } from "./index";
import axios from "axios";

const api = axios.create({ baseURL: BASE, timeout: 120000 });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("leader_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Employees
export const getEmployees = (params) => api.get("/payroll/employees", { params });
export const createEmployee = (d) => api.post("/payroll/employees", d);
export const getEmployee = (id) => api.get(`/payroll/employees/${id}`);
export const updateEmployee = (id, d) => api.put(`/payroll/employees/${id}`, d);

// Salary Structures
export const getSalaryStructures = () => api.get("/payroll/salary-structures");
export const createSalaryStructure = (d) => api.post("/payroll/salary-structures", d);
export const updateSalaryStructure = (id, d) => api.put(`/payroll/salary-structures/${id}`, d);

// Payroll Run
export const runPayroll = (d) => api.post("/payroll/run", d);
export const getPayslips = (params) => api.get("/payroll/payslips", { params });
export const approvePayslip = (id) => api.patch(`/payroll/payslips/${id}/approve`);
export const payPayslip = (id, d) => api.patch(`/payroll/payslips/${id}/pay`, d);
export const deletePayslips = (params) => api.delete("/payroll/payslips", { params });

// Attendance
export const getAttendance = (params) => api.get("/payroll/attendance", { params });
export const markAttendance = (d) => api.post("/payroll/attendance", d);
export const bulkAttendance = (d) => api.post("/payroll/attendance/bulk", d);

// Summary
export const getPayrollSummary = () => api.get("/payroll/summary");
