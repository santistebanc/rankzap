import type { Option } from "../lib/types";

interface VoterRankingPanelProps {
  voterName: string;
  ranking: string[] | undefined;
  optionById: Map<string, Option>;
}

/** Read-only list of one voter's ranked options. */
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
        <ul className="flex flex-col gap-3" aria-label="Voter's ranked options">
          {rows.map((id, index) => (
            <li
              key={`${id}-${index}`}
              className="flex items-center gap-3 border border-border bg-surface px-3 py-2.5"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold tabular-nums text-accent"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium leading-5 wrap-break-word">
                {optionById.get(id)?.text ?? "Removed option"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
