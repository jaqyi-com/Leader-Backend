/**
 * PageTracker — invisible component that fires a tracking hit on every route change.
 * Generates a persistent sessionId in localStorage for unique-visitor counting.
 * Fails silently — never interferes with the app.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const SESSION_KEY = "leader_sid";

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function parseReferrer() {
  try {
    if (!document.referrer) return "Direct";
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return host || "Direct";
  } catch {
    return "Direct";
  }
}

export default function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    // fire-and-forget, never await, never block UI
    const sessionId = getSessionId();
    fetch(`${API_BASE}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path:      location.pathname,
        referrer:  parseReferrer(),
        sessionId,
      }),
    }).catch(() => {});
  }, [location.pathname]);

  return null; // renders nothing
}
