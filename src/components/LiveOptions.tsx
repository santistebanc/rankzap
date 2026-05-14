import { useEffect, useMemo, useRef, useState } from "react";
import { SET_OPTS, useRoom, useRoomList } from "../lib/room";
import {
  clampOption,
  type Option,
  type TallyMode,
  type UserRecord,
  type Vote,
} from "../lib/types";
import { X } from "lucide-react";
import { adaptiveSize } from "../lib/adaptiveSize";
import { computeTally } from "../lib/tally";
import { RankCircle } from "./RankCircle";

interface LiveOptionsProps {
  removable: boolean;
  showResults: boolean;
  tallyMode: TallyMode;
  editable?: boolean;
  optionsMap?: Map<string, Option>;
  votesMap?: Map<string, Vote>;
  usersMap?: Map<string, UserRecord>;
}

export function LiveOptions({
  removable,
  showResults,
  tallyMode,
  editable = false,
  optionsMap: optionsMapProp,
  votesMap: votesMapProp,
  usersMap: usersMapProp,
}: LiveOptionsProps) {
  const ownOptionsMap = useRoomList("options/");
  const ownVotesMap = useRoomList("votes/");
  const ownUsersMap = useRoomList("users/");

  const optionsMap = optionsMapProp ?? ownOptionsMap;
  const votesMap = votesMapProp ?? ownVotesMap;
  const usersMap = usersMapProp ?? ownUsersMap;

  const options = useMemo<Option[]>(
    () => [...optionsMap.values()].sort((a, b) => a.addedAt - b.addedAt),
    [optionsMap],
  );

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
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const maxScore = Math.max(0, ...tally.map((t) => t.score));

  if (options.length === 0) return null;

  return (
    <ul className="flex flex-col" aria-label="Poll options">
      {orderedIds.map((id) => {
        const option = optionById.get(id);
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
    if (!clamped || clamped === option.text) { setDraft(option.text); return; }
    void client
      .set(`options/${option.id}`, { ...option, text: clamped }, SET_OPTS)
      .catch((e) => console.warn("[rankzap] failed to update option:", e));
  };

  const remove = () => {
    void client
      .delete(`options/${option.id}`)
      .catch((e) => console.warn("[rankzap] failed to delete option:", e));
  };

  const pct = maxScore > 0 ? Math.max(2, (score / maxScore) * 100) : 0;
  const ariaLabel = showResults
    ? `${option.text}, ${ordinal(rank)} place, ${formatScore(score)} points`
    : option.text;

  return (
    <li
      className="group relative flex items-center gap-2 overflow-hidden border-b border-dashed border-border/50 px-4 py-3 last:border-b-0 hover:bg-surface-2/40"
      aria-label={ariaLabel}
    >
      {showResults ? (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-full origin-left bg-accent-soft/60 transition-transform duration-300 will-change-transform"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      ) : null}
      <div className="relative flex w-full items-center gap-2">
        {showResults ? (
          <RankCircle n={rank} size={28} />
        ) : null}

        {editable ? (
          <input
            ref={inputRef}
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => { setFocused(false); commit(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); inputRef.current?.blur(); }
              else if (e.key === "Escape") { setDraft(option.text); inputRef.current?.blur(); }
            }}
            aria-label={`Edit option: ${option.text}`}
            style={{ fontSize: adaptiveSize(draft, 14, 18, 20, 80) }}
            className="-mx-1 min-h-0 flex-1 min-w-0 bg-transparent px-1 py-0.5 outline-none transition-[font-size] duration-150"
          />
        ) : (
          <span style={{ fontSize: adaptiveSize(option.text, 14, 18, 20, 80) }} className="flex-1 min-w-0 leading-5 wrap-break-word transition-[font-size] duration-150">{option.text}</span>
        )}


        {removable ? (
          <button
            type="button"
            onClick={remove}
            aria-label={`Remove ${option.text}`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted/40 transition-colors hover:bg-danger-soft hover:text-danger group-hover:text-muted group-focus-within:text-muted focus-visible:text-danger focus-visible:opacity-100"
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden />
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
