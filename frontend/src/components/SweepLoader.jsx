/**
 * SweepLoader — reusable indeterminate progress bar (no logo, no text).
 * Drop this anywhere in place of a spinner for consistent loading UX.
 *
 * Usage:
 *   <SweepLoader />                    — full width bar
 *   <SweepLoader width={200} />        — fixed width
 *   <SweepLoader height={3} />         — thinner
 *   <SweepLoader fullPage />           — centered in a full page area
 */
export default function SweepLoader({ width, height = 4, fullPage = false, className = "" }) {
  const bar = (
    <div
      className={className}
      style={{
        width: width || "100%",
        height,
        background: "var(--surface-3, #1d1d28)",
        borderRadius: 9999,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          background: "linear-gradient(90deg, #6c63ff, #a78bfa, #22d3ee)",
          boxShadow: "0 0 10px rgba(108,99,255,0.7)",
          borderRadius: 9999,
          animation: "sweep-loader 1s cubic-bezier(0.4,0,0.2,1) infinite",
        }}
      />
      <style>{`
        @keyframes sweep-loader {
          0%   { width: 0%;  margin-left: 0%; }
          50%  { width: 65%; margin-left: 17%; }
          100% { width: 0%;  margin-left: 100%; }
        }
      `}</style>
    </div>
  );

  if (fullPage) {
    return (
      <div style={{
        width: "100%",
        height: "100%",
        minHeight: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 0",
      }}>
        <div style={{ width: 200 }}>
          {bar}
        </div>
      </div>
    );
  }

  return bar;
}
