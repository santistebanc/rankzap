import { useEffect, useRef } from "react";

/**
 * Renders `children` and plays a short scale "punch" whenever `value` changes
 * after the first render (a place number moving, a score going up).
 */
export function Punch({
  value,
  className = "",
  children,
}: {
  value: string | number;
  className?: string;
  children: React.ReactNode;
}) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    // A new key remounts the span, which restarts the animation.
    <span key={value} className={`inline-block ${mounted.current ? "animate-punch" : ""} ${className}`}>
      {children}
    </span>
  );
}
