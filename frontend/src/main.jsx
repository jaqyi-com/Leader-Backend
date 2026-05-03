import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { Toaster } from "react-hot-toast";
import PageProgressBar from "./components/PageProgressBar";

// Always dark
document.documentElement.classList.add("dark");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* Global progress bar — fires on every route change across the entire app */}
      <PageProgressBar />
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--surface-3)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            fontSize: "13px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
          },
          success: { iconTheme: { primary: "#10b981", secondary: "var(--surface-3)" } },
          error:   { iconTheme: { primary: "#f43f5e", secondary: "var(--surface-3)" } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
