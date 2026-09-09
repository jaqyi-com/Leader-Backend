import { useFeatureFlags } from "../context/FeatureFlagContext";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Sparkles, ArrowLeft, ShieldAlert } from "lucide-react";

export default function FeatureGate({ featureKey, children, title }) {
  const { isFeatureEnabled, features, isAdmin, simulationMode } = useFeatureFlags();

  const enabled = isFeatureEnabled(featureKey);
  const feat = features[featureKey] || { title: title || "This Feature", status: "disabled" };

  if (enabled) {
    return children;
  }

  const isAdminOnly = feat.status === "admin_only";

  return (
    <div className="flex items-center justify-center min-h-[70vh] p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full p-8 rounded-2xl text-center relative overflow-hidden"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Glow backdrop */}
        <div
          className="absolute -top-24 -left-24 w-48 h-48 rounded-full pointer-events-none opacity-20"
          style={{
            background: isAdminOnly
              ? "radial-gradient(circle, var(--amber) 0%, transparent 70%)"
              : "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        {/* Icon */}
        <div
          className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center relative z-10"
          style={{
            background: isAdminOnly ? "rgba(245,158,11,0.12)" : "rgba(226,55,68,0.12)",
            border: `1px solid ${isAdminOnly ? "rgba(245,158,11,0.3)" : "rgba(226,55,68,0.3)"}`,
            color: isAdminOnly ? "var(--amber)" : "var(--accent)",
          }}
        >
          {isAdminOnly ? <ShieldAlert size={28} /> : <Lock size={28} />}
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold mb-2 text-[var(--text)]">
          {feat.title || title || "Feature Unavailable"}
        </h2>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4"
          style={{
            background: isAdminOnly ? "rgba(245,158,11,0.15)" : "rgba(244,63,94,0.15)",
            color: isAdminOnly ? "var(--amber)" : "var(--rose)",
            border: `1px solid ${isAdminOnly ? "rgba(245,158,11,0.3)" : "rgba(244,63,94,0.3)"}`,
          }}
        >
          <Sparkles size={12} />
          {isAdminOnly ? "Admin Testing / Staging Only" : "Temporarily Disabled by Administrator"}
        </div>

        {/* Message */}
        <p className="text-sm text-[var(--text-3)] mb-6 leading-relaxed">
          {isAdminOnly
            ? "This module is currently in staging and enabled only for system administrators. Regular user access is locked."
            : "This feature has been paused or temporarily turned off in the Admin Feature Management panel. Please check back later or contact support."}
        </p>

        {/* Action Button */}
        <Link
          to="/app/companies"
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, #f4576a 100%)",
            boxShadow: "0 0 16px var(--accent-glow)",
          }}
        >
          <ArrowLeft size={16} />
          Return to Dashboard
        </Link>
      </motion.div>
    </div>
  );
}
