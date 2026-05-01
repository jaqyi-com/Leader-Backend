// ============================================================
// OUTREACH API CLIENT
// Frontend helpers for all /api/outreach/* endpoints
// ============================================================

const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function authHeaders() {
  const token = localStorage.getItem("leader_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleRes(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const fetchContacts = () =>
  fetch(`${BASE}/outreach/contacts`, { headers: authHeaders() }).then(handleRes);

export const personalizeContact = (contact, orgContext) =>
  fetch(`${BASE}/outreach/personalize`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ contact, orgContext }),
  }).then(handleRes);

export const personalizeBatch = (contacts, orgContext) =>
  fetch(`${BASE}/outreach/personalize/batch`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ contacts, orgContext }),
  }).then(handleRes);

export const createCampaign = (data) =>
  fetch(`${BASE}/outreach/campaigns`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  }).then(handleRes);

export const fetchCampaigns = () =>
  fetch(`${BASE}/outreach/campaigns`, { headers: authHeaders() }).then(handleRes);

export const fetchCampaign = (id) =>
  fetch(`${BASE}/outreach/campaigns/${id}`, { headers: authHeaders() }).then(handleRes);

export const launchCampaign = (id) =>
  fetch(`${BASE}/outreach/campaigns/${id}/launch`, {
    method: "POST",
    headers: authHeaders(),
  }).then(handleRes);

export const pauseCampaign = (id) =>
  fetch(`${BASE}/outreach/campaigns/${id}/pause`, {
    method: "PATCH",
    headers: authHeaders(),
  }).then(handleRes);

export const sendFollowup = (id, day) =>
  fetch(`${BASE}/outreach/campaigns/${id}/followup`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ day }),
  }).then(handleRes);

export const markReplied = (campaignId, contactId) =>
  fetch(`${BASE}/outreach/campaigns/${campaignId}/contact/${contactId}/reply`, {
    method: "PATCH",
    headers: authHeaders(),
  }).then(handleRes);

export const deleteCampaign = (id) =>
  fetch(`${BASE}/outreach/campaigns/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handleRes);
