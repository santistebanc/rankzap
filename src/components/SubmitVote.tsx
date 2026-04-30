import { useState } from "react";
import { RoomError } from "room-server/client";
import { SET_OPTS, useRoom } from "../lib/room";
import { SUBMIT_TIMEOUT_MS } from "../lib/types";

type SubmitState = "idle" | "submitting" | "success" | "error";

interface SubmitVoteProps {
  userId: string;
  ranking: string[];
  hasVoted: boolean;
  disabled: boolean;
  disabledReason?: string;
  onSubmitted: () => void;
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out")), ms),
    ),
  ]);

export function SubmitVote({
  userId,
  ranking,
  hasVoted,
  disabled,
  disabledReason,
  onSubmitted,
}: SubmitVoteProps) {
  const { client } = useRoom();
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async () => {
    if (ranking.length === 0) return;
    setState("submitting");
    setErrorMsg(null);
    try {
      await withTimeout(
        client.set(
          `votes/${userId}`,
          { userId, ranking, submittedAt: Date.now() },
          SET_OPTS,
        ),
        SUBMIT_TIMEOUT_MS,
      );
      setState("success");
      setTimeout(() => setState("idle"), 1500);
      onSubmitted();
    } catch (e) {
      console.warn("[voter] submit failed:", e);
      setState("error");
      setErrorMsg(describeError(e));
    }
  };

  let label: string;
  if (state === "submitting") label = "Submitting…";
  else if (state === "success") label = "Submitted!";
  else if (state === "error") label = "Failed — retry?";
  else label = hasVoted ? "Update vote" : "Submit vote";

  const tone =
    state === "error"
      ? "bg-danger text-white"
      : state === "success"
        ? "bg-success text-white"
        : "bg-accent text-white";

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={submit}
        disabled={disabled || state === "submitting" || ranking.length === 0}
        title={disabled ? disabledReason : undefined}
        className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${tone}`}
      >
        {label}
      </button>
      {disabled && disabledReason ? (
        <p className="text-xs text-muted">{disabledReason}</p>
      ) : null}
      {state === "error" && errorMsg ? (
        <p className="text-xs text-danger" role="alert">
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}

function describeError(e: unknown): string {
  if (e instanceof RoomError) {
    switch (e.kind) {
      case "transient":
        return "Network hiccup — try again.";
      case "rateLimit":
        return "Slow down — too many writes.";
      case "validation":
        return "Vote rejected by server validation.";
      case "auth":
      case "schemaConflict":
        return "Session expired — refresh the page.";
      default:
        return e.message || "Couldn't submit your vote.";
    }
  }
  if (e instanceof Error) return e.message;
  return "Couldn't submit your vote.";
}
