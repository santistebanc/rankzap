import { memo } from "react";
import type { UserRecord } from "../lib/types";

export type PillState =
  | "changing"
  | "voting"
  | "voted"
  | "online"
  | "offline";

interface UserPillProps {
  user: UserRecord;
  state: PillState;
  isYou?: boolean;
  variant?: "pill" | "tab";
  showIgnoredBadge?: boolean;
}

const STATE_CONFIG: Record<
  PillState,
  { pillClassName: string; tabClassName: string; icon: React.ReactNode; label: string }
> = {
  changing: {
    pillClassName: "bg-accent-soft text-accent border-accent",
    tabClassName: "bg-accent-soft text-accent",
    icon: <PencilIcon className="size-3 animate-pulse" />,
    label: "Changing vote",
  },
  voting: {
    pillClassName: "bg-accent-soft text-accent border-accent",
    tabClassName: "bg-accent-soft text-accent",
    icon: <PendingIcon className="size-3" />,
    label: "Not voted yet",
  },
  voted: {
    pillClassName: "bg-success-soft text-success border-success",
    tabClassName: "bg-success-soft text-success",
    icon: <CheckIcon className="size-3" />,
    label: "Voted",
  },
  online: {
    pillClassName: "bg-surface-2 text-text border-border",
    tabClassName: "bg-surface-2 text-text",
    icon: <PendingIcon className="size-3" />,
    label: "Not voted yet (online)",
  },
  offline: {
    pillClassName: "bg-transparent text-muted border-border opacity-60",
    tabClassName: "bg-transparent text-muted opacity-60",
    icon: <PendingIcon className="size-3" />,
    label: "Not voted yet (offline)",
  },
};

function UserPillRaw({
  user,
  state,
  isYou,
  variant = "pill",
  showIgnoredBadge = false,
}: UserPillProps) {
  const cfg = STATE_CONFIG[state];
  const isTab = variant === "tab";
  const shape = isTab
    ? "inline-flex min-h-9 items-center gap-2 px-3 py-2 text-sm font-semibold whitespace-nowrap"
    : "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium";
  const tone = isTab ? cfg.tabClassName : cfg.pillClassName;
  return (
    <span
      className={`${shape} ${tone}`}
      title={`${user.name}${isYou ? " (you)" : ""}, ${cfg.label}`}
      aria-label={`${user.name}${isYou ? " (you)" : ""}, ${cfg.label}`}
    >
      <span aria-hidden="true" className="flex items-center">
        {cfg.icon}
      </span>
      <span className="max-w-40 truncate">{user.name}</span>
      {isYou ? <span className="text-[0.68rem] opacity-70">you</span> : null}
      {showIgnoredBadge && user.ignored ? (
        <span className="rounded-full border border-danger/35 bg-danger-soft px-1.5 py-0.5 text-[0.64rem] font-semibold tracking-wide text-danger">
          Ignored
        </span>
      ) : null}
    </span>
  );
}

export const UserPill = memo(UserPillRaw, (a, b) => {
  return (
    a.user.id === b.user.id &&
    a.user.name === b.user.name &&
    a.user.mode === b.user.mode &&
    Boolean(a.user.ignored) === Boolean(b.user.ignored) &&
    a.state === b.state &&
    a.isYou === b.isYou &&
    a.variant === b.variant &&
    a.showIgnoredBadge === b.showIgnoredBadge
  );
});

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M11.5 2.5l2 2L5 13l-3 .5.5-3L11.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 8l3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PendingIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
