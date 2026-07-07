import { Activity, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { Settings, Share2, X } from "lucide-react";
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
import { adaptiveSize } from "../lib/adaptiveSize";
import { nanoid } from "nanoid";
import { fallbackVoterName, getOrCreateVoterIdentity } from "../lib/identity";
import {
  getVoterRank,
  setVoterRank,
} from "../lib/storage";
import { computeTally } from "../lib/tally";
import { ShareBar } from "../components/ShareLink";
import { Username } from "../components/Username";
import { UsersList } from "../components/UsersList";
import { ArrangeOptions } from "../components/ArrangeOptions";
import { AddOption } from "../components/AddOption";
import { SubmitVote } from "../components/SubmitVote";
import { LiveOptions } from "../components/LiveOptions";
import { Settings as SettingsPanel } from "../components/Settings";
import { VoterRankingPanel } from "../components/VoterRankingPanel";

interface LayoutProps {
  isAdmin: boolean;
}

export function Layout({ isAdmin }: LayoutProps) {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const upperId = roomId.toUpperCase();

  // For voter, get identity before RoomProvider (must be before any conditional return)
  const identity = useMemo(() => isAdmin ? null : getOrCreateVoterIdentity(), [isAdmin]);

  // Redirect lowercase/mixed-case URLs to canonical uppercase form
  if (roomId !== upperId) {
    return <Navigate to={isAdmin ? `/${upperId}/admin` : `/${upperId}`} replace />;
  }

  if (!roomId) return null;

  return (
    <RoomProvider
      key={roomId}
      roomId={roomId}
      userId={isAdmin ? undefined : identity?.userId}
    >
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
  const navigate = useNavigate();
  const { client, status } = useRoom();
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
  
  const pollTitleInputRef = useRef<HTMLTextAreaElement>(null);
  /** While a title write is in flight, avoid syncing draft from stale `committedPollTitle`. */
  const pendingPollTitleRef = useRef<string | null>(null);
  const committedPollTitle = clampTitle(settings.ballotTitle ?? "");
  const [pollTitleDraft, setPollTitleDraft] = useState(committedPollTitle);
  const [isPollTitleFocused, setIsPollTitleFocused] = useState(false);
  const [voterView, setVoterView] = useState<VoterView>("results");
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
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

  const cancelVoteEdit = useCallback(() => {
    const submittedRanking = myVote?.ranking ?? [];
    const known = new Set(voterVisibleOptions.map((o) => o.id));
    const cleaned = submittedRanking.filter((id) => known.has(id));
    const missing = voterVisibleOptions
      .map((o) => o.id)
      .filter((id) => !cleaned.includes(id));
    updateRanking([...cleaned, ...missing]);
    setPendingAddedOptions([]);
    setVoterView("results");
  }, [myVote?.ranking, updateRanking, voterVisibleOptions]);

  // Touch meta on connect (refresh TTL).
  useEffect(() => {
    if (status !== "ready") return;
    void touchKey(client, "meta");
    void touchKey(client, "settings");
  }, [client, status]);

  // "voting"  = first-time voter on compose tab (no prior submission)
  // "editing" = re-editing after submit with actual changes (submit button re-enabled)
  // "idle"    = everything else (results tab, or compose tab but nothing changed)
  const mode: UserMode = (() => {
    if (meta.state !== "open" || voterView !== "compose") return "idle";
    if (!hasSubmittedAnyVote) return "voting";
    if (canSubmitVote) return "editing";
    return "idle";
  })();
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

  useLayoutEffect(() => {
    if (!isAdmin) return;
    const resizeTitle = () => {
      const el = pollTitleInputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    resizeTitle();
    const raf = requestAnimationFrame(resizeTitle);
    window.addEventListener("resize", resizeTitle);
    const observer = new ResizeObserver(resizeTitle);
    if (pollTitleInputRef.current) observer.observe(pollTitleInputRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resizeTitle);
      observer.disconnect();
    };
  }, [isAdmin, pollTitleDraft]);

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

  // Tally for voter results winner announcement
  const tally = useMemo(() => {
    const activeVotes = [...votesMap.values()].filter((v) => {
      const u = usersMap.get(`users/${v.userId}`);
      return !u?.ignored && !v.ignored;
    });
    return computeTally({ options, votes: activeVotes, mode: settings.tallyMode });
  }, [options, votesMap, usersMap, settings.tallyMode]);
  const winner = tally.length > 0 ? optionById.get(tally[0].optionId) : undefined;

  // Skeleton until meta loads
  if (!ready) {
    const loadingLabel =
      status === "connecting"
        ? "Connecting..."
        : status === "reconnecting"
          ? "Reconnecting..."
          : status === "closed"
            ? "Disconnected"
            : "Loading poll...";

    return (
      <main className="flex min-h-dvh w-full items-center justify-center px-4 py-10">
        <p
          role="status"
          aria-live="polite"
          style={{ color: "var(--muted)", fontSize: "0.95rem", fontWeight: 600 }}
        >
          {loadingLabel}
        </p>
      </main>
    );
  }

  const votedCount = votedUserIds.size;

  // ─── ADMIN VIEW ───────────────────────────────────────────────
  if (isAdmin) {
    return (
      <main className="mx-auto w-full max-w-full sm:px-4 sm:py-10 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:max-w-[1180px]">
        <div className="card flex w-full min-h-dvh flex-col sm:min-h-0">
          <div className="card-content flex-1">

            <div className="content-inset" style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(true)}
                  aria-label="Open sharing options"
                  title="Share poll"
                  style={iconButton()}
                >
                  <Share2 size={18} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  aria-label="Open poll settings"
                  title="Settings"
                  style={iconButton()}
                >
                  <Settings size={18} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>

            {/* Poll question */}
            <div className="content-inset" style={{ marginBottom: "1rem" }}>
              <textarea
                ref={pollTitleInputRef}
                id="poll-title"
                maxLength={100}
                rows={1}
                wrap="soft"
                value={pollTitleDraft}
                placeholder="Poll title"
                onChange={(e) => {
                  setPollTitleDraft(e.target.value);
                  e.currentTarget.style.height = "auto";
                  e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                }}
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
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: adaptiveSize(pollTitleDraft, 22, 44, 8, 70),
                  fontWeight: 700,
                  color: "var(--text)",
                  background: isPollTitleFocused ? "var(--surface)" : "transparent",
                  border: "none",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "6px 0",
                  margin: 0,
                  borderRadius: 10,
                  lineHeight: 1.05,
                  display: "block",
                  minHeight: "1.2em",
                  overflow: "hidden",
                  overflowWrap: "break-word",
                  resize: "none",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  caretColor: "var(--accent)",
                  transition: "background-color 150ms",
                }}
              />
            </div>

            <div className="content-inset" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: "clamp(0.75rem,2vw,1rem)", flexWrap: "wrap" }}>
              <MonoLabel style={{ margin: 0 }}>poll options</MonoLabel>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {(votedCount > 0 || meta.state === "closed") && (
                  confirmingAction === "close" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Close poll?</span>
                      <button type="button" onClick={() => setConfirmingAction(null)} style={pill("secondary")}>Cancel</button>
                      <button type="button" onClick={() => { setConfirmingAction(null); void togglePollState(); }} style={pill("primary")}>Yes, close</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={meta.state === "open" ? () => setConfirmingAction("close") : () => void togglePollState()}
                      style={pill("default")}
                    >
                      {meta.state === "open" ? "Close poll" : "Reopen poll"}
                    </button>
                  )
                )}
                {votedCount > 0 && (
                  confirmingAction === "reset" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Reset all votes?</span>
                      <button type="button" onClick={() => setConfirmingAction(null)} style={pill("secondary")}>Cancel</button>
                      <button type="button" onClick={() => { setConfirmingAction(null); void resetVotes(); }} style={pill("primary")}>Yes, reset</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmingAction("reset")} style={pill("secondary")}>Reset votes</button>
                  )
                )}
              </div>
            </div>

            <div style={{ borderTop: "2px solid var(--text)", marginBottom: "clamp(0.5rem,1.5vw,0.75rem)" }}>
              <LiveOptions removable showResults tallyMode={settings.tallyMode} editable />
              <AddOption addedBy="admin" />
            </div>

            {hasAnyVotersForAdmin && (
              <div className="content-inset">
                <UsersList
                  selfUserId={identity?.userId}
                  showIgnoredBadge
                  variant="tabStrip"
                  selectedVoterId={selectedVoterId}
                  onToggleVoter={toggleVoterSelection}
                  onInvalidateVoterSelection={clearVoterSelection}
                />
                <Modal
                  open={Boolean(selectedVoterId)}
                  title={selectedVoterId ? usersMap.get(`users/${selectedVoterId}`)?.name || "Voter" : "Voter"}
                  onClose={clearVoterSelection}
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
                        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedUser) return;
                              const nextIgnored = !isIgnored;
                              const writes: Promise<unknown>[] = [
                                client.set(`users/${selectedVoterId}`, { ...selectedUser, ignored: nextIgnored }, SET_OPTS),
                              ];
                              if (selectedVote) {
                                writes.push(client.set(`votes/${selectedVoterId}`, { ...selectedVote, ignored: nextIgnored }, SET_OPTS));
                              }
                              void Promise.all(writes).catch((e) => console.warn("[rankzap] failed to toggle ignored:", e));
                            }}
                            style={pill("secondary")}
                          >
                            {isIgnored ? "Unignore vote" : "Ignore vote"}
                          </button>
                          {hasSelectedVote && (
                            confirmingAction === "deleteVote" ? (
                              <>
                                <button type="button" onClick={() => setConfirmingAction(null)} style={pill("secondary")}>Cancel</button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmingAction(null);
                                    void client.delete(`votes/${selectedVoterId}`)
                                      .catch((e) => console.warn("[rankzap] failed to delete voter's vote:", e));
                                  }}
                                  style={pill("primary")}
                                >
                                  Confirm delete
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={() => setConfirmingAction("deleteVote")} style={pill("secondary")}>
                                Delete vote
                              </button>
                            )
                          )}
                        </div>
                      </>
                    );
                  })()}
                </Modal>
              </div>
            )}

            <Modal
              open={isShareModalOpen}
              title="Share poll"
              onClose={() => setIsShareModalOpen(false)}
            >
              <ShareBar roomId={roomId} />
            </Modal>
            <Modal
              open={isSettingsModalOpen}
              title="Settings"
              onClose={() => setIsSettingsModalOpen(false)}
            >
              <SettingsPanel />
            </Modal>

          </div>
          <PoweredByFooter onCreatePoll={() => navigate("/")} />
        </div>
      </main>
    );
  }

  const canShowVoterResults = settings.showLiveResults || meta.state === "closed";
  const canChangeVote = meta.state === "open" && settings.allowRevote;

  // ─── VOTER VIEW ───────────────────────────────────────────────
  return (
    <main className="mx-auto w-full max-w-full sm:px-4 sm:py-10 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:max-w-5xl">
      <div className="card flex w-full min-h-dvh flex-col sm:min-h-0">
        <div className="card-content flex-1">

          {/* Poll heading */}
          <div className="content-inset" style={{ marginBottom: "clamp(1rem,3vw,1.5rem)" }}>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: adaptiveSize(pollHeading, 24, 48, 8, 70),
                fontWeight: 700,
                color: "var(--text)",
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
                margin: "6px 0 0",
              }}
            >
              {pollHeading}
            </h1>
          </div>

          <div>
            <Activity mode={voterView === "compose" ? "visible" : "hidden"}>
              <div
                aria-label="Your vote"
                inert={voterView !== "compose" ? true : undefined}
              >
                <div className="content-inset">
                {meta.state === "closed" && (
                  <div style={{ marginBottom: "1rem", display: "inline-block", borderRadius: 999, border: "1.5px solid var(--border)", padding: "6px 14px", fontSize: "0.83rem", color: "var(--muted)", fontWeight: 600 }}>
                    Poll is closed.
                  </div>
                )}
                <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1rem" }}>
                  Drag items so your{" "}
                  <strong style={{ background: "var(--surface)", padding: "0 6px", borderRadius: 5, fontWeight: 600, color: "var(--text)" }}>favorite</strong>{" "}
                  is on top.
                </p>
                </div>
                <div style={{ borderTop: "2px solid var(--text)", marginBottom: "clamp(1rem,3vw,1.5rem)" }}>
                  <ArrangeOptions
                    options={voterVisibleOptions}
                    ranking={ranking}
                    onChange={updateRanking}
                    reorderingDisabled={!settings.allowRevote && hasVoted}
                  />
                  {settings.allowAdd && (
                    <AddOption addedBy={identity?.userId ?? ""} onAddOption={stageVoterOptions} />
                  )}
                </div>
                <div className="content-inset" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
                  {identity && (
                    <div>
                      <MonoLabel style={{ marginBottom: 6 }}>your name</MonoLabel>
                      <Username name={name} onCommit={setName} placeholder={fallbackVoterName(identity.userId)} />
                    </div>
                  )}
                <div style={{ display: "flex", flex: "1 1 auto", alignItems: "flex-end", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
                  {hasSubmittedAnyVote ? (
                    <button type="button" onClick={cancelVoteEdit} style={textButton()}>
                      Cancel
                    </button>
                  ) : canShowVoterResults ? (
                    <button type="button" onClick={() => setVoterView("results")} style={textButton()}>
                      Skip
                    </button>
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
              </div>
            </Activity>

            <Activity mode={voterView === "results" ? "visible" : "hidden"}>
              <div
                aria-label={canShowVoterResults ? "Results" : "Vote confirmation"}
                inert={voterView !== "results" ? true : undefined}
              >
                {canShowVoterResults ? (
                  <>
                    {meta.state === "closed" && winner ? (
                      <div className="content-inset" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(1.2rem,4vw,1.4rem)", color: "var(--text)", marginBottom: "clamp(1rem,3vw,1.5rem)", lineHeight: 1.4, letterSpacing: "-0.01em" }}>
                        the group says{" "}
                        <span style={{ background: "var(--surface)", padding: "1px 8px", borderRadius: 6, fontWeight: 700 }}>
                          {winner.text}
                        </span>
                        {" "}wins.
                      </div>
                    ) : meta.state === "open" ? (
                      <div className="content-inset" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(1.2rem,4vw,1.4rem)", color: "var(--muted)", marginBottom: "clamp(1rem,3vw,1.5rem)", lineHeight: 1.4, letterSpacing: "-0.01em", opacity: 0.78 }}>
                        Poll is still open.
                      </div>
                    ) : null}
                    <div style={{ borderTop: "2px solid var(--text)" }}>
                      <LiveOptions
                        removable={false}
                        showResults
                        tallyMode={settings.tallyMode}
                        editable={false}
                        optionsMap={optionsMap}
                        votesMap={votesMap}
                        usersMap={usersMap}
                      />
                    </div>
                  </>
                ) : (
                  <div className="content-inset" style={{ borderTop: "2px solid var(--text)", paddingTop: "clamp(1rem,3vw,1.5rem)" }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.35rem,5vw,1.75rem)", fontWeight: 700, color: "var(--text)", lineHeight: 1.1, margin: 0 }}>
                      Vote sent
                    </h2>
                    <p style={{ fontSize: "0.95rem", color: "var(--muted)", lineHeight: 1.6, margin: "0.75rem 0 0" }}>
                      Your vote has been recorded. Results are hidden until the poll closes.
                    </p>
                  </div>
                )}
                {canChangeVote && (
                  <div className="content-inset" style={{ display: "flex", justifyContent: "flex-end", marginTop: "clamp(1rem,3vw,1.5rem)" }}>
                    <button type="button" onClick={() => setVoterView("compose")} style={pill("default")}>
                      Change vote
                    </button>
                  </div>
                )}
              </div>
            </Activity>

            {canShowVoterResults && settings.showUsers && hasAnyOtherVoters && (
              <div className="content-inset" style={{ marginTop: "clamp(0.75rem,2vw,1.25rem)" }}>
                <MonoLabel style={{ marginBottom: 8 }}>others have voted</MonoLabel>
                <UsersList
                  selfUserId={identity?.userId}
                  includeSelf={false}
                  variant="tabStrip"
                  selectedVoterId={selectedVoterId}
                  onToggleVoter={toggleVoterSelection}
                  onInvalidateVoterSelection={clearVoterSelection}
                />
                <Modal
                  open={Boolean(settings.showVoterVotes && selectedVoterId)}
                  title={selectedVoterId ? usersMap.get(`users/${selectedVoterId}`)?.name || "Voter" : "Voter"}
                  onClose={clearVoterSelection}
                >
                  {settings.showVoterVotes && selectedVoterId ? (
                    <VoterRankingPanel
                      voterName={usersMap.get(`users/${selectedVoterId}`)?.name || "Voter"}
                      ranking={votesMap.get(`votes/${selectedVoterId}`)?.ranking}
                      optionById={optionById}
                    />
                  ) : null}
                </Modal>
              </div>
            )}
          </div>

          {false && (
            <>
            {/* Left: your ranking */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <MonoLabel style={{ margin: 0 }}>your ranking</MonoLabel>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Drag your{" "}
                  <strong style={{ background: "var(--surface)", padding: "0 6px", borderRadius: 5, fontWeight: 600, color: "var(--text)" }}>favorite</strong>{" "}
                  to the top
                </span>
              </div>
              {meta.state === "closed" && (
                <div style={{ marginBottom: "1rem", display: "inline-block", borderRadius: 999, border: "1.5px solid var(--border)", padding: "6px 14px", fontSize: "0.83rem", color: "var(--muted)", fontWeight: 600 }}>
                  Poll is closed.
                </div>
              )}
              <div style={{ borderTop: "2px solid var(--text)", marginBottom: "1.5rem" }}>
                <ArrangeOptions
                  options={voterVisibleOptions}
                  ranking={ranking}
                  onChange={updateRanking}
                  reorderingDisabled={!settings.allowRevote && hasVoted}
                />
                {settings.allowAdd && (
                  <AddOption addedBy={identity?.userId ?? ""} onAddOption={stageVoterOptions} />
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
                {identity && (
                  <div>
                    <MonoLabel style={{ marginBottom: 6 }}>your name</MonoLabel>
                    <Username name={name} onCommit={setName} placeholder={fallbackVoterName(identity?.userId ?? "")} />
                  </div>
                )}
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
                        : undefined
                  }
                  beforeSubmit={persistPendingAddedOptions}
                  onSubmitted={() => setPendingAddedOptions([])}
                />
              </div>
            </div>

            {/* Right: live results */}
            <div>
              <MonoLabel style={{ marginBottom: 12 }}>live results</MonoLabel>
              {(settings.showLiveResults || meta.state === "closed") && winner && (
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--text)", marginBottom: "1rem", lineHeight: 1.4, letterSpacing: "-0.01em" }}>
                  the group says{" "}
                  <span style={{ background: "var(--surface)", padding: "1px 8px", borderRadius: 6, fontWeight: 700 }}>
                    {winner?.text}
                  </span>
                  {" "}wins.
                </div>
              )}
              {settings.showLiveResults || meta.state === "closed" ? (
                <div style={{ borderTop: "2px solid var(--text)" }}>
                  <LiveOptions
                    removable={false}
                    showResults
                    tallyMode={settings.tallyMode}
                    editable={false}
                    optionsMap={optionsMap}
                    votesMap={votesMap}
                    usersMap={usersMap}
                  />
                </div>
              ) : (
                <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.6 }}>
                  {hasVoted
                    ? "Live rankings are hidden until the poll closes. Your vote counts — full results will appear here then."
                    : "Live rankings are hidden until the poll closes. Rank on the left; results will show here when it's over."}
                </p>
              )}

              {settings.showUsers && hasAnyOtherVoters && (
                <div style={{ marginTop: "1.25rem" }}>
                  <MonoLabel style={{ marginBottom: 8 }}>others have voted</MonoLabel>
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
                      style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, marginTop: 8 }}
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
                </div>
              )}
            </div>
            </>
          )}

        </div>
        <PoweredByFooter onCreatePoll={() => navigate("/")} />
      </div>
    </main>
  );
}

