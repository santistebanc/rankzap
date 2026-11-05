import { useState } from "react";
import { PollActionError, usePoll } from "../lib/poll";
import { Arrow } from "./Arrow";

type SubmitState = "idle" | "submitting" | "success" | "error";

interface SubmitVoteProps {
  ranking: string[];
  /** Options this voter added while ranking. They are saved together with the vote. */
  newOptions: { id: string; text: string }[];
  hasVoted: boolean;
  disabled: boolean;
  disabledReason?: string;
  onSubmitted: () => void;
}

export function SubmitVote({
  ranking,
  newOptions,
  hasVoted,
  disabled,
  disabledReason,
  onSubmitted,
}: SubmitVoteProps) {
  const { send } = usePoll();
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async () => {
    if (ranking.length === 0) return;
    setState("submitting");
    setErrorMsg(null);
    try {
      await send({ type: "vote", ranking, newOptions });
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
  if (e instanceof PollActionError) return e.message;
  return "Couldn't submit your vote.";
}
