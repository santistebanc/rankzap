interface RankCircleProps {
  n: number;
  size?: number;
  color?: string;
}

export function RankCircle({ n, size = 28, color = "var(--accent)" }: RankCircleProps) {
  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 40 40" overflow="visible">
        <path
          d="M20 4 C 30 4 36 12 36 20 C 36 30 28 36 20 36 C 10 36 4 28 4 20 C 4 10 12 4 20 4 Z"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="120 1"
          strokeDashoffset="0"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display, 'Caveat', cursive)",
          fontSize: size * 0.58,
          fontWeight: 700,
          color,
          lineHeight: 1,
          paddingBottom: 1,
        }}
      >
        {n}
      </div>
    </div>
  );
}
