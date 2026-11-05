/** The heavy right arrow on Podium's big buttons. */
export function Arrow({ className = "size-[26px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`shrink-0 ${className}`}>
      <path d="M4 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="3" fill="none" />
    </svg>
  );
}
