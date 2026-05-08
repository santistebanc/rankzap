import { Activity, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  RoomProvider,
  SET_OPTS,
  touchKey,
  useRoom,
  useRoomList,
  useRoomValue,
} from "../lib/room";
import {
  clampTitle,
  DEFAULT_META,
  DEFAULT_SETTINGS,
  clampOption,
  type Option,

  type UserMode,
} from "../lib/types";
import { House } from "lucide-react";
import { nanoid } from "nanoid";
import { fallbackVoterName, getOrCreateVoterIdentity } from "../lib/identity";
import {
  getVoterRank,
  setVoterRank,
} from "../lib/storage";
import { ShareBar } from "../components/ShareLink";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { Username } from "../components/Username";
import { UsersList } from "../components/UsersList";
import { ArrangeOptions } from "../components/ArrangeOptions";
import { AddOption } from "../components/AddOption";
import { SubmitVote } from "../components/SubmitVote";
import { LiveOptions } from "../components/LiveOptions";
import { Settings as SettingsPanel } from "../components/Settings";
import { VoterRankingPanel } from "../components/VoterRankingPanel";
import { Tabs } from "../components/Tabs";
import { AccordionSection } from "../components/AccordionSection";

interface LayoutProps {
  isAdmin: boolean;
}

export function Layout({ isAdmin }: LayoutProps) {
  const { roomId = "" } = useParams<{ roomId: string }>();
  
  // For voter, get identity before RoomProvider
  const identity = useMemo(() => isAdmin ? null : getOrCreateVoterIdentity(), [isAdmin]);
  
  if (!roomId) return null;

  return (
    <RoomProvider
      key={roomId}
      roomId={roomId}
      userId={isAdmin ? undefined : identity?.userId}
    >
      <ConnectionStatus />
      <LayoutContent roomId={roomId} identity={identity} isAdmin={isAdmin} />
    </RoomProvider>
  );
}

interface LayoutContentProps {
  roomId: string;
  identity: { userId: string; name: string } | null;
  isAdmin: boolean;
}

type VoterView = "compose" | "results";

