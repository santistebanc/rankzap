import { Activity, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { House } from "lucide-react";
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
import { ThemeToggle } from "../components/ThemeToggle";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { Username } from "../components/Username";
import { UsersList } from "../components/UsersList";
import { ArrangeOptions } from "../components/ArrangeOptions";
import { AddOption } from "../components/AddOption";
import { SubmitVote } from "../components/SubmitVote";
import { LiveOptions } from "../components/LiveOptions";
import { Settings as SettingsPanel } from "../components/Settings";
import { VoterRankingPanel } from "../components/VoterRankingPanel";
import { AccordionSection } from "../components/AccordionSection";
import { Scribble } from "../components/Scribble";

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
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl items-center sm:px-4 sm:py-10 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        <div className="paper-card w-full min-h-dvh sm:min-h-0">
          <div className="paper-content">
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Loading poll…</p>
          </div>
        </div>
      </main>
    );
  }

  const votedCount = votedUserIds.size;

  // ─── ADMIN VIEW ───────────────────────────────────────────────
  if (isAdmin) {
    return (
      <main className="mx-auto w-full max-w-3xl sm:px-4 sm:py-10 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        <div className="paper-card w-full min-h-dvh sm:min-h-0">
          <div style={CORNER_TOOLBAR}>
            <button type="button" onClick={() => navigate("/")} aria-label="Go to home" title="Home" style={CORNER_BTN} className="transition-colors hover:bg-surface-2 hover:text-text">
              <House className="size-4" strokeWidth={2} aria-hidden />
            </button>
            <ThemeToggle style={CORNER_BTN} />
          </div>
          <div className="paper-content">


            {/* Poll question */}
            <div style={{ marginBottom: "1rem" }}>
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
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: adaptiveSize(pollTitleDraft, 22, 44, 8, 70),
                  fontWeight: 700,
                  color: "var(--text)",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  width: "100%",
                  padding: "6px 0",
                  lineHeight: 1.05,
                  display: "block",
                  caretColor: "var(--accent)",
                }}
              />
              <p style={{ fontSize: "0.83rem", color: "var(--muted)", marginTop: 2 }}>
                drag to reorder · click ✕ to remove
              </p>
            </div>

            {/* Live options */}
            <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: "clamp(0.5rem,1.5vw,0.75rem)" }}>
              <LiveOptions removable showResults tallyMode={settings.tallyMode} editable />
              <AddOption addedBy="admin" />
            </div>

            {/* Voters */}
            {hasAnyVotersForAdmin && (
              <div style={{ marginBottom: "clamp(0.75rem,2vw,1.25rem)" }}>
                <UsersList
                  selfUserId={identity?.userId}
                  showIgnoredBadge
                  variant="tabStrip"
                  selectedVoterId={selectedVoterId}
                  onToggleVoter={toggleVoterSelection}
                  onInvalidateVoterSelection={clearVoterSelection}
                />
                <Activity mode={selectedVoterId ? "visible" : "hidden"}>
                  <div style={{ marginTop: 8 }} inert={!selectedVoterId ? true : undefined}>
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
                          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
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
                                    style={pill("danger")}
                                  >
                                    Confirm delete
                                  </button>
                                </>
                              ) : (
                                <button type="button" onClick={() => setConfirmingAction("deleteVote")} style={pill("danger-soft")}>
                                  Delete vote
                                </button>
                              )
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </Activity>
              </div>
            )}

            {/* Share link */}
            <div style={{ marginBottom: "clamp(1.5rem,4vw,2.5rem)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <MonoLabel>share this link</MonoLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {(votedCount > 0 || meta.state === "closed") && (
                    confirmingAction === "close" ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Close poll?</span>
                        <button type="button" onClick={() => setConfirmingAction(null)} style={pill("secondary")}>Cancel</button>
                        <button type="button" onClick={() => { setConfirmingAction(null); void togglePollState(); }} style={pill("danger")}>Yes, close</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={meta.state === "open" ? () => setConfirmingAction("close") : () => void togglePollState()}
                        style={pill(meta.state === "open" ? "default" : "success")}
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
                        <button type="button" onClick={() => { setConfirmingAction(null); void resetVotes(); }} style={pill("danger")}>Yes, reset</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmingAction("reset")} style={pill("danger-soft")}>Reset votes</button>
                    )
                  )}
                </div>
              </div>
              <ShareBar roomId={roomId} />
            </div>

            {/* Settings */}
            <AccordionSection title="Settings" noPadding>
              <SettingsPanel />
            </AccordionSection>

          </div>
        </div>
      </main>
    );
  }

  // ─── VOTER VIEW ───────────────────────────────────────────────
  return (
    <main className="mx-auto w-full max-w-2xl sm:px-4 sm:py-10 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="paper-card w-full min-h-dvh sm:min-h-0">
        <div style={CORNER_TOOLBAR}>
          <button type="button" onClick={() => navigate("/")} aria-label="Go to home" title="Home" style={CORNER_BTN} className="transition-colors hover:bg-surface-2 hover:text-text">
            <House className="size-4" strokeWidth={2} aria-hidden />
          </button>
          <ThemeToggle style={CORNER_BTN} />
        </div>
        <div className="paper-content">

          {/* TopBar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: "clamp(1.5rem,4vw,2.5rem)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Inline your-vote / results toggle */}
              <div role="tablist" aria-label="Poll view" style={{ display: "flex", border: "1.5px solid var(--border)", borderRadius: 999, overflow: "hidden" }}>
                <button
                  role="tab"
                  aria-selected={voterView === "compose"}
                  type="button"
                  onClick={() => meta.state !== "closed" && setVoterView("compose")}
                  disabled={meta.state === "closed"}
                  title={meta.state === "closed" ? "Poll is closed" : undefined}
                  style={{
                    padding: "8px 14px",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.83rem",
                    fontWeight: 600,
                    background: voterView === "compose" ? "var(--text)" : "transparent",
                    color: voterView === "compose" ? "var(--bg)" : "var(--muted)",
                    border: "none",
                    cursor: meta.state === "closed" ? "not-allowed" : "pointer",
                    opacity: meta.state === "closed" ? 0.5 : 1,
                    transition: "background 0.15s, color 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  your vote
                </button>
                <button
                  role="tab"
                  aria-selected={voterView === "results"}
                  type="button"
                  onClick={() => setVoterView("results")}
                  style={{
                    padding: "8px 14px",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.83rem",
                    fontWeight: voterView === "results" ? 600 : 400,
                    background: voterView === "results" ? "var(--text)" : "transparent",
                    color: voterView === "results" ? "var(--bg)" : "var(--muted)",
                    border: "none",
                    cursor: "pointer",
                    transition: "background 0.15s, color 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  results
                </button>
              </div>
            </div>
          </div>

          {/* Poll heading */}
          <div style={{ marginBottom: "clamp(1rem,3vw,1.5rem)" }}>
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

          {/* Compose tab */}
          <Activity mode={voterView === "compose" ? "visible" : "hidden"}>
            <div
              role="tabpanel"
              aria-label="Your vote"
              inert={voterView !== "compose" ? true : undefined}
            >
              {meta.state === "closed" && (
                <div style={{ marginBottom: "1rem", display: "inline-block", borderRadius: 999, border: "1.5px solid var(--border)", padding: "6px 14px", fontSize: "0.83rem", color: "var(--muted)", fontWeight: 600 }}>
                  Poll is closed.
                </div>
              )}
              <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1rem" }}>
                drag items so your{" "}
                <strong style={{ color: "var(--accent)", fontWeight: 700 }}>favorite</strong>{" "}
                is on top.
              </p>
              <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: "clamp(1rem,3vw,1.5rem)" }}>
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
                    <Username name={name} onCommit={setName} placeholder={fallbackVoterName(identity.userId)} />
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

          {/* Results tab */}
          <Activity mode={voterView === "results" ? "visible" : "hidden"}>
            <div
              role="tabpanel"
              aria-label="Results"
              inert={voterView !== "results" ? true : undefined}
            >
              {(settings.showLiveResults || meta.state === "closed") && winner && (
                <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.2rem,4vw,1.6rem)", color: "var(--text)", marginBottom: "clamp(1rem,3vw,1.5rem)", lineHeight: 1.2 }}>
                  the group says:{" "}
                  <span style={{ color: "var(--accent)", fontWeight: 700, position: "relative", display: "inline-block" }}>
                    {winner.text}
                    <Scribble
                      color="var(--accent)"
                      width={Math.max(80, winner.text.length * 9)}
                      style={{ position: "absolute", left: 0, bottom: -10, width: "100%", height: 14 }}
                    />
                  </span>
                  {" "}wins.
                </div>
              )}
              {settings.showLiveResults || meta.state === "closed" ? (
                <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
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
                    : "Live rankings are hidden until the poll closes. Use Your Vote tab to rank; results will show here when it's over."}
                </p>
              )}
            </div>
          </Activity>

          {/* Other voters */}
          {settings.showUsers && hasAnyOtherVoters && (
            <div style={{ marginTop: "clamp(0.75rem,2vw,1.25rem)" }}>
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
      </div>
    </main>
  );
}

// ─── Shared style helpers ──────────────────────────────────────────────────


const CORNER_TOOLBAR: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  zIndex: 2,
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
};

const CORNER_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  background: "none",
  border: "none",
  color: "var(--muted)",
  cursor: "pointer",
  padding: 4,
  borderRadius: 6,
};

type PillVariant = "default" | "success" | "danger" | "danger-soft" | "secondary";

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
    case "success":    return { ...base, background: "var(--success)", color: "#fff", border: "none" };
    case "danger":     return { ...base, background: "var(--danger)", color: "#fff", border: "none" };
    case "danger-soft":return { ...base, background: "var(--danger-soft)", color: "var(--danger)", borderColor: "color-mix(in oklch, var(--danger) 30%, transparent)" };
    case "secondary":  return { ...base, background: "transparent", color: "var(--text)", borderColor: "var(--border)" };
    default:           return { ...base, background: "transparent", color: "var(--text)", borderColor: "var(--border)" };
  }
}

function MonoLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 6px", ...style }}>
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
