// ============================================================
// CHATBOT API CLIENT
// Frontend helpers for all /api/chatbot/* endpoints
// ============================================================

const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function getAuthHeader() {
  const token = localStorage.getItem("leader_token");  // matches AuthContext key
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Conversations ──────────────────────────────────────────────

export async function fetchConversations() {
  const res = await fetch(`${BASE}/chatbot/conversations`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to load conversations");
  return res.json();
}

export async function createConversation(title = "New Conversation") {
  const res = await fetch(`${BASE}/chatbot/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to create conversation");
  return res.json();
}

export async function fetchMessages(conversationId) {
  const res = await fetch(`${BASE}/chatbot/conversations/${conversationId}/messages`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to load messages");
  return res.json();
}

export async function deleteConversation(conversationId) {
  const res = await fetch(`${BASE}/chatbot/conversations/${conversationId}`, {
    method: "DELETE",
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to delete conversation");
  return res.json();
}

// ── SSE Streaming Chat ─────────────────────────────────────────

/**
 * sendMessage — sends a chat message and reads the SSE stream.
 *
 * @param {string} conversationId  "new" to create a new conversation
 * @param {string} message
 * @param {Object} callbacks
 *   - onExpanded(expandedPrompt, wasExpanded)
 *   - onSources(chunks)
 *   - onDelta(token)
 *   - onDone({ conversationId, messageId })
 *   - onError(message)
 */
export async function sendMessage(conversationId, message, callbacks = {}) {
  const { onExpanded, onSources, onDelta, onDone, onError } = callbacks;

  const response = await fetch(
    `${BASE}/chatbot/conversations/${conversationId}/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({ message }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));
    onError?.(err.error || "Failed to send message");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr);
          switch (event.type) {
            case "expanded":
              onExpanded?.(event.content, event.wasExpanded);
              break;
            case "sources":
              onSources?.(event.chunks);
              break;
            case "delta":
              onDelta?.(event.content);
              break;
            case "done":
              onDone?.(event);
              break;
            case "error":
              onError?.(event.message);
              break;
          }
        } catch (_) {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Knowledge Base ─────────────────────────────────────────────

export async function fetchKnowledgeSources() {
  const res = await fetch(`${BASE}/chatbot/knowledge`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to load sources");
  return res.json();
}

export async function fetchKnowledgeSource(id) {
  const res = await fetch(`${BASE}/chatbot/knowledge/${id}`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error((await res.json()).error || "Not found");
  return res.json();
}

export async function addTextKnowledge(name, text) {
  const res = await fetch(`${BASE}/chatbot/knowledge/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ name, text }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to add knowledge");
  return res.json();
}

export async function uploadFileKnowledge(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}/chatbot/knowledge/file`, {
    method: "POST",
    headers: { ...getAuthHeader() },
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to upload file");
  return res.json();
}

export async function updateKnowledgeSource(id, text, name) {
  const res = await fetch(`${BASE}/chatbot/knowledge/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ text, name }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to update");
  return res.json();
}

export async function deleteKnowledgeSource(id) {
  const res = await fetch(`${BASE}/chatbot/knowledge/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to delete");
  return res.json();
}

export async function fetchKnowledgeStats() {
  const res = await fetch(`${BASE}/chatbot/knowledge-stats`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) return { sourceCount: 0, chunkCount: 0 };
  return res.json();
}
