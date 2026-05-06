import type { Option } from "../lib/types";

interface VoterRankingPanelProps {
  voterName: string;
  ranking: string[] | undefined;
  optionById: Map<string, Option>;
}

/** Read-only list of one voter's ranked options — matches LiveOptions results row styling. */
export function VoterRankingPanel({
  voterName: _voterName,
  ranking,
  optionById,
}: VoterRankingPanelProps) {
  const hasRanking = ranking && ranking.length > 0;
  const rows = hasRanking ? ranking : [];

  return (
    <div className="flex flex-col gap-4">
      {!hasRanking ? (
        <p className="text-sm text-muted">No vote submitted yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          <ul className="flex flex-col" aria-label="Voter's ranked options">
            {rows.map((id, index) => {
              const text = optionById.get(id)?.text ?? "Removed option";
              const rank = index + 1;
              return (
                <li
                  key={`${id}-${index}`}
                  className="group relative flex items-center gap-2 overflow-hidden border-t border-border/20 px-4 py-3 first:border-t-0 hover:bg-surface-2/50"
                  aria-label={`${text}, rank ${rank}`}
                >
                  <div className="relative flex w-full min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold tabular-nums text-accent">
                      {rank}
                    </span>
                    <span
                      style={{ fontSize: adaptiveSize(text, 14, 18, 20, 80) }}
                      className="min-w-0 flex-1 leading-5 wrap-break-word transition-[font-size] duration-150"
                    >
                      {text}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function adaptiveSize(text: string, minPx: number, maxPx: number, minChars: number, maxChars: number): number {
  const len = text.length;
  if (len <= minChars) return maxPx;
  if (len >= maxChars) return minPx;
  return maxPx + (minPx - maxPx) * ((len - minChars) / (maxChars - minChars));
}
