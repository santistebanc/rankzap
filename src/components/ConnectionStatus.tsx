import { useRoom } from "../lib/room";

export function ConnectionStatus() {
  const { status } = useRoom();

  if (status === "ready") return null;

  const label =
    status === "connecting"
      ? "Connecting…"
      : status === "reconnecting"
        ? "Reconnecting…"
        : "Disconnected";

  const tone =
    status === "closed" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 z-50 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium shadow-card top-[max(0.75rem,env(safe-area-inset-top,0px))] ${tone}`}
    >
      {label}
    </div>
  );
}