// ─── Shared style helpers ──────────────────────────────────────────────────

type PillVariant = "default" | "primary" | "secondary";

function PoweredByFooter({ onCreatePoll }: { onCreatePoll: () => void }) {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-border bg-bg/95 px-5 py-3 backdrop-blur sm:px-8">
      <div className="mx-auto flex max-w-full items-center justify-between gap-3 text-xs text-muted lg:max-w-5xl">
        <div className="flex min-w-0 items-center gap-2">
          <span>powered by</span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-text">
            <svg width="12" height="14" viewBox="0 0 19 22" aria-hidden className="shrink-0">
              <path
                d="M11 1 L2 12.5 L8.5 12.5 L7.5 21 L17 8.5 L10.5 8.5 Z"
                fill="var(--text)"
              />
            </svg>
            rankzap
          </span>
        </div>
        <button
          type="button"
          onClick={onCreatePoll}
          className="shrink-0 border-0 bg-transparent p-0 text-xs font-semibold text-text underline decoration-border underline-offset-4 transition-opacity hover:opacity-65"
        >
          create your own poll
        </button>
      </div>
    </footer>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/55 p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`modal-${title.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={onClose}
    >
      <div
        className="max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-lg overflow-auto rounded-lg border border-border bg-surface p-5 shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2
            id={`modal-${title.toLowerCase().replace(/\s+/g, "-")}`}
            className="m-0 text-lg font-semibold text-text"
          >
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            title="Close"
            style={iconButton()}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function iconButton(): React.CSSProperties {
  return {
    alignItems: "center",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    display: "inline-flex",
    height: 42,
    justifyContent: "center",
    padding: 0,
    transition: "opacity 0.15s",
    width: 42,
  };
}

function textButton(): React.CSSProperties {
  return {
    alignItems: "center",
    background: "transparent",
    border: "none",
    color: "var(--muted)",
    display: "inline-flex",
    fontFamily: "var(--font-sans)",
    fontSize: "0.95rem",
    fontWeight: 600,
    justifyContent: "center",
    minHeight: 44,
    padding: "0 4px",
  };
}

function pill(variant: PillVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    padding: "0 14px",
    borderRadius: 999,
    fontSize: "0.83rem",
    fontWeight: 600,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    border: "1.5px solid transparent",
    transition: "opacity 0.15s",
  };
  switch (variant) {
    case "primary":    return { ...base, background: "var(--text)", color: "#fff", border: "none" };
    case "secondary":  return { ...base, background: "var(--surface)", color: "var(--text)", border: "none" };
    default:           return { ...base, background: "transparent", color: "var(--text)", borderColor: "var(--text)" };
  }
}

function MonoLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 6px", ...style }}>
      {children}
    </p>
  );
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
