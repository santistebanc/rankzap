import { createContext, useContext, useEffect, useRef } from "react";
import { CopyCode } from "../../components/CopyCode";
import { X } from "lucide-react";
import type { Meta, Option, Settings, UserRecord, Vote } from "../../lib/types";

/** The poll as both views read it. Built from the live snapshot in Layout. */
export interface PollData {
  roomId: string;
  meta: Meta;
  settings: Settings;
  pollHeading: string;
  /** Options in the order they were added. */
  options: Option[];
  optionById: Map<string, Option>;
  /** By user id. */
  votesMap: Map<string, Vote>;
  /** By user id. */
  usersMap: Map<string, UserRecord>;
  onlineUserIds: Set<string>;
  votedUserIds: Set<string>;
}

export const PollDataContext = createContext<PollData | null>(null);

/** The current poll, for components deep inside a poll page. */
export function usePollData(): PollData {
  const data = useContext(PollDataContext);
  if (!data) throw new Error("usePollData must be used inside a poll page");
  return data;
}

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
            className="inline-flex size-11 shrink-0 items-center justify-center bg-step text-step-ink transition-opacity hover:opacity-75"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
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
      <CopyCode roomId={roomId} />
    </div>
  );
}