function LayoutContent({ roomId, identity, isAdmin }: LayoutContentProps) {
  const { client, status } = useRoom();
  const navigate = useNavigate();
  
  // Shared state hooks (always called)
  const { value: storedMeta } = useRoomValue("meta");
  const { value: storedSettings } = useRoomValue("settings");
  const optionsMap = useRoomList("options/");
  const votesMap = useRoomList("votes/");
  const usersMap = useRoomList("users/");
  const presenceMap = useRoomList("presence/");

  const ready = storedMeta !== undefined && status === "ready";
  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS(), ...(storedSettings ?? {}) }),
    [storedSettings],
  );
  const meta = storedMeta ?? DEFAULT_META();

  const pollHeading = useMemo(() => {
    const fromSettings = clampTitle(settings.ballotTitle ?? "").trim();
    if (fromSettings) return fromSettings;
    return clampTitle(meta.title ?? "").trim() || "Rank the options";
  }, [settings.ballotTitle, meta.title]);

  // Voter state hooks (conditionally used but always called)
  const [name, setName] = useState(identity?.name ?? "");
  const [selectedVoterId, setSelectedVoterId] = useState<string | null>(null);
  
  // Voter-specific state with lazy initialization
  const [ranking, setRanking] = useState<string[]>(() => {
    const stored = getVoterRank(roomId);
    if (stored && stored.length > 0) return stored;
    return [];
  });
  const [shouldRandomizeFirstVote, setShouldRandomizeFirstVote] = useState(() => {
    const stored = getVoterRank(roomId);
    return !stored || stored.length === 0;
  });
  
  const pollTitleInputRef = useRef<HTMLInputElement>(null);
  /** While a title write is in flight, avoid syncing draft from stale `committedPollTitle`. */
  const pendingPollTitleRef = useRef<string | null>(null);
  const committedPollTitle = clampTitle(settings.ballotTitle ?? "");
  const [pollTitleDraft, setPollTitleDraft] = useState(committedPollTitle);
  const [isPollTitleFocused, setIsPollTitleFocused] = useState(false);
  const [voterView, setVoterView] = useState<VoterView>("results");
  const pollWasClosedRef = useRef(false);
  const [pendingAddedOptions, setPendingAddedOptions] = useState<Option[]>([]);
  const [confirmingAction, setConfirmingAction] = useState<"close" | "reset" | "deleteVote" | null>(null);

  // Computed values from shared state
  const options = useMemo<Option[]>(
    () => [...optionsMap.values()].sort((a, b) => a.addedAt - b.addedAt),
    [optionsMap],
  );
  const voterVisibleOptions = useMemo<Option[]>(() => {
    if (isAdmin) return options;
    return [...options, ...pendingAddedOptions].sort((a, b) => a.addedAt - b.addedAt);
  }, [isAdmin, options, pendingAddedOptions]);

  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const onlineUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const info of presenceMap.values()) {
      if (info?.userId) set.add(info.userId);
    }
    return set;
  }, [presenceMap]);
  const votedUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const [key, vote] of votesMap.entries()) {
      if (!key.startsWith("votes/")) continue;
      if (vote?.ranking?.length) set.add(key.replace(/^votes\//, ""));
    }
    return set;
  }, [votesMap]);
  const hasAnyVotersForAdmin = useMemo(() => {
    for (const user of usersMap.values()) {
      if (onlineUserIds.has(user.id) || votedUserIds.has(user.id)) return true;
    }
    const inMap = new Set([...usersMap.values()].map((u) => u.id));
    for (const uid of onlineUserIds) {
      if (!inMap.has(uid)) return true;
    }
    for (const uid of votedUserIds) {
      if (!inMap.has(uid)) return true;
    }
    return false;
  }, [onlineUserIds, usersMap, votedUserIds]);
  const hasAnyOtherVoters = useMemo(() => {
    const self = identity?.userId;
    for (const user of usersMap.values()) {
      if (user.id === self) continue;
      if (onlineUserIds.has(user.id) || votedUserIds.has(user.id)) return true;
    }
    const inMap = new Set([...usersMap.values()].map((u) => u.id));
    for (const uid of onlineUserIds) {
      if (uid === self || inMap.has(uid)) continue;
      return true;
    }
    for (const uid of votedUserIds) {
      if (uid === self || inMap.has(uid)) continue;
      return true;
    }
    return false;
  }, [identity?.userId, onlineUserIds, usersMap, votedUserIds]);

  const myVote = useMemo(
    () => votesMap.get(`votes/${identity?.userId}`) ?? null,
    [votesMap, identity?.userId],
  );

  const hasVoted = Boolean(myVote?.ranking?.length);
  const hasSubmittedAnyVote = Boolean(myVote?.submittedAt);
  const hasPendingOptionAdds = pendingAddedOptions.length > 0;
  const rankingChanged = hasVoted
    ? !sameRanking(ranking, myVote?.ranking ?? [])
    : ranking.length > 0;
  const canSubmitVote = rankingChanged || hasPendingOptionAdds;

  // Memoized callbacks
  const updateRanking = useCallback((next: string[]) => {
    setRanking(next);
    setVoterRank(roomId, next);
  }, [roomId]);


  const toggleVoterSelection = useCallback((userId: string) => {
    setSelectedVoterId((prev) => (prev === userId ? null : userId));
  }, []);

  const clearVoterSelection = useCallback(() => {
    setSelectedVoterId(null);
  }, []);

  // Admin actions
  const togglePollState = useCallback(async () => {
    try {
      await client.set("meta", { ...meta, state: meta.state === "open" ? "closed" : "open" }, SET_OPTS);
    } catch (e) {
      console.warn("[rankzap] failed to toggle poll state:", e);
    }
  }, [client, meta]);

  const resetVotes = useCallback(async () => {
    try {
      await client.deletePrefix("votes/");
    } catch (e) {
      console.warn("[rankzap] failed to reset votes:", e);
    }
  }, [client]);

  const commitPollTitle = useCallback(() => {
    const next = clampTitle(pollTitleDraft);
    if (next !== committedPollTitle) {
      pendingPollTitleRef.current = next;
      setPollTitleDraft(next);
      void client
        .set("settings", { ...settings, ballotTitle: next }, SET_OPTS)
        .catch((e) => {
          console.warn("[rankzap] failed to update poll title:", e);
          pendingPollTitleRef.current = null;
        });
    } else {
      pendingPollTitleRef.current = null;
      setPollTitleDraft(committedPollTitle);
    }
  }, [pollTitleDraft, client, committedPollTitle, settings]);

  const stageVoterOptions = useCallback(
    (texts: string[]) => {
      if (isAdmin) return;
      const now = Date.now();
      const next = texts
        .map((text) => clampOption(text))
        .filter((text): text is string => Boolean(text))
        .map((text, index) => ({
          id: nanoid(10),
          text,
          addedBy: identity?.userId ?? "",
          addedAt: now + index,
        }));
      if (next.length === 0) return;
      setPendingAddedOptions((prev) => [...prev, ...next]);
    },
    [identity?.userId, isAdmin],
  );

  const persistPendingAddedOptions = useCallback(async () => {
    if (isAdmin || pendingAddedOptions.length === 0) return;
    for (const option of pendingAddedOptions) {
      await client.set(`options/${option.id}`, option, SET_OPTS);
    }
  }, [client, isAdmin, pendingAddedOptions]);

  // Touch meta on connect (refresh TTL).
  useEffect(() => {
    if (status !== "ready") return;
    void touchKey(client, "meta");
    void touchKey(client, "settings");
  }, [client, status]);

  // Write user record when name/view changes.
  // "voting" means actively editing in compose view while poll is open.
  // After submit (results view), mode becomes "idle" so voted users show as voted.
  const mode: UserMode =
    meta.state === "open" && voterView === "compose" ? "voting" : "idle";
  useEffect(() => {
    if (!identity) return;
    if (status !== "ready") return;
    const displayName = name.trim() || fallbackVoterName(identity.userId);
    const existingIgnored = usersMap.get(`users/${identity.userId}`)?.ignored ?? false;
    const existingUser = usersMap.get(`users/${identity.userId}`);
    if (
      existingUser &&
      existingUser.id === identity.userId &&
      existingUser.name === displayName &&
      existingUser.mode === mode &&
      Boolean(existingUser.ignored) === Boolean(existingIgnored)
    ) {
      return;
    }
    void client
      .set(
        `users/${identity.userId}`,
        { id: identity.userId, name: displayName, mode, ignored: existingIgnored },
        SET_OPTS,
      )
      .catch((e) => console.warn("[rankzap] failed to update user record:", e));
  }, [client, status, identity, name, mode, usersMap]);

  useEffect(() => {
    if (!isAdmin && !settings.showUsers) setSelectedVoterId(null);
  }, [isAdmin, settings.showUsers]);
  useEffect(() => {
    if (!isAdmin && !settings.showVoterVotes) setSelectedVoterId(null);
  }, [isAdmin, settings.showVoterVotes]);
  useEffect(() => {
    setConfirmingAction((a) => (a === "deleteVote" ? null : a));
  }, [selectedVoterId]);

  useEffect(() => {
    if (isAdmin) return;
    if (meta.state === "closed") {
      setVoterView("results");
      pollWasClosedRef.current = true;
      return;
    }
    const wasClosed = pollWasClosedRef.current;
    pollWasClosedRef.current = false;
    if (wasClosed && !hasVoted) {
      return;
    }
    if (!hasVoted) {
      setVoterView("compose");
    }
  }, [hasVoted, isAdmin, meta.state]);

  useEffect(() => {
    if (!isAdmin) return;
    if (pendingAddedOptions.length > 0) setPendingAddedOptions([]);
  }, [isAdmin, pendingAddedOptions.length]);

  useEffect(() => {
    if (!isAdmin || isPollTitleFocused) return;
    if (pendingPollTitleRef.current !== null) {
      if (committedPollTitle === pendingPollTitleRef.current) {
        pendingPollTitleRef.current = null;
      } else {
        return;
      }
    }
    setPollTitleDraft(committedPollTitle);
  }, [committedPollTitle, isPollTitleFocused, isAdmin]);

  useEffect(() => {
    if (isAdmin || !hasSubmittedAnyVote || !shouldRandomizeFirstVote) return;
    const submittedRanking = myVote?.ranking ?? [];
    if (submittedRanking.length === 0) {
      setShouldRandomizeFirstVote(false);
      return;
    }
    const known = new Set(voterVisibleOptions.map((o) => o.id));
    const cleaned = submittedRanking.filter((id) => known.has(id));
    const missing = voterVisibleOptions
      .map((o) => o.id)
      .filter((id) => !cleaned.includes(id));
    updateRanking([...cleaned, ...missing]);
    setShouldRandomizeFirstVote(false);
  }, [
    hasSubmittedAnyVote,
    isAdmin,
    myVote?.ranking,
    shouldRandomizeFirstVote,
    updateRanking,
    voterVisibleOptions,
  ]);

  useEffect(() => {
    if (isAdmin || hasSubmittedAnyVote || !shouldRandomizeFirstVote) return;
    if (options.length === 0) return;
    const canonicalIds = options.map((o) => o.id);
    const rankingLooksUntouched =
      ranking.length === 0 || sameRanking(ranking, canonicalIds);
    if (!rankingLooksUntouched) {
      // User already arranged manually before auto-randomization ran.
      setShouldRandomizeFirstVote(false);
      return;
    }
    updateRanking(shuffleIds(canonicalIds));
    setShouldRandomizeFirstVote(false);
  }, [
    hasSubmittedAnyVote,
    isAdmin,
    options,
    ranking,
    shouldRandomizeFirstVote,
    updateRanking,
  ]);

  useEffect(() => {
    const fromSettings = clampTitle(settings.ballotTitle ?? "").trim();
    const fromMeta = clampTitle(meta.title ?? "").trim();
    document.title = fromSettings || fromMeta || "Rankzap";
  }, [settings.ballotTitle, meta.title]);

  // Skeleton until meta loads
  if (!ready) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center gap-4 px-3 py-3 pb-[max(3rem,env(safe-area-inset-bottom,0px))] sm:gap-5 sm:px-4 sm:py-6">
        <p className="py-12 text-center text-sm text-muted">Loading poll…</p>
      </main>
    );
  }

  const scoreboardSection = (
    <section className="flex flex-col gap-4" aria-label="Poll">
      <div className="overflow-hidden rounded-xl bg-surface shadow-card">
        <input
          ref={pollTitleInputRef}
          id="poll-title"
          type="text"
          maxLength={100}
          value={pollTitleDraft}
          placeholder="Poll title"
          onChange={(e) => setPollTitleDraft(e.target.value)}
          onFocus={() => setIsPollTitleFocused(true)}
          onBlur={() => { setIsPollTitleFocused(false); commitPollTitle(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); pollTitleInputRef.current?.blur(); }
            if (e.key === "Escape") {
              pendingPollTitleRef.current = null;
              setPollTitleDraft(committedPollTitle);
              pollTitleInputRef.current?.blur();
            }
          }}
          aria-label="Poll title"
          style={{ fontSize: adaptiveSize(pollTitleDraft, 15, 24, 8, 70) }}
          className="w-full border-b border-border/20 bg-transparent px-4 py-3 font-semibold outline-none placeholder:text-muted/40 transition-[font-size,colors] duration-150 hover:bg-surface-2/30 focus:bg-surface-2/30"
        />
        <LiveOptions removable showResults tallyMode={settings.tallyMode} editable />
        <AddOption addedBy="admin" />
      </div>

      {hasAnyVotersForAdmin ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted">Voters</span>
          <UsersList
            selfUserId={identity?.userId}
            showIgnoredBadge
            variant="tabStrip"
            selectedVoterId={selectedVoterId}
            onToggleVoter={toggleVoterSelection}
            onInvalidateVoterSelection={clearVoterSelection}
          />
          <Activity mode={selectedVoterId ? "visible" : "hidden"}>
            <div
              className="px-1 py-2"
              inert={!selectedVoterId ? true : undefined}
            >
                {(() => {
                  if (!selectedVoterId) return null;
                  const selectedVote = votesMap.get(`votes/${selectedVoterId}`);
                  const hasSelectedVote = Boolean(selectedVote?.ranking?.length);
                  const selectedUser = usersMap.get(`users/${selectedVoterId}`);
                  const isIgnored = Boolean(selectedUser?.ignored || selectedVote?.ignored);
                  return (
                    <>
                      <VoterRankingPanel
                        voterName={usersMap.get(`users/${selectedVoterId}`)?.name || "Voter"}
                        ranking={selectedVote?.ranking}
                        optionById={optionById}
                      />
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedUser) return;
                            const nextIgnored = !isIgnored;
                            const writes = [
                              client.set(`users/${selectedVoterId}`, { ...selectedUser, ignored: nextIgnored }, SET_OPTS),
                            ];
                            if (selectedVote) {
                              writes.push(client.set(`votes/${selectedVoterId}`, { ...selectedVote, ignored: nextIgnored }, SET_OPTS));
                            }
                            void Promise.all(writes).catch((e) => console.warn("[rankzap] failed to toggle ignored:", e));
                          }}
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2"
                        >
                          {isIgnored ? "Unignore vote" : "Ignore vote"}
                        </button>
                        {hasSelectedVote ? (
                          confirmingAction === "deleteVote" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmingAction(null)}
                                className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmingAction(null);
                                  void client.delete(`votes/${selectedVoterId}`)
                                    .catch((e) => console.warn("[rankzap] failed to delete voter's vote:", e));
                                }}
                                className="inline-flex min-h-11 items-center justify-center rounded-full bg-danger px-4 text-sm font-semibold text-white hover:brightness-95"
                              >
                                Confirm delete
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingAction("deleteVote")}
                              className="inline-flex min-h-11 items-center justify-center rounded-full border border-danger/25 bg-danger-soft px-4 text-sm font-semibold text-danger hover:brightness-98"
                            >
                              Delete vote
                            </button>
                          )
                        ) : null}
                      </div>
                    </>
                  );
                })()}
            </div>
          </Activity>
        </div>
      ) : null}
    </section>
  );

  const shareSection = isAdmin ? <ShareBar roomId={roomId} /> : null;

  const settingsSection = isAdmin ? (
    <AccordionSection title="Settings" noPadding>
      <SettingsPanel />
    </AccordionSection>
  ) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center gap-4 px-3 py-3 pb-[max(3rem,env(safe-area-inset-bottom,0px))] sm:gap-5 sm:px-4 sm:py-6">
      {isAdmin ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text shadow-card hover:bg-surface-2"
            aria-label="Go to home"
            title="Home"
          >
            <House className="size-4" aria-hidden />
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(votedUserIds.size > 0 || meta.state === "closed") && (
              meta.state === "open" && confirmingAction === "close" ? (
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-xs text-muted">Close poll?</span>
                  <button type="button" onClick={() => setConfirmingAction(null)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2">Cancel</button>
                  <button type="button" onClick={() => { setConfirmingAction(null); void togglePollState(); }} className="inline-flex min-h-11 items-center justify-center rounded-full bg-danger px-4 text-sm font-semibold text-white hover:brightness-95">Confirm</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={meta.state === "open" ? () => setConfirmingAction("close") : () => void togglePollState()}
                  className={`inline-flex min-h-11 min-w-[100px] items-center justify-center rounded-full px-4 text-sm font-semibold ${
                    meta.state === "open" ? "border border-border bg-surface text-text shadow-card hover:bg-surface-2" : "bg-success text-white"
                  }`}
                >
                  {meta.state === "open" ? "Close poll" : "Reopen poll"}
                </button>
              )
            )}
            {votedUserIds.size > 0 && (
              confirmingAction === "reset" ? (
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-xs text-muted">Reset all votes?</span>
                  <button type="button" onClick={() => setConfirmingAction(null)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2">Cancel</button>
                  <button type="button" onClick={() => { setConfirmingAction(null); void resetVotes(); }} className="inline-flex min-h-11 items-center justify-center rounded-full bg-danger px-4 text-sm font-semibold text-white hover:brightness-95">Confirm</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmingAction("reset")} className="inline-flex min-h-11 min-w-[100px] items-center justify-center rounded-full border border-danger/25 bg-danger-soft px-4 text-sm font-semibold text-danger hover:brightness-98">
                  Reset votes
                </button>
              )
            )}
          </div>
        </div>
      ) : null}

      {isAdmin ? scoreboardSection : null}
      {shareSection}
      {settingsSection}

      {!isAdmin ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text shadow-card hover:bg-surface-2"
              aria-label="Go to home"
              title="Home"
            >
              <House className="size-4" aria-hidden />
            </button>
            <div className="flex min-w-0 justify-end">
              <Tabs<VoterView>
                tabs={[
                  {
                    id: "compose",
                    label: "Your Vote",
                    disabled: meta.state === "closed",
                    hint: meta.state === "closed" ? "Poll is closed." : undefined,
                  },
                  { id: "results", label: "Results" },
                ]}
                active={voterView}
                onChange={setVoterView}
              />
            </div>
          </div>
          <div>
            <Activity mode={voterView === "compose" ? "visible" : "hidden"}>
              <div className="flex flex-col gap-4" inert={voterView !== "compose" ? true : undefined}>
                {meta.state === "closed" ? (
                  <div className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-muted shadow-card">
                    Poll is closed.
                  </div>
                ) : null}
                <div className="overflow-hidden rounded-xl bg-surface shadow-card">
                  <div className="border-b border-border/20 px-4 py-3">
                    <h3 style={{ fontSize: adaptiveSize(pollHeading, 15, 24, 8, 70) }} className="font-semibold tracking-tight">{pollHeading}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {!settings.allowRevote && hasVoted
                        ? "Your ranking can't be changed — vote updates aren't allowed."
                        : "Drag items to rank by preference."}
                    </p>
                  </div>
                  <ArrangeOptions
                    options={voterVisibleOptions}
                    ranking={ranking}
                    onChange={updateRanking}
                    reorderingDisabled={!settings.allowRevote && hasVoted}
                  />
                  {settings.allowAdd ? (
                    <AddOption addedBy={identity?.userId ?? ""} onAddOption={stageVoterOptions} />
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  {identity ? (
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs font-semibold text-muted">Your name</span>
                      <Username name={name} onCommit={setName} />
                    </div>
                  ) : null}
                  <SubmitVote
                    userId={identity?.userId ?? ""}
                    ranking={ranking}
                    hasVoted={hasVoted}
                    disabled={
                      meta.state === "closed" ||
                      (!settings.allowRevote && hasVoted) ||
                      !canSubmitVote
                    }
                    disabledReason={
                      meta.state === "closed"
                        ? "Poll is closed."
                        : !settings.allowRevote && hasVoted
                          ? "Revoting is disabled."
                          : !canSubmitVote
                            ? "No changes to submit yet."
                            : undefined
                    }
                    beforeSubmit={persistPendingAddedOptions}
                    onSubmitted={() => {
                      setPendingAddedOptions([]);
                      setVoterView("results");
                    }}
                  />
                </div>
              </div>
            </Activity>
            <Activity mode={voterView === "results" ? "visible" : "hidden"}>
              <div className="flex flex-col gap-4" inert={voterView !== "results" ? true : undefined}>
                {meta.state === "closed" ? (
                  <div className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-muted shadow-card">
                    Poll is closed.
                  </div>
                ) : null}
                {settings.showLiveResults || meta.state === "closed" ? (
                  <div className="overflow-hidden rounded-xl bg-surface shadow-card">
                    <div className="border-b border-border/20 px-4 py-3">
                      <h3 style={{ fontSize: adaptiveSize(pollHeading, 15, 24, 8, 70) }} className="font-semibold tracking-tight">{pollHeading}</h3>
                      {meta.state === "closed" && !settings.showLiveResults ? (
                        <p className="mt-0.5 text-xs text-muted">Final results — the poll is closed.</p>
                      ) : null}
                    </div>
                    <LiveOptions removable={false} showResults tallyMode={settings.tallyMode} editable={false} optionsMap={optionsMap} votesMap={votesMap} usersMap={usersMap} />
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    {hasVoted
                      ? "Live rankings stay hidden until this poll closes. Your vote counts — full results will appear here then."
                      : "Live rankings stay hidden until this poll closes. Use the Your Vote tab to rank; full results will show here when it's over."}
                  </p>
                )}
              </div>
            </Activity>
          </div>
        </section>
      ) : null}
      {!isAdmin && settings.showUsers && hasAnyOtherVoters ? (
        <section className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Other voters</span>
          <UsersList
            selfUserId={identity?.userId}
            includeSelf={false}
            variant="tabStrip"
            selectedVoterId={selectedVoterId}
            onToggleVoter={toggleVoterSelection}
            onInvalidateVoterSelection={clearVoterSelection}
          />
          <Activity mode={settings.showVoterVotes && selectedVoterId ? "visible" : "hidden"}>
            <div
              className="border-t border-border/20 pt-3"
              inert={!(settings.showVoterVotes && selectedVoterId) ? true : undefined}
            >
              {settings.showVoterVotes && selectedVoterId ? (
                <VoterRankingPanel
                  voterName={usersMap.get(`users/${selectedVoterId}`)?.name || "Voter"}
                  ranking={votesMap.get(`votes/${selectedVoterId}`)?.ranking}
                  optionById={optionById}
                />
              ) : null}
            </div>
          </Activity>
        </section>
      ) : null}

    </main>
  );
}

function adaptiveSize(text: string, minPx: number, maxPx: number, minChars: number, maxChars: number): number {
  const len = text.length;
  if (len <= minChars) return maxPx;
  if (len >= maxChars) return minPx;
  const t = (len - minChars) / (maxChars - minChars);
  return maxPx + (minPx - maxPx) * t;
}

function sameRanking(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function shuffleIds(ids: string[]): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
