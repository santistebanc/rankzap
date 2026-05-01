import { useEffect, useMemo, useRef, useState } from "react";
import { SET_OPTS, useRoom, useRoomList } from "../lib/room";
import {
  clampOption,
  type Option,
  type TallyMode,
  type Vote,
} from "../lib/types";
import { computeTally } from "../lib/tally";

interface LiveOptionsProps {
  removable: boolean;
  /** When true, show score bars (admin always; voter conditionally). */
  showResults: boolean;
  /** Tally mode used to compute the bars when showResults is true. */
  tallyMode: TallyMode;
  /** When true, option text is inline-editable (admin only). */
  editable?: boolean;
}

export function LiveOptions({
  removable,
  showResults,
  tallyMode,
  editable = false,
}: LiveOptionsProps) {
  const optionsMap = useRoomList("options/");
  const votesMap = useRoomList("votes/");
  const usersMap = useRoomList("users/");

  const options = useMemo<Option[]>(() => {
    return [...optionsMap.values()].sort((a, b) => a.addedAt - b.addedAt);
  }, [optionsMap]);

  const votes = useMemo<Vote[]>(() => {
    const ignoredUserIds = new Set(
      [...usersMap.values()].filter((u) => u.ignored).map((u) => u.id),
    );
    return [...votesMap.values()].filter((v) => !ignoredUserIds.has(v.userId));
  }, [usersMap, votesMap]);

  const tally = useMemo(
    () => computeTally({ options, votes, mode: tallyMode }),
    [options, votes, tallyMode],
  );

  const orderedIds = showResults ? tally.map((t) => t.optionId) : options.map((o) => o.id);
  const tallyByOption = new Map(tally.map((t) => [t.optionId, t]));
  const maxScore = Math.max(0, ...tally.map((t) => t.score));

  if (options.length === 0) {
    return (
      <div className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        No options yet.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Poll options">
      {orderedIds.map((id) => {
        const option = options.find((o) => o.id === id);
        if (!option) return null;
        const t = tallyByOption.get(id);
        return (
          <OptionRow
            key={id}
            option={option}
            score={t?.score ?? 0}
            rank={t?.rank ?? 0}
            maxScore={maxScore}
            showResults={showResults}
            removable={removable}
            editable={editable}
          />
        );
      })}
    </ul>
  );
}

interface OptionRowProps {
  option: Option;
  score: number;
  rank: number;
  maxScore: number;
  showResults: boolean;
  removable: boolean;
  editable: boolean;
}

function OptionRow({
  option,
  score,
  rank,
  maxScore,
  showResults,
  removable,
  editable,
}: OptionRowProps) {
  const { client } = useRoom();
  const [draft, setDraft] = useState(option.text);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setDraft(option.text);
  }, [option.text, focused]);

  const commit = (next: string) => {
    const clamped = clampOption(next);
    if (!clamped || clamped === option.text) {
      setDraft(option.text);
      return;
    }
    void client
      .set(`options/${option.id}`, { ...option, text: clamped }, SET_OPTS)
      .catch((e) => console.warn("[voter] failed to update option:", e));
  };

  const remove = () => {
    void client
      .delete(`options/${option.id}`)
      .catch((e) => console.warn("[voter] failed to delete option:", e));
  };

  const pct = maxScore > 0 ? Math.max(2, (score / maxScore) * 100) : 0;
  const ariaLabel = showResults
    ? `${option.text}, ${ordinal(rank)} place, ${formatScore(score)} points`
    : option.text;

  return (
    <li
      className="relative overflow-hidden border border-border bg-surface"
      aria-label={ariaLabel}
    >
      {showResults ? (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      ) : null}
      <div className="relative flex items-center gap-3 px-3 py-2.5">
        {showResults ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold tabular-nums text-accent">
            {rank}
          </span>
        ) : null}

        {editable ? (
          <input
            ref={inputRef}
            value={draft}
            maxLength={200}
            aria-label="Option text"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              setFocused(false);
              commit(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                inputRef.current?.blur();
              } else if (e.key === "Escape") {
                setDraft(option.text);
                inputRef.current?.blur();
              }
            }}
            className="min-h-8 flex-1 min-w-0 bg-transparent px-2 py-1.5 outline-none focus:bg-surface-2"
          />
        ) : (
          <span className="flex-1 min-w-0 text-sm font-medium leading-5 wrap-break-word">
            {option.text}
          </span>
        )}

        {showResults ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">
            {formatScore(score)}
          </span>
        ) : null}

        {removable ? (
          <button
            type="button"
            onClick={remove}
            aria-label={`Remove ${option.text}`}
            className="min-h-8 min-w-8 shrink-0 p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </li>
  );
}

function formatScore(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function ordinal(n: number): string {
  if (n === 0) return "unranked";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
