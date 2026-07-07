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
      <svg width="19" height="22" viewBox="0 0 19 22" aria-hidden style={{ flexShrink: 0 }}>
        <path
          d="M11 1 L2 12.5 L8.5 12.5 L7.5 21 L17 8.5 L10.5 8.5 Z"
          fill="var(--text)"
        />
      </svg>
      <span
        className="select-none leading-none"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.4rem",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.03em",
        }}
      >
        rankzap
      </span>
    </Tag>
  );
}
