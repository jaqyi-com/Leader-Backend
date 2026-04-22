import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("leader_token"));
  const [loading, setLoading] = useState(true);

  // ── Fetch current user on mount / token change ─────────────────────────────
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe();
  }, [token]);

  async function fetchMe() {
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Token invalid or expired
        logout();
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setOrg(data.org);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(({ token: newToken, user: newUser, org: newOrg }) => {
    localStorage.setItem("leader_token", newToken);
    setToken(newToken);
    setUser(newUser);
    setOrg(newOrg);
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem("leader_token");
    setToken(null);
    setUser(null);
    setOrg(null);
  }, []);

  // ── Switch org ─────────────────────────────────────────────────────────────
  const switchOrg = useCallback(async (newOrgId) => {
    try {
      const res = await fetch(`${API}/org/switch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId: newOrgId }),
      });
      if (!res.ok) throw new Error("Failed to switch org");
      const data = await res.json();
      localStorage.setItem("leader_token", data.token);
      setToken(data.token);
      setOrg(data.org);
    } catch (err) {
      console.error("[AuthContext] switchOrg failed:", err.message);
    }
  }, [token]);

  // ── Handle Google OAuth callback (called by /auth/callback page) ──────────
  const handleOAuthCallback = useCallback((callbackToken) => {
    localStorage.setItem("leader_token", callbackToken);
    setToken(callbackToken);
    // fetchMe will run via useEffect
  }, []);

  const isAuthenticated = !!user && !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        org,
        token,
        loading,
        isAuthenticated,
        login,
        logout,
        switchOrg,
        handleOAuthCallback,
        refetch: fetchMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
