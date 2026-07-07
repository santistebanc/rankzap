interface RankCircleProps {
  n: number;
  size?: number;
  color?: string;
}

export function RankCircle({ n, size = 28, color = "var(--text)" }: RankCircleProps) {
  const filled = n === 1;
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: filled ? color : "transparent",
        border: filled ? "none" : `1.5px solid color-mix(in oklab, ${color} 22%, transparent)`,
        fontFamily: "var(--font-sans)",
        fontSize: size * 0.46,
        fontWeight: 700,
        color: filled ? "#fff" : color,
        lineHeight: 1,
      }}
      aria-hidden
    >
      {n}
    </div>
  );
}
