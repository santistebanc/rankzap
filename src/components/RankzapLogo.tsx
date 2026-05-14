export function RankzapLogo({ className, onClick }: { className?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label="Rankzap"
      className={`flex items-center gap-2.5 ${onClick ? "cursor-pointer" : ""} ${className ?? ""}`}
      {...(!onClick && { role: "img" })}
    >
      <svg
        width="26"
        height="30"
        viewBox="0 0 28 32"
        aria-hidden
        style={{ transform: "rotate(-6deg)", flexShrink: 0 }}
      >
        {/* filled bolt */}
        <path
          d="M14.5 1.5 L4 18 L12 18 L9.5 30.5 L23.5 12 L15.5 12 Z"
          fill="var(--accent)"
          stroke="var(--text)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* inner dashed stroke for hand-drawn feel */}
        <path
          d="M14.5 1.5 L4 18 L12 18 L9.5 30.5 L23.5 12 L15.5 12 Z"
          fill="none"
          stroke="var(--text)"
          strokeWidth="0.6"
          strokeLinejoin="round"
          strokeDasharray="0.5 1.8"
          opacity="0.6"
        />
      </svg>
      <span
        className="select-none leading-none"
        style={{
          fontFamily: "var(--font-display, 'Caveat', cursive)",
          fontSize: "2rem",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.01em",
        }}
      >
        rank<span style={{ color: "var(--accent)" }}>zap</span>
      </span>
    </Tag>
  );
}
