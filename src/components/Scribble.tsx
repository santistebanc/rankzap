interface ScribbleProps {
  width?: number | string;
  color?: string;
  style?: React.CSSProperties;
}

export function Scribble({ width = 180, color = "var(--accent)", style }: ScribbleProps) {
  const w = typeof width === "number" ? width : 180;
  return (
    <svg
      width={width}
      height="14"
      viewBox={`0 0 ${w} 14`}
      aria-hidden
      style={style}
      preserveAspectRatio="none"
    >
      <path
        d={`M2 9 Q ${w * 0.18} 2, ${w * 0.36} 7 T ${w * 0.7} 7 T ${w - 3} 6`}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
