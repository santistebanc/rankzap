import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SET_OPTS, useRoom } from "../../lib/room";
import { clampTitle, TALLY_MODE_LABELS, type Settings } from "../../lib/types";
import { adaptiveSize } from "../../lib/adaptiveSize";
import { SharePanel, ShareScreen } from "../../components/ShareLink";
import { UsersList } from "../../components/UsersList";
import { AddOption } from "../../components/AddOption";
import { LiveOptions } from "../../components/LiveOptions";
import { ColourPanel, Panel, ScoringPanel, SettingsPanel } from "../../components/Settings";
import { VoterRankingPanel } from "../../components/VoterRankingPanel";
import { PoweredByFooter, type PollData } from "./shared";

type Confirming = "close" | "reset" | "deleteVote" | null;

/**
 * The host's page. Desktop: options and voters on the left, share and setup
 * on the right. Phones get the same panels in one column.
 */
export function AdminView({ poll }: { poll: PollData }) {
  const { roomId, meta, settings, options, votedUserIds, onlineUserIds } = poll;
  const navigate = useNavigate();
  const { client } = useRoom();

  const [selectedVoterId, setSelectedVoterId] = useState<string | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);

  const closed = meta.state === "closed";
  const votedCount = votedUserIds.size;
  const visibleVoterCount = new Set([...onlineUserIds, ...votedUserIds]).size;
  const closeShare = useCallback(() => setIsShareOpen(false), []);

  const togglePollState = useCallback(async () => {
    try {
      await client.set("meta", { ...meta, state: closed ? "open" : "closed" }, SET_OPTS);
    } catch (e) {
      console.warn("[rankzap] failed to toggle poll state:", e);
    }
  }, [client, meta, closed]);

  const resetVotes = useCallback(async () => {
    try {
      await client.deletePrefix("votes/");
    } catch (e) {
      console.warn("[rankzap] failed to reset votes:", e);
    }
  }, [client]);

  const toggleVoterSelection = useCallback((userId: string) => {
    setSelectedVoterId((prev) => (prev === userId ? null : userId));
  }, []);
  const clearVoterSelection = useCallback(() => setSelectedVoterId(null), []);

  useEffect(() => {
    setConfirming((a) => (a === "deleteVote" ? null : a));
  }, [selectedVoterId]);

  return (
    <main className="mx-auto w-full max-w-[1240px] text-ink">
      <header className="flex flex-wrap items-center gap-x-3.5 gap-y-3 px-[18px] py-[18px] lg:px-7">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back to homepage"
          className="flex min-h-11 items-center gap-1.5 font-extrabold uppercase"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-4">
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" />
          </svg>
          Rankzap
        </button>
        <span className="bg-chip px-2.5 py-[7px] font-extrabold tracking-[0.04em] text-chip-ink">{roomId}</span>
        <span className="font-bold">
          {closed ? "Closed" : "Open"} · {votedCount} {votedCount === 1 ? "vote" : "votes"}
        </span>
        <span className="hidden flex-1 sm:block" />
        <PollActions
          closed={closed}
          votedCount={votedCount}
          confirming={confirming}
          setConfirming={setConfirming}
          onToggle={() => void togglePollState()}
          onReset={() => void resetVotes()}
        />
      </header>

      <PollTitle settings={settings} />

      <div className="grid items-start gap-4 px-[18px] pt-6 pb-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-5 lg:px-7">
        <div className="grid gap-4">
          <Panel
            title="Options"
            aside={options.length > 0 ? `Live · ${TALLY_MODE_LABELS[settings.tallyMode]} · click a name to edit` : undefined}
          >
            {options.length === 0 ? (
              <p className="mb-1 text-[15px] font-semibold">No options yet. Add the first one, or paste a list.</p>
            ) : (
              <LiveOptions
                surface="panel"
                removable
                editable
                showResults
                tallyMode={settings.tallyMode}
                highlightWinner={closed}
              />
            )}
            <AddOption addedBy="admin" variant="field" />
          </Panel>

          <Panel
            title="Voters"
            aside={visibleVoterCount > 0 ? `${visibleVoterCount} here · click one to see their ranking` : undefined}
          >
            {visibleVoterCount === 0 ? (
              <p className="text-[15px] font-semibold">Nobody has joined yet. Share the code to get people in.</p>
            ) : (
              <UsersList
                showIgnoredBadge
                variant="tabStrip"
                selectedVoterId={selectedVoterId}
                onToggleVoter={toggleVoterSelection}
                onInvalidateVoterSelection={clearVoterSelection}
              />
            )}
            {selectedVoterId ? (
              <VoterDetail
                key={selectedVoterId}
                voterId={selectedVoterId}
                poll={poll}
                confirmingDelete={confirming === "deleteVote"}
                setConfirmingDelete={(on) => setConfirming(on ? "deleteVote" : null)}
                onClose={clearVoterSelection}
              />
            ) : null}
          </Panel>
        </div>

        <div className="grid gap-4">
          <SharePanel roomId={roomId} onShowQr={() => setIsShareOpen(true)} />
          <ColourPanel />
          <ScoringPanel />
          <SettingsPanel />
        </div>
      </div>

      <PoweredByFooter onCreatePoll={() => navigate("/")} showCreateLink={false} />
      {isShareOpen ? <ShareScreen roomId={roomId} onClose={closeShare} /> : null}
    </main>
  );
}

