import { useState } from "react";
import { SET_OPTS, useRoom, useRoomValue } from "../lib/room";
import { DEFAULT_META } from "../lib/types";

interface PollStateProps {
  controllable: boolean;
}

type Confirming = "close" | "reset" | null;

export function PollState({ controllable }: PollStateProps) {
  const { client } = useRoom();
  const { value: meta } = useRoomValue("meta");
  const isOpen = (meta?.state ?? "open") === "open";
  const [confirming, setConfirming] = useState<Confirming>(null);

  const toggleState = async () => {
    if (isOpen && confirming !== "close") {
      setConfirming("close");
      return;
    }
    setConfirming(null);
    try {
      const base = meta ?? DEFAULT_META();
      await client.set(
        "meta",
        { ...base, state: isOpen ? "closed" : "open" },
        SET_OPTS,
      );
    } catch (e) {
      console.warn("[rankzap] failed to toggle poll state:", e);
    }
  };

  const resetVotes = async () => {
    if (confirming !== "reset") {
      setConfirming("reset");
      return;
    }
    setConfirming(null);
    try {
      await client.deletePrefix("votes/");
    } catch (e) {
      console.warn("[rankzap] failed to reset votes:", e);
    }
  };

  if (!controllable) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
            isOpen
              ? "bg-success-soft text-success"
              : "border border-border bg-surface-2 text-muted"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${isOpen ? "bg-success" : "bg-muted"}`}
          />
          {isOpen ? "Open" : "Closed"}
        </span>
      </div>
    );
  }

  if (confirming === "close") {
    return (
      <section aria-label="Poll state" className="flex flex-col gap-2.5">
        <p className="text-sm text-muted">
          Close the poll? Voters won't be able to submit or change their vote until you reopen it.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={toggleState}
            className="min-h-11 flex-1 rounded-xl bg-text/90 px-3 text-sm font-semibold text-bg hover:opacity-90"
          >
            Yes, close it
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold text-text hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  if (confirming === "reset") {
    return (
      <section aria-label="Poll state" className="flex flex-col gap-2.5">
        <p className="text-sm text-muted">
          Reset all votes? This cannot be undone.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={resetVotes}
            className="min-h-11 flex-1 rounded-xl border border-danger/25 bg-danger-soft px-3 text-sm font-semibold text-danger hover:brightness-98"
          >
            Yes, reset votes
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold text-text hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Poll state" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={toggleState}
          className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold ${
            isOpen
              ? "border border-border bg-surface-2 text-text hover:bg-surface"
              : "bg-success text-white"
          }`}
        >
          {isOpen ? "Close poll" : "Reopen poll"}
        </button>
        <button
          type="button"
          onClick={resetVotes}
          className="min-h-11 flex-1 rounded-xl border border-danger/25 bg-danger-soft px-3 text-sm font-semibold text-danger hover:brightness-98"
        >
          Reset all votes
        </button>
      </div>
    </section>
  );
}
