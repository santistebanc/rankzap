import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Settings, Share2 } from "lucide-react";
import { SET_OPTS, useRoom } from "../../lib/room";
import { clampTitle } from "../../lib/types";
import { adaptiveSize } from "../../lib/adaptiveSize";
import { ShareBar } from "../../components/ShareLink";
import { UsersList } from "../../components/UsersList";
import { AddOption } from "../../components/AddOption";
import { LiveOptions } from "../../components/LiveOptions";
import { Settings as SettingsPanel } from "../../components/Settings";
import { VoterRankingPanel } from "../../components/VoterRankingPanel";
import { iconButton, MonoLabel, Modal, pill, PoweredByFooter, type PollData } from "./shared";

/** The host's view of a poll: edit the question and options, watch votes, close the poll. */
export function AdminView({ poll }: { poll: PollData }) {
  const { roomId, meta, settings, optionById, votesMap, usersMap, onlineUserIds, votedUserIds } = poll;
  const navigate = useNavigate();
  const { client } = useRoom();

  const [selectedVoterId, setSelectedVoterId] = useState<string | null>(null);
  const pollTitleInputRef = useRef<HTMLTextAreaElement>(null);
  /** While a title write is in flight, avoid syncing draft from stale `committedPollTitle`. */
  const pendingPollTitleRef = useRef<string | null>(null);
  const committedPollTitle = clampTitle(settings.ballotTitle ?? "");
  const [pollTitleDraft, setPollTitleDraft] = useState(committedPollTitle);
  const [isPollTitleFocused, setIsPollTitleFocused] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<"close" | "reset" | "deleteVote" | null>(null);

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

  useEffect(() => {
    setConfirmingAction((a) => (a === "deleteVote" ? null : a));
  }, [selectedVoterId]);

  useEffect(() => {
    if (isPollTitleFocused) return;
    if (pendingPollTitleRef.current !== null) {
      if (committedPollTitle === pendingPollTitleRef.current) {
        pendingPollTitleRef.current = null;
      } else {
        return;
      }
    }
    setPollTitleDraft(committedPollTitle);
  }, [committedPollTitle, isPollTitleFocused]);

  useLayoutEffect(() => {
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
  }, [pollTitleDraft]);

  const votedCount = votedUserIds.size;

  return (
    <main className="mx-auto w-full max-w-full sm:px-4 sm:py-10 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:max-w-[1180px]">
      <div className="card flex w-full min-h-dvh flex-col sm:min-h-0">
        <div className="card-content flex-1">

          <div className="content-inset" style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <button
              type="button"
              onClick={() => navigate("/")}
              aria-label="Back to homepage"
              title="Back"
              style={iconButton()}
            >
              <ArrowLeft size={18} strokeWidth={2} aria-hidden />
            </button>
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
            <LiveOptions
              removable
              showResults
              tallyMode={settings.tallyMode}
              editable
              highlightWinner={meta.state === "closed"}
            />
            <AddOption addedBy="admin" />
          </div>

          {hasAnyVotersForAdmin && (
            <div className="content-inset">
              <UsersList
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
        <PoweredByFooter onCreatePoll={() => navigate("/")} showCreateLink={false} />
      </div>
    </main>
  );
}