/** Reset votes and Close / Reopen, each asking once before acting. */
function PollActions({
  closed,
  votedCount,
  confirming,
  setConfirming,
  onToggle,
  onReset,
}: {
  closed: boolean;
  votedCount: number;
  confirming: Confirming;
  setConfirming: (c: Confirming) => void;
  onToggle: () => void;
  onReset: () => void;
}) {
  const ghost = "display min-h-11 bg-step px-3.5 text-lg text-step-ink";
  const strong = "display min-h-11 bg-[#0b0b0b] px-3.5 text-lg text-sig-fg";

  if (confirming === "close" || confirming === "reset") {
    const isClose = confirming === "close";
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Confirm">
        <span className="mr-1 font-bold">
          {isClose ? "Close the poll? Nobody can vote after." : `Delete all ${votedCount} votes?`}
        </span>
        <button type="button" onClick={() => setConfirming(null)} className={ghost}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(null);
            if (isClose) onToggle();
            else onReset();
          }}
          className={strong}
        >
          {isClose ? "Yes, close" : "Yes, reset"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      {votedCount > 0 && (
        <button type="button" onClick={() => setConfirming("reset")} className={ghost}>
          Reset votes
        </button>
      )}
      <button type="button" onClick={closed ? onToggle : () => setConfirming("close")} className={strong}>
        {closed ? "Reopen poll" : "Close poll"}
      </button>
    </div>
  );
}

/** The question, edited in place. Saved on blur or Enter; Escape puts it back. */
function PollTitle({ settings }: { settings: Settings }) {
  const { client } = useRoom();
  const committed = clampTitle(settings.ballotTitle ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  /** While a title write is in flight, don't sync the draft from a stale `committed`. */
  const pendingRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const [draft, setDraft] = useState(committed);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    if (pendingRef.current !== null) {
      if (committed !== pendingRef.current) return;
      pendingRef.current = null;
    }
    setDraft(committed);
  }, [committed, focused]);

  // Grow the textarea with its text.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    resize();
    // Height changes are our own writes; only a width change needs another resize.
    let width = el.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [draft]);

  const commit = () => {
    const next = clampTitle(draft);
    setDraft(next);
    if (next === committed) return;
    pendingRef.current = next;
    void client.set("settings", { ...settings, ballotTitle: next }, SET_OPTS).catch((e) => {
      console.warn("[rankzap] failed to update poll title:", e);
      pendingRef.current = null;
    });
  };

  return (
    <div className="px-[18px] lg:px-7">
      <textarea
        ref={ref}
        rows={1}
        maxLength={100}
        value={draft}
        placeholder="Your question"
        aria-label="Poll question"
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
        onFocus={() => {
          cancelledRef.current = false;
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          if (!cancelledRef.current) commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            ref.current?.blur();
          } else if (e.key === "Escape") {
            cancelledRef.current = true;
            setDraft(committed);
            ref.current?.blur();
          }
        }}
        style={{ fontSize: `min(${adaptiveSize(draft, 44, 84, 12, 60)}px, 14vw)` }}
        className="display block w-full resize-none overflow-hidden rounded-none border-b-4 border-current bg-transparent pt-1 pb-2 text-ink outline-none placeholder:text-current placeholder:opacity-35 focus:shadow-[0_3px_0_currentColor]"
      />
    </div>
  );
}

/** One voter's ranking inside the Voters panel, with ignore and delete. */
function VoterDetail({
  voterId,
  poll,
  confirmingDelete,
  setConfirmingDelete,
  onClose,
}: {
  voterId: string;
  poll: PollData;
  confirmingDelete: boolean;
  setConfirmingDelete: (on: boolean) => void;
  onClose: () => void;
}) {
  const { client } = useRoom();
  const vote = poll.votesMap.get(`votes/${voterId}`);
  const user = poll.usersMap.get(`users/${voterId}`);
  const name = user?.name || "Voter";
  const hasVote = Boolean(vote?.ranking?.length);
  const isIgnored = Boolean(user?.ignored || vote?.ignored);

  const toggleIgnored = () => {
    if (!user) return;
    const next = !isIgnored;
    const writes: Promise<unknown>[] = [client.set(`users/${voterId}`, { ...user, ignored: next }, SET_OPTS)];
    if (vote) writes.push(client.set(`votes/${voterId}`, { ...vote, ignored: next }, SET_OPTS));
    void Promise.all(writes).catch((e) => console.warn("[rankzap] failed to toggle ignored:", e));
  };
  const deleteVote = () => {
    setConfirmingDelete(false);
    void client.delete(`votes/${voterId}`).catch((e) => console.warn("[rankzap] failed to delete voter's vote:", e));
  };

  const link = "min-h-11 font-bold underline underline-offset-4 hover:no-underline";
  return (
    <div className="mt-3 bg-[#f1efe8] px-3.5 py-3 text-[#0b0b0b]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 text-[13px]">
        <span className="font-extrabold">
          {name}
          {isIgnored ? " · ignored" : ""}
        </span>
        <span className="flex flex-wrap items-center gap-x-3">
          {user && (
            <button type="button" onClick={toggleIgnored} className={link}>
              {isIgnored ? "Count vote again" : "Ignore vote"}
            </button>
          )}
          {hasVote &&
            (confirmingDelete ? (
              <>
                <button type="button" onClick={() => setConfirmingDelete(false)} className={link}>
                  Cancel
                </button>
                <button type="button" onClick={deleteVote} className={`${link} text-danger`}>
                  Yes, delete vote
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} className={link}>
                Delete vote
              </button>
            ))}
          <button type="button" onClick={onClose} className={link}>
            Close
          </button>
        </span>
      </div>
      <VoterRankingPanel voterName={name} ranking={vote?.ranking} optionById={poll.optionById} />
    </div>
  );
}
