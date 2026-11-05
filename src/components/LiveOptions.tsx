import { useEffect, useMemo, useRef, useState } from "react";
import { useSendAction } from "../lib/poll";
import { usePollData } from "../pages/poll/shared";
import { clampOption, type Option, type TallyMode, type Vote } from "../lib/types";
import { X } from "lucide-react";
import { adaptiveSize } from "../lib/adaptiveSize";
import { computeTally } from "../lib/tally";
import { Punch } from "./Punch";

interface LiveOptionsProps {
  removable: boolean;
  showResults: boolean;
  tallyMode: TallyMode;
  editable?: boolean;
  highlightWinner?: boolean;
  /** `panel` sits on a white admin panel, so the bars fill with the poll colour instead of white. */
  surface?: "ground" | "panel";
}

export function LiveOptions({
  removable,
  showResults,
  tallyMode,
  editable = false,
  highlightWinner = false,
  surface = "ground",
}: LiveOptionsProps) {
  const { options, optionById, votesMap, usersMap } = usePollData();

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

  if (options.length === 0) return null;

  return (
    <ul className="grid gap-1.5" aria-label="Poll options">
      {orderedIds.map((id) => {
        const option = optionById.get(id);
        if (!option) return null;
        const t = tallyByOption.get(id);
        // Nobody leads until someone has scored; ties for first all lead.
        const isLeader = showResults && maxScore > 0 && (t?.rank ?? 0) === 1;
        return (
          <OptionRow
            key={id}
            option={option}
            score={t?.score ?? 0}
            rank={t?.rank ?? 0}
            maxScore={maxScore}
            showResults={showResults}
            isLeader={isLeader}
            isWinner={highlightWinner && isLeader}
            surface={surface}
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
  isLeader: boolean;
  isWinner: boolean;
  surface: "ground" | "panel";
  removable: boolean;
  editable: boolean;
}

/**
 * A score band: a pale track in the poll colour, filled white in proportion
 * to the score. The leader's band is black with the poll colour as text.
 */
function OptionRow({
  option,
  score,
  rank,
  maxScore,
  showResults,
  isLeader,
  isWinner,
  surface,
  removable,
  editable,
}: OptionRowProps) {
  const sendAction = useSendAction();
  const [draft, setDraft] = useState(option.text);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(option.text);
  }, [option.text, focused]);

  const commit = (next: string) => {
    const clamped = clampOption(next);
    if (!clamped || clamped === option.text) { setDraft(option.text); return; }
    sendAction({ type: "editOption", id: option.id, text: clamped });
  };

  const remove = () => {
    sendAction({ type: "removeOption", id: option.id });
  };

  const share = maxScore > 0 ? Math.max(0.02, score / maxScore) : 0;
  const ariaLabel = showResults
    ? `${option.text}, ${ordinal(rank)} place, ${formatScore(score)} points${isWinner ? ", winner" : ""}`
    : option.text;
  const nameStyle: React.CSSProperties = {
    fontSize: adaptiveSize(editable ? draft : option.text, 15, 19, 20, 80),
    fontStretch: "75%",
  };

  return (
    <li
      className={`group relative grid min-h-[54px] items-center bg-low text-low-ink ${
        showResults ? "grid-cols-[44px_1fr_auto]" : "grid-cols-[14px_1fr_auto]"
      } ${removable ? "pr-0" : "pr-3"}`}
      aria-label={ariaLabel}
    >
      {showResults ? (
        <div
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-full origin-left transition-transform duration-500 ease-(--ease-bar) ${isLeader ? "bg-hi" : surface === "panel" ? "bg-sig-fg" : "bg-step"}`}
          style={{ transform: `scaleX(${share})` }}
        />
      ) : null}

      {showResults ? (
        <span aria-hidden="true" className={`display relative text-center text-[34px] tabular-nums ${isLeader ? "text-hi-ink" : ""}`}>
          <Punch value={rank}>{rank || "–"}</Punch>
        </span>
      ) : (
        <span aria-hidden="true" />
      )}

      <div className={`relative flex min-w-0 items-center gap-2 py-2 pr-2 ${isLeader ? "text-hi-ink" : ""}`}>
        {editable ? (
          // A one-row textarea that grows with its text (field-sizing), so long options wrap.
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
            onFocus={() => { cancelledRef.current = false; setFocused(true); }}
            onBlur={(e) => { setFocused(false); if (!cancelledRef.current) commit(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); inputRef.current?.blur(); }
              else if (e.key === "Escape") { cancelledRef.current = true; setDraft(option.text); inputRef.current?.blur(); }
            }}
            aria-label={`Edit option: ${option.text}`}
            style={nameStyle}
            className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent py-1 leading-none font-extrabold uppercase outline-none focus:shadow-[0_3px_0_currentColor]"
          />
        ) : (
          <span style={nameStyle} className="min-w-0 flex-1 font-extrabold leading-none uppercase wrap-break-word">
            {option.text}
          </span>
        )}
        {isWinner ? (
          <span className="shrink-0 bg-hi-ink px-2 py-1 text-[0.7rem] font-extrabold tracking-[0.06em] text-hi uppercase">
            Winner
          </span>
        ) : null}
      </div>

      {showResults || removable ? (
        <div className={`relative flex items-center ${isLeader ? "text-hi-ink" : ""}`}>
          {showResults ? (
            <span className="display text-[28px] tabular-nums" aria-hidden="true">
              <Punch value={score}>{formatScore(score)}</Punch>
            </span>
          ) : null}
          {removable ? (
            <button
              type="button"
              onClick={remove}
              aria-label={`Remove ${option.text}`}
              className="inline-flex size-11 shrink-0 items-center justify-center opacity-45 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-80"
            >
              <X className="size-4" strokeWidth={2.5} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
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
