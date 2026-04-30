import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  RoomProvider,
  SET_OPTS,
  touchKey,
  useRoom,
  useRoomList,
  useRoomValue,
} from "../lib/room";
import {
  DEFAULT_META,
  DEFAULT_SETTINGS,
  type Option,
  type TallyMode,
  type UserMode,
} from "../lib/types";
import { getOrCreateVoterIdentity } from "../lib/identity";
import { getVoterRank, getVoterTally, setVoterRank, setVoterTally } from "../lib/storage";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { Username } from "../components/Username";
import { UsersList } from "../components/UsersList";
import { PollTitle } from "../components/PollTitle";
import { Tabs, type TabDef } from "../components/Tabs";
import { ArrangeOptions } from "../components/ArrangeOptions";
import { AddOption } from "../components/AddOption";
import { SubmitVote } from "../components/SubmitVote";
import { LiveOptions } from "../components/LiveOptions";
import { TallyModeSelector } from "../components/TallyModeSelector";
import { PollState } from "../components/PollState";

type VoterTab = "vote" | "results";

export function VoterPage() {
  const { roomId = "" } = useParams<{ roomId: string }>();
  // Hoisted above RoomProvider so userId reaches the WS handshake (and the
  // server-side presence/{connId} entry).
  const identity = useMemo(() => getOrCreateVoterIdentity(), []);
  if (!roomId) return null;

  return (
    <RoomProvider roomId={roomId} userId={identity.userId}>
      <ConnectionStatus />
      <VoterLayout roomId={roomId} identity={identity} />
    </RoomProvider>
  );
}

