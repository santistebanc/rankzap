import type { Option } from "../lib/types";
import { adaptiveSize } from "../lib/adaptiveSize";

interface VoterRankingPanelProps {
  voterName: string;
  ranking: string[] | undefined;
  optionById: Map<string, Option>;
}

/** One voter's ranking as a compact, read-only list of white rows. */
export function VoterRankingPanel({ voterName, ranking, optionById }: VoterRankingPanelProps) {
  if (!ranking || ranking.length === 0) {
    return <p className="text-sm font-semibold">No vote submitted yet.</p>;
  }

  return (
    <ol className="grid gap-[3px]" aria-label={`${voterName}'s ranking`}>
      {ranking.map((id, index) => {
        const text = optionById.get(id)?.text ?? "Removed option";
        return (
          <li
            key={`${id}-${index}`}
            className="grid grid-cols-[34px_1fr] items-center bg-step py-2 pr-2.5 text-step-ink"
          >
            <span className="display text-center text-xl tabular-nums" aria-hidden="true">
              {index + 1}
            </span>
            <span
              style={{ fontSize: adaptiveSize(text, 13, 15, 20, 80), fontStretch: "75%" }}
              className="min-w-0 leading-none font-extrabold uppercase wrap-break-word"
            >
              {text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
