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
}

const STATE_CONFIG: Record<PillState, { className: string; icon: React.ReactNode; label: string }> = {
  changing: {
    className: "bg-accent-soft text-accent border-accent",
    icon: <PencilIcon className="size-3 animate-pulse" />,
    label: "Changing vote",
  },
  voting: {
    className: "bg-accent-soft text-accent border-accent",
    icon: <PencilIcon className="size-3" />,
    label: "Voting",
  },
  voted: {
    className: "bg-success-soft text-success border-success",
    icon: <CheckIcon className="size-3" />,
    label: "Voted",
  },
  online: {
    className: "bg-surface-2 text-text border-border",
    icon: <span className="size-2 rounded-full bg-success" />,
    label: "Online",
  },
  offline: {
    className: "bg-transparent text-muted border-border opacity-60",
    icon: <span className="size-2 rounded-full border border-muted" />,
    label: "Offline",
  },
};

function UserPillRaw({ user, state, isYou }: UserPillProps) {
  const cfg = STATE_CONFIG[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.className}`}
      title={`${user.name}${isYou ? " (you)" : ""} — ${cfg.label}`}
      aria-label={`${user.name}${isYou ? " (you)" : ""}, ${cfg.label}`}
    >
      <span aria-hidden="true" className="flex items-center">
        {cfg.icon}
      </span>
      <span className="max-w-[10rem] truncate">{user.name}</span>
      {isYou ? <span className="text-[0.6rem] opacity-70">you</span> : null}
    </span>
  );
}

export const UserPill = memo(UserPillRaw, (a, b) => {
  return (
    a.user.id === b.user.id &&
    a.user.name === b.user.name &&
    a.user.mode === b.user.mode &&
    a.state === b.state &&
    a.isYou === b.isYou
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
