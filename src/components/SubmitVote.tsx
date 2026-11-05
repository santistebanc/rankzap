import { useState } from "react";
import { RoomError } from "room-server/client";
import { SET_OPTS, useRoom } from "../lib/room";
import { SUBMIT_TIMEOUT_MS } from "../lib/types";
import { Arrow } from "./Arrow";

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
      console.warn("[rankzap] submit failed:", e);
      setState("error");
      setErrorMsg(describeError(e));
    }
  };

  let label: string;
  if (state === "submitting") label = "Locking in…";
  else if (state === "success") label = "Locked in!";
  else if (state === "error") label = "Failed, try again";
  else label = hasVoted ? "Update my vote" : "Lock it in";

  const tone = state === "error" ? "bg-danger text-white" : "bg-hi text-hi-ink";

  return (
    <div className="grid gap-2">
      {disabled && disabledReason ? (
        <p className="text-sm font-semibold">{disabledReason}</p>
      ) : null}
      <button
        type="button"
        onClick={submit}
        disabled={disabled || state === "submitting" || ranking.length === 0}
        className={`flex min-h-16 w-full items-center justify-between px-5 transition-[transform,opacity] duration-150 ease-(--ease-spring) enabled:active:scale-[0.97] disabled:opacity-40 ${tone}`}
      >
        <span className="display text-[26px]">{label}</span>
        <Arrow />
      </button>
      {state === "error" && errorMsg ? (
        <p className="text-sm font-semibold" role="alert">
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
