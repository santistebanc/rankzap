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
  beforeSubmit?: () => Promise<void>;
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
  beforeSubmit,
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
      if (beforeSubmit) {
        await withTimeout(beforeSubmit(), SUBMIT_TIMEOUT_MS);
      }
      await withTimeout(
        client.set(
          `votes/${userId}`,
          { userId, ranking, submittedAt: Date.now(), ignored: false },
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
  else if (state === "error") label = "Failed, try again";
  else label = hasVoted ? "Update vote" : "Submit vote";

  const tone =
    state === "error"
      ? "bg-danger text-white hover:brightness-95"
      : state === "success"
        ? "bg-success text-white hover:brightness-95"
        : "border border-accent/30 bg-accent-soft text-accent hover:brightness-98";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div
        className={`flex min-w-0 items-center gap-2 ${
          disabled && disabledReason ? "justify-between" : "justify-end"
        }`}
      >
        {disabled && disabledReason ? (
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted">{disabledReason}</p>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={disabled || state === "submitting" || ranking.length === 0}
          title={disabled ? disabledReason : undefined}
          className={`inline-flex h-10 shrink-0 items-center justify-center rounded-full whitespace-nowrap px-5 text-sm font-semibold transition-colors disabled:opacity-50 ${tone}`}
        >
          {label}
        </button>
      </div>
      {state === "error" && errorMsg ? (
        <p className="text-xs leading-5 text-danger" role="alert">
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
        return "Network hiccup, try again.";
      case "rateLimit":
        return "Slow down, too many writes.";
      case "validation":
        return "Vote rejected by server validation.";
      case "auth":
      case "schemaConflict":
        return "Session expired, refresh the page.";
      default:
        return e.message || "Couldn't submit your vote.";
    }
  }
  if (e instanceof Error) return e.message;
  return "Couldn't submit your vote.";
}
