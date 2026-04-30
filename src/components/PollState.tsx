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
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isOpen
              ? "bg-success-soft text-success"
              : "bg-surface-2 text-muted border border-border"
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
    <section aria-label="Poll state" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggleState}
        className={`flex-1 min-w-[10rem] rounded-lg px-3 py-2 text-sm font-medium ${
          isOpen
            ? "border border-border bg-surface text-text hover:bg-surface-2"
            : "bg-success text-white"
        }`}
      >
        {isOpen ? "Close poll" : "Open poll"}
      </button>
      <button
        type="button"
        onClick={resetVotes}
        className="flex-1 min-w-[10rem] rounded-lg border border-danger-soft bg-transparent px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
      >
        Reset votes
      </button>
    </section>
  );
}
