import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { PresenceInfo } from "room-server/types";
import type { Meta, Option, Settings, UserRecord, Vote } from "../../lib/types";

/** Room data both poll views read. Loaded once in Layout. */
export interface PollData {
  roomId: string;
  meta: Meta;
  settings: Settings;
  pollHeading: string;
  /** Options in the order they were added. */
  options: Option[];
  optionById: Map<string, Option>;
  optionsMap: Map<string, Option>;
  votesMap: Map<string, Vote>;
  usersMap: Map<string, UserRecord>;
  presenceMap: Map<string, PresenceInfo>;
  onlineUserIds: Set<string>;
  votedUserIds: Set<string>;
}

export type PillVariant = "default" | "primary" | "secondary";

export function PoweredByFooter({
  onCreatePoll,
  showCreateLink = true,
}: {
  onCreatePoll: () => void;
  showCreateLink?: boolean;
}) {
  return (
    <footer className="flex items-center justify-between gap-3 px-[18px] pt-6 pb-[max(18px,env(safe-area-inset-bottom,0px))] text-[13px] font-semibold text-ink">
      <span className="inline-flex items-center gap-1.5">
        Powered by
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" />
        </svg>
        <b className="font-extrabold">Rankzap</b>
      </span>
      {showCreateLink ? (
        <button type="button" onClick={onCreatePoll} className="min-h-11 font-extrabold underline underline-offset-4 hover:no-underline">
          Make your own poll
        </button>
      ) : null}
    </footer>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/55 p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`modal-${title.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={onClose}
    >
      <div
        className="max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-lg overflow-auto bg-ground p-5 text-ink shadow-[8px_8px_0_#0b0b0b]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2
            id={`modal-${title.toLowerCase().replace(/\s+/g, "-")}`}
            className="display m-0 text-[30px]"
          >
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            title="Close"
            style={iconButton()}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function iconButton(): React.CSSProperties {
  return {
    alignItems: "center",
    background: "var(--step)",
    border: "none",
    borderRadius: 0,
    color: "var(--step-ink)",
    display: "inline-flex",
    height: 42,
    justifyContent: "center",
    padding: 0,
    transition: "opacity 0.15s",
    width: 42,
  };
}

export function textButton(): React.CSSProperties {
  return {
    alignItems: "center",
    background: "transparent",
    border: "none",
    color: "var(--muted)",
    display: "inline-flex",
    fontFamily: "var(--font-sans)",
    fontSize: "0.95rem",
    fontWeight: 600,
    justifyContent: "center",
    minHeight: 44,
    padding: "0 4px",
  };
}

export function pill(variant: PillVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    padding: "0 14px",
    borderRadius: 999,
    fontSize: "0.83rem",
    fontWeight: 600,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    border: "1.5px solid transparent",
    transition: "opacity 0.15s",
  };
  switch (variant) {
    case "primary":    return { ...base, background: "var(--text)", color: "#fff", border: "none" };
    case "secondary":  return { ...base, background: "var(--surface)", color: "var(--text)", border: "none" };
    default:           return { ...base, background: "transparent", color: "var(--text)", borderColor: "var(--text)" };
  }
}

export function MonoLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 6px", ...style }}>
      {children}
    </p>
  );
}


export function sameRanking(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function shuffleIds(ids: string[]): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Poll screens' top row: whatever the screen puts on the left, the room code on the right. */
export function PollTopBar({ roomId, children }: { roomId: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-[18px] pt-3 text-[15px] font-extrabold text-ink">
      {children ?? (
        <span className="flex items-center gap-1.5 uppercase">
          <svg viewBox="0 0 24 24" aria-hidden className="size-4">
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" />
          </svg>
          Rankzap
        </span>
      )}
      <span className="bg-chip px-2.5 py-[7px] tracking-[0.04em] text-chip-ink" aria-label={`Poll code ${roomId}`}>
        {roomId}
      </span>
    </div>
  );
}
