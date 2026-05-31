/**
 * PageTracker — fires a tracking hit on every route change.
 * Sends: path, referrer, sessionId, duration (time on prev page),
 *        UTM params, isEntry (first page of session).
 * Silent failure — never interferes with the app.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const API_BASE   = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const SESSION_KEY = "leader_sid";
const ENTRY_KEY   = "leader_session_active";
const TIME_KEY    = "leader_entry_time";

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
    return new URL(document.referrer).hostname.replace(/^www\./, "") || "Direct";
  } catch { return "Direct"; }
}

function getUtm() {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utmSource:   p.get("utm_source")   || "",
      utmMedium:   p.get("utm_medium")   || "",
      utmCampaign: p.get("utm_campaign") || "",
    };
  } catch { return { utmSource: "", utmMedium: "", utmCampaign: "" }; }
}

export default function PageTracker() {
  const location = useLocation();
  const entryTimeRef = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();

    // Duration: seconds spent on the previous page
    const duration = Math.round((now - entryTimeRef.current) / 1000);
    entryTimeRef.current = now;

    // isEntry: first page of this browser session (sessionStorage clears on tab close)
    const isEntry = !sessionStorage.getItem(ENTRY_KEY);
    sessionStorage.setItem(ENTRY_KEY, "1");

    const utm = getUtm();

    fetch(`${API_BASE}/track`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path:      location.pathname,
        referrer:  parseReferrer(),
        sessionId: getSessionId(),
        duration:  isEntry ? 0 : duration,  // no duration for first page
        isEntry,
        ...utm,
      }),
    }).catch(() => {});
  }, [location.pathname]);

  return null;
}
