import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const ADMIN_EMAILS = [
  "akshat.v@jaqyi.com"
];

const FeatureFlagContext = createContext(null);

export function FeatureFlagProvider({ children }) {
  const { user, token } = useAuth();
  const [features, setFeatures] = useState({});
  const [rawFlags, setRawFlags] = useState([]);
  const [summary, setSummary] = useState({ total: 0, enabled: 0, admin_only: 0, disabled: 0 });
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulationMode, setSimulationMode] = useState(false); // Admin preview as regular user

  const userEmail = user?.email?.toLowerCase().trim() || "";
  const isAdmin = Boolean(userEmail && ADMIN_EMAILS.includes(userEmail));

  const fetchFeatures = useCallback(async () => {
    try {
      if (isAdmin && token) {
        // Admin gets full metadata, summary, and presets
        const res = await axios.get(`${API_BASE}/admin/features`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data?.success) {
          const map = {};
          (res.data.flags || []).forEach(f => {
            map[f.key] = f;
          });
          setFeatures(map);
          setRawFlags(res.data.flags || []);
          setSummary(res.data.summary || {});
          setPresets(res.data.presets || []);
        }
      } else {
        // Regular user gets active map
        const res = await axios.get(`${API_BASE}/features`);
        if (res.data?.success) {
          setFeatures(res.data.features || {});
          setRawFlags(res.data.raw || []);
        }
      }
    } catch (err) {
      console.warn("[FeatureFlagContext] Failed to fetch feature flags, using defaults:", err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, token]);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  /**
   * Check if a feature is accessible.
   * If simulationMode is ON, treats admin as a regular user to preview exact UI.
   */
  const isFeatureEnabled = useCallback((key) => {
    if (!key) return true;
    if (key === "admin") {
      return isAdmin && !simulationMode;
    }
    const feat = features[key];
    if (!feat) return true; // Default fallback to enabled if not found

    const status = feat.status || "enabled";

    // If simulating regular user view, admin only sees 'enabled'
    if (isAdmin && !simulationMode) {
      return status === "enabled" || status === "admin_only";
    }

    return status === "enabled";
  }, [features, isAdmin, simulationMode]);

  const getFeatureBadge = useCallback((key) => {
    const feat = features[key];
    return feat?.badge || "";
  }, [features]);

  // Admin mutation: Update single feature
  const updateFeature = async (key, updateData) => {
    if (!token) return { success: false, error: "Not authenticated" };
    try {
      const res = await axios.put(`${API_BASE}/admin/features/${key}`, updateData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        setFeatures(prev => ({
          ...prev,
          [key]: { ...prev[key], ...res.data.flag }
        }));
        await fetchFeatures();
        return { success: true, flag: res.data.flag };
      }
      return { success: false, error: res.data?.error || "Update failed" };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  // Admin mutation: Bulk update
  const bulkUpdateFeatures = async (flagsArray) => {
    if (!token) return { success: false, error: "Not authenticated" };
    try {
      const res = await axios.put(`${API_BASE}/admin/features`, { flags: flagsArray }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        await fetchFeatures();
        return { success: true, flags: res.data.flags };
      }
      return { success: false, error: res.data?.error || "Bulk update failed" };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  // Admin mutation: Apply preset
  const applyPreset = async (presetKey) => {
    if (!token) return { success: false, error: "Not authenticated" };
    try {
      const res = await axios.post(`${API_BASE}/admin/features/preset`, { presetKey }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        await fetchFeatures();
        return { success: true, preset: res.data.preset };
      }
      return { success: false, error: res.data?.error || "Preset failed" };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  // Admin mutation: Reset to factory defaults
  const resetDefaults = async () => {
    if (!token) return { success: false, error: "Not authenticated" };
    try {
      const res = await axios.post(`${API_BASE}/admin/features/reset`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        await fetchFeatures();
        return { success: true };
      }
      return { success: false, error: res.data?.error || "Reset failed" };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  return (
    <FeatureFlagContext.Provider
      value={{
        features,
        rawFlags,
        summary,
        presets,
        loading,
        isAdmin,
        simulationMode,
        setSimulationMode,
        isFeatureEnabled,
        getFeatureBadge,
        updateFeature,
        bulkUpdateFeatures,
        applyPreset,
        resetDefaults,
        refreshFeatures: fetchFeatures,
      }}
    >
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) {
    throw new Error("useFeatureFlags must be used within a FeatureFlagProvider");
  }
  return ctx;
}
