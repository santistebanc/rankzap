import { Check } from "lucide-react";
import { memo } from "react";
import type { UserRecord } from "../lib/types";
import { adaptiveSize } from "../lib/adaptiveSize";

export type PillState =
  | "changing"
  | "voting"
  | "voted"
  | "online"
  | "offline"
  | "voted-offline";

interface UserPillProps {
  user: UserRecord;
  state: PillState;
  isYou?: boolean;
  showIgnoredBadge?: boolean;
}

/**
 * Square status tags. Voted is black with the poll colour; ranking and
 * changing a vote blink a small square; offline is outlined and faded.
 */
const STATE_CONFIG: Record<PillState, { className: string; marker: "blink" | "check" | null; label: string }> = {
  changing: { className: "bg-low text-low-ink", marker: "blink", label: "Changing vote" },
  voting: { className: "bg-step text-step-ink", marker: "blink", label: "Ranking now" },
  voted: { className: "bg-[#0b0b0b] text-sig-fg", marker: "check", label: "Voted" },
  online: { className: "bg-step text-step-ink", marker: null, label: "Not voted yet (online)" },
  offline: {
    className: "bg-transparent text-ink opacity-55 shadow-[inset_0_0_0_2px_currentColor]",
    marker: null,
    label: "Not voted yet (offline)",
  },
  "voted-offline": {
    className: "bg-transparent text-ink opacity-55 shadow-[inset_0_0_0_2px_currentColor]",
    marker: "check",
    label: "Voted (offline)",
  },
};

function UserPillRaw({ user, state, isYou, showIgnoredBadge = false }: UserPillProps) {
  const cfg = STATE_CONFIG[state];
  const who = `${user.name}${isYou ? " (you)" : ""}`;
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 px-2.5 py-1.5 text-[13px] leading-none font-extrabold tracking-[0.02em] ${cfg.className} ${
        isYou ? "outline-[3px] -outline-offset-[3px] outline-[#0b0b0b]" : ""
      }`}
      title={`${who}, ${cfg.label}`}
      aria-label={`${who}, ${cfg.label}`}
    >
      {cfg.marker === "blink" ? (
        <span aria-hidden="true" className="size-2 animate-blink bg-current" />
      ) : cfg.marker === "check" ? (
        <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
      ) : null}
      <span style={{ fontSize: adaptiveSize(user.name, 11, 13, 10, 30) }} className="max-w-40 truncate">
        {user.name}
      </span>
      {isYou ? <span className="text-[0.68rem] font-semibold opacity-70">you</span> : null}
      {showIgnoredBadge && user.ignored ? (
        <span className="bg-danger px-1.5 py-0.5 text-[0.64rem] font-bold tracking-wide text-white uppercase">
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
    a.showIgnoredBadge === b.showIgnoredBadge
  );
});

/** Which tag a voter gets, from presence, their mode and whether they've voted. */
export function pillStateFor(
  user: UserRecord,
  online: boolean,
  hasVoted: boolean,
): PillState {
  if (!online && hasVoted) return "voted-offline";
  if (!online) return "offline";
  if (user.mode === "editing") return "changing";
  if (user.mode === "voting") return "voting";
  if (hasVoted) return "voted";
  return "online";
}
