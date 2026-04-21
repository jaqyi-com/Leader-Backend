import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import "./index.css";
import { Toaster } from "react-hot-toast";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
        <Toaster position="bottom-right" toastOptions={{
          style: { background: "#1e293b", color: "#fff", borderRadius: "12px" }
        }} />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
