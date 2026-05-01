import { SET_OPTS, useRoom, useRoomValue } from "../lib/room";
import { DEFAULT_META } from "../lib/types";

interface PollStateProps {
  controllable: boolean;
}

export function PollState({ controllable }: PollStateProps) {
  const { client } = useRoom();
  const { value: meta } = useRoomValue("meta");
  const isOpen = (meta?.state ?? "open") === "open";

  const toggleState = async () => {
    if (isOpen) {
      const ok = window.confirm(
        "Close the poll? Voters won't be able to submit or change their vote until you reopen it.",
      );
      if (!ok) return;
    }
    try {
      const base = meta ?? DEFAULT_META();
      await client.set(
        "meta",
        { ...base, state: isOpen ? "closed" : "open" },
        SET_OPTS,
      );
    } catch (e) {
      console.warn("[voter] failed to toggle poll state:", e);
    }
  };

  const resetVotes = async () => {
    const ok = window.confirm("Reset all votes? This cannot be undone.");
    if (!ok) return;
    try {
      await client.deletePrefix("votes/");
    } catch (e) {
      console.warn("[voter] failed to reset votes:", e);
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

  return (
    <section aria-label="Poll state" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={toggleState}
          className={`min-h-9 flex-1 px-3 text-sm font-semibold ${
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
          className="min-h-9 flex-1 border border-danger/25 bg-danger-soft px-3 text-sm font-semibold text-danger hover:brightness-98"
        >
          Reset all votes
        </button>
      </div>
    </section>
  );
}
