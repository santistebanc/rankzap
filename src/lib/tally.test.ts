import { describe, expect, it } from "vitest";
import { computeTally } from "./tally";
import type { Option, TallyMode, Vote } from "./types";

const option = (id: string, addedAt: number): Option => ({ id, text: id, addedBy: "host", addedAt });
const vote = (userId: string, ranking: string[], ignored = false): Vote => ({
  userId,
  ranking,
  submittedAt: 0,
  ignored,
});

const options = [option("a", 1), option("b", 2), option("c", 3)];
const tally = (votes: Vote[], mode: TallyMode, opts = options) => computeTally({ options: opts, votes, mode });
const scores = (votes: Vote[], mode: TallyMode) =>
  Object.fromEntries(tally(votes, mode).map((e) => [e.optionId, e.score]));

describe("computeTally", () => {
  it("gives N-1, N-2, ... points in Borda mode and 0 to unranked options", () => {
    const votes = [vote("u1", ["a", "b", "c"]), vote("u2", ["b", "a"])];
    expect(scores(votes, "borda")).toEqual({ a: 2 + 1, b: 1 + 2, c: 0 });
  });

  it("gives 1, 1/2, 1/3 points in Dowdall mode", () => {
    const votes = [vote("u1", ["a", "b", "c"]), vote("u2", ["c"])];
    const result = scores(votes, "dowdall");
    expect(result.a).toBe(1);
    expect(result.b).toBe(0.5);
    expect(result.c).toBeCloseTo(1 / 3 + 1);
  });

  it("counts pairwise wins in Copeland mode", () => {
    // a beats b (2-1) and c (2-1); b beats c (2-1), because u3 ranks b and leaves c unranked.
    const votes = [vote("u1", ["a", "b", "c"]), vote("u2", ["c", "a", "b"]), vote("u3", ["b", "a"])];
    expect(scores(votes, "copeland")).toEqual({ a: 2, b: 1, c: 0 });
  });

  it("treats unranked options as below ranked ones and gives half a point for a tie", () => {
    const votes = [vote("u1", ["c"])];
    expect(scores(votes, "copeland")).toEqual({ a: 0.5, b: 0.5, c: 2 });
  });

  it("sorts by score, then older options first, and shares a rank on a tie", () => {
    const votes = [vote("u1", ["c", "b"]), vote("u2", ["b", "c"])];
    expect(tally(votes, "borda")).toEqual([
      { optionId: "b", score: 3, rank: 1 },
      { optionId: "c", score: 3, rank: 1 },
      { optionId: "a", score: 0, rank: 3 },
    ]);
  });

  it("skips ignored votes", () => {
    const votes = [vote("u1", ["a"]), vote("u2", ["c"], true)];
    expect(scores(votes, "borda")).toEqual({ a: 2, b: 0, c: 0 });
  });

  it("drops ranked ids of options that were removed", () => {
    const votes = [vote("u1", ["gone", "a"])];
    const result = tally(votes, "borda");
    expect(result.map((e) => e.optionId)).not.toContain("gone");
    // "a" moves up to first place once the removed option is dropped.
    expect(result[0]).toEqual({ optionId: "a", score: 2, rank: 1 });
  });

  it("returns every option with rank 1 when nobody has voted", () => {
    for (const mode of ["borda", "dowdall", "copeland"] as const) {
      expect(tally([], mode).map((e) => [e.optionId, e.rank])).toEqual([
        ["a", 1],
        ["b", 1],
        ["c", 1],
      ]);
    }
  });
});