// Mulberry32 PRNG seeded with a string hash → stable per-user shuffle.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  let state = seed || 1;
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function VoterLayout({
  roomId,
  identity,
}: {
  roomId: string;
  identity: { userId: string; name: string };
}) {
  const { client, status } = useRoom();
  const [name, setName] = useState(identity.name);

  const { value: storedMeta } = useRoomValue("meta");
  const { value: storedSettings } = useRoomValue("settings");
  const optionsMap = useRoomList("options/");
  const votesMap = useRoomList("votes/");

  const ready = storedMeta !== undefined && status === "ready";
  const isMissing = status === "ready" && storedMeta === undefined;

  const settings = storedSettings ?? DEFAULT_SETTINGS();
  const meta = storedMeta ?? DEFAULT_META();

  const options = useMemo<Option[]>(
    () => [...optionsMap.values()].sort((a, b) => a.addedAt - b.addedAt),
    [optionsMap],
  );

  const myVote = useMemo(
    () => votesMap.get(`votes/${identity.userId}`) ?? null,
    [votesMap, identity.userId],
  );

  const hasVoted = !!myVote;

  // ── Local ranking state (per-room, persisted) ─────────────────────────────
  const [ranking, setRanking] = useState<string[]>(() => {
    const stored = getVoterRank(roomId);
    if (stored && stored.length > 0) return stored;
    return [];
  });

  // Initialize from shuffle once options arrive (if we have no stored ranking).
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (options.length === 0) return;
    const stored = getVoterRank(roomId);
    if (stored && stored.length > 0) {
      const known = new Set(options.map((o) => o.id));
      const cleaned = stored.filter((id) => known.has(id));
      const missing = options.filter((o) => !cleaned.includes(o.id)).map((o) => o.id);
      setRanking([...cleaned, ...missing]);
    } else {
      const seed = hashString(`${roomId}:${identity.userId}`);
      setRanking(seededShuffle(options.map((o) => o.id), seed));
    }
    initializedRef.current = true;
  }, [options, roomId, identity.userId]);

  const updateRanking = useCallback(
    (next: string[]) => {
      setRanking(next);
      setVoterRank(roomId, next);
    },
    [roomId],
  );

  // ── Drag state (for deferring tab switches) ───────────────────────────────
  const [isDragging, setIsDragging] = useState(false);

  // ── Local tally mode override ─────────────────────────────────────────────
  const [tallyMode, setTallyMode] = useState<TallyMode>(
    () => getVoterTally(roomId) ?? settings.tallyMode,
  );
  // When global default changes and user hasn't picked one explicitly, follow it.
  useEffect(() => {
    if (!getVoterTally(roomId)) setTallyMode(settings.tallyMode);
  }, [settings.tallyMode, roomId]);

  const onTallyModeChange = (m: TallyMode) => {
    setTallyMode(m);
    setVoterTally(roomId, m);
  };

  // ── Tab state with auto-switch ────────────────────────────────────────────
  const voteDisabled = meta.state === "closed" || (!settings.allowRevote && hasVoted);
  const resultsDisabled = !settings.showLiveResults && meta.state === "open";

  const initialTab: VoterTab = voteDisabled ? "results" : "vote";
  const [tab, setTab] = useState<VoterTab>(initialTab);

  useEffect(() => {
    if (isDragging) return; // defer if mid-drag
    if (tab === "vote" && voteDisabled) {
      if (!resultsDisabled) setTab("results");
    } else if (tab === "results" && resultsDisabled) {
      if (!voteDisabled) setTab("vote");
    }
  }, [tab, voteDisabled, resultsDisabled, isDragging]);

  const bothDisabled = voteDisabled && resultsDisabled;

  // ── Identity / mode → users/{userId} ─────────────────────────────────────
  // No more heartbeat: room-server's presence/{connId} (auto-managed by the
  // server based on WS lifetime) answers "is this socket alive?". We only
  // need users/{userId} to record persistent identity (name) and current mode
  // (which tab the voter is on), so we write only when those change.
  const mode: UserMode =
    tab === "vote" && !voteDisabled && meta.state === "open" ? "voting" : "idle";

  // Touch meta on connect (refresh TTL).
  useEffect(() => {
    if (status !== "ready") return;
    void touchKey(client, "meta");
  }, [client, status]);

  // Write users/{userId} on first ready and whenever name/mode changes.
  useEffect(() => {
    if (status !== "ready") return;
    void client
      .set(
        `users/${identity.userId}`,
        { id: identity.userId, name, mode },
        SET_OPTS,
      )
      .catch((e) => console.warn("[voter] failed to update user record:", e));
  }, [client, status, identity.userId, name, mode]);

  // Best-effort cleanup on tab close. Browsers won't await async work in
  // beforeunload, but flushAndDisconnect schedules a tight drain anyway.
  useEffect(() => {
    const onUnload = () => {
      try {
        void client.flushAndDisconnect(500);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [client]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isMissing) {
    return <ExpiredPanel />;
  }

  if (!ready) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:py-8">
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
          Loading poll…
        </div>
      </main>
    );
  }

  const tabs: readonly TabDef<VoterTab>[] = [
    {
      id: "vote",
      label: hasVoted ? "Your vote" : "Vote",
      disabled: voteDisabled,
      hint:
        meta.state === "closed"
          ? "Poll is closed."
          : !settings.allowRevote && hasVoted
            ? "You've already voted; revoting is disabled."
            : undefined,
    },
    {
      id: "results",
      label: "Results",
      disabled: resultsDisabled,
      hint: resultsDisabled ? "Live results are disabled until the poll closes." : undefined,
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 pb-16 sm:py-8">
      <Username name={name} onCommit={setName} />

      {settings.showUsers ? <UsersList selfUserId={identity.userId} /> : null}

      <PollTitle editable={false} />

      {bothDisabled ? (
        <VotedFallback ranking={myVote?.ranking ?? ranking} options={options} />
      ) : (
        <>
          <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id)} />

          {tab === "vote" ? (
            <section aria-label="Rank options" className="flex flex-col gap-3">
              <ArrangeOptions
                options={options}
                ranking={ranking}
                onChange={updateRanking}
                onDragStateChange={setIsDragging}
              />
              {settings.allowAdd ? <AddOption addedBy={identity.userId} /> : null}
              <SubmitVote
                userId={identity.userId}
                ranking={ranking}
                hasVoted={hasVoted}
                disabled={voteDisabled}
                disabledReason={
                  voteDisabled
                    ? meta.state === "closed"
                      ? "Poll is closed."
                      : "You've already voted."
                    : undefined
                }
                onSubmitted={() => {
                  if (!resultsDisabled) setTab("results");
                }}
              />
            </section>
          ) : (
            <section aria-label="Results" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight text-muted">
                  Live results
                </h2>
                <TallyModeSelector value={tallyMode} onChange={onTallyModeChange} />
              </div>
              <LiveOptions
                removable={false}
                showResults
                tallyMode={tallyMode}
              />
            </section>
          )}
        </>
      )}

      <section aria-label="Poll state" className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">Poll status</span>
        <PollState controllable={false} />
      </section>
    </main>
  );
}

function ExpiredPanel() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">This poll doesn't exist or has expired.</h1>
      <p className="text-sm text-muted">
        Ask the admin for a fresh link, or create your own poll from the homepage.
      </p>
      <a
        href="#/"
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
      >
        Create a poll
      </a>
    </main>
  );
}

function VotedFallback({
  ranking,
  options,
}: {
  ranking: string[];
  options: Option[];
}) {
  const optById = new Map(options.map((o) => [o.id, o]));
  const cleaned = ranking.filter((id) => optById.has(id));
  return (
    <section
      aria-label="Vote submitted"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-base font-semibold">You've voted.</h2>
      <p className="mt-1 text-sm text-muted">
        Results will appear when the poll closes.
      </p>
      {cleaned.length > 0 ? (
        <>
          <h3 className="mt-4 text-xs font-semibold tracking-tight text-muted">
            Your submitted ranking
          </h3>
          <ol className="mt-2 flex flex-col gap-1.5">
            {cleaned.map((id, i) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold tabular-nums">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {optById.get(id)?.text ?? "(removed)"}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
