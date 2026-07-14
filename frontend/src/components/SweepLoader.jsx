/**
 * SweepLoader — premium indeterminate progress bar.
 * Clean shimmer design — no glows, no blur.
 *
 * Usage:
 *   <SweepLoader />                  — full width bar
 *   <SweepLoader height={3} />       — thinner
 *   <SweepLoader fullPage />         — centered in a full page area
 *   <SweepLoader value={65} />       — determinate mode (0-100)
 */
export default function SweepLoader({
  height = 3,
  fullPage = false,
  className = "",
  value = null,
  style = {},
}) {
  const isDeterminate = value !== null;

  const bar = (
    <div
      className={className}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isDeterminate ? value : undefined}
      style={{
        width: "100%",
        height,
        background: "var(--surface-3, rgba(255,255,255,0.06))",
        borderRadius: 9999,
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      {isDeterminate ? (
        /* ── Determinate fill ── */
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${Math.min(100, Math.max(0, value))}%`,
            background: "linear-gradient(90deg, #E23744 0%, #f4576a 60%, #ff6b7a 100%)",
            borderRadius: 9999,
            transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      ) : (
        /* ── Indeterminate shimmer ── */
        <>
          {/* Base fill — always visible */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, #E23744 0%, #f4576a 100%)",
              opacity: 0.15,
            }}
          />
          {/* Moving shimmer bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              background: "linear-gradient(90deg, transparent 0%, #E23744 30%, #f4576a 50%, #ff8a96 70%, transparent 100%)",
              borderRadius: 9999,
              animation: "sl-shimmer 1.4s ease-in-out infinite",
            }}
          />
          <style>{`
            @keyframes sl-shimmer {
              0%   { width: 40%; transform: translateX(-100%); }
              100% { width: 60%; transform: translateX(280%); }
            }
          `}</style>
        </>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div
        style={{
          width: "100%",
          minHeight: 120,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "32px 0",
        }}
      >
        <div style={{ width: 220 }}>{bar}</div>
        <span style={{ fontSize: 12, color: "var(--text-3)", letterSpacing: "0.05em" }}>
          Loading…
        </span>
      </div>
    );
  }

  return bar;
}
