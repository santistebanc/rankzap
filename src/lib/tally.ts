import type { Option, TallyMode, Vote } from "./types";

export interface TallyEntry {
  optionId: string;
  score: number;
  rank: number;
}

interface TallyInput {
  options: Option[];
  votes: Vote[];
  mode: TallyMode;
}

/**
 * Compute scores for each option and return them sorted by score desc.
 * Tie-breaking: ascending by `option.addedAt` (older first), so the order is
 * deterministic across re-renders even when scores are equal.
 *
 * Votes that reference options no longer in the option set are filtered out.
 */
export function computeTally({ options, votes, mode }: TallyInput): TallyEntry[] {
  const optionIds = new Set(options.map((o) => o.id));
  const orderById = new Map(options.map((o, i) => [o.id, { addedAt: o.addedAt, idx: i }]));

  const cleanedVotes: string[][] = votes.map((v) =>
    v.ranking.filter((id) => optionIds.has(id)),
  );

  let scores: Map<string, number>;
  switch (mode) {
    case "borda":
      scores = bordaScores(options, cleanedVotes);
      break;
    case "dowdall":
      scores = dowdallScores(options, cleanedVotes);
      break;
    case "copeland":
      scores = copelandScores(options, cleanedVotes);
      break;
  }

  const entries = options.map((o) => ({
    optionId: o.id,
    score: scores.get(o.id) ?? 0,
  }));

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ai = orderById.get(a.optionId)!;
    const bi = orderById.get(b.optionId)!;
    if (ai.addedAt !== bi.addedAt) return ai.addedAt - bi.addedAt;
    return ai.idx - bi.idx;
  });

  let lastScore = Number.POSITIVE_INFINITY;
  let lastRank = 0;
  return entries.map((e, i) => {
    if (e.score < lastScore) {
      lastScore = e.score;
      lastRank = i + 1;
    }
    return { ...e, rank: lastRank };
  });
}

// ── Borda Count ─────────────────────────────────────────────────────────────
// 1st place gets (N-1) points, 2nd gets (N-2), ... unranked gets 0.
function bordaScores(options: Option[], votes: string[][]): Map<string, number> {
  const N = options.length;
  const out = new Map<string, number>();
  for (const o of options) out.set(o.id, 0);
  for (const ranking of votes) {
    for (let i = 0; i < ranking.length; i++) {
      const id = ranking[i];
      out.set(id, (out.get(id) ?? 0) + (N - 1 - i));
    }
  }
  return out;
}

// ── Dowdall ─────────────────────────────────────────────────────────────────
// 1st = 1, 2nd = 1/2, 3rd = 1/3, ... unranked = 0.
function dowdallScores(options: Option[], votes: string[][]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of options) out.set(o.id, 0);
  for (const ranking of votes) {
    for (let i = 0; i < ranking.length; i++) {
      const id = ranking[i];
      out.set(id, (out.get(id) ?? 0) + 1 / (i + 1));
    }
  }
  return out;
}

// ── Copeland ────────────────────────────────────────────────────────────────
// For each pair (A,B): count voters ranking A above B.
// A wins the pair (+1) if more voters prefer A; tie = +0.5 each; otherwise +0.
// Final score = sum across all opposing options. Unranked options are
// treated as ranked below all ranked ones (and tied with each other).
function copelandScores(options: Option[], votes: string[][]): Map<string, number> {
  const out = new Map<string, number>();
  const ids = options.map((o) => o.id);
  for (const id of ids) out.set(id, 0);

  // Precompute each voter's index map: optionId -> rank-index (or Infinity if unranked)
  const indexMaps = votes.map((ranking) => {
    const m = new Map<string, number>();
    for (let i = 0; i < ranking.length; i++) m.set(ranking[i], i);
    return m;
  });

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      let aWins = 0;
      let bWins = 0;
      for (const m of indexMaps) {
        const ra = m.has(a) ? (m.get(a) as number) : Infinity;
        const rb = m.has(b) ? (m.get(b) as number) : Infinity;
        if (ra < rb) aWins++;
        else if (rb < ra) bWins++;
        // both Infinity → tie, no contribution
      }
      if (aWins > bWins) {
        out.set(a, (out.get(a) ?? 0) + 1);
      } else if (bWins > aWins) {
        out.set(b, (out.get(b) ?? 0) + 1);
      } else {
        out.set(a, (out.get(a) ?? 0) + 0.5);
        out.set(b, (out.get(b) ?? 0) + 0.5);
      }
    }
  }
  return out;
}
