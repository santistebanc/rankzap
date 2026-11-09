import { Activity, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { usePoll } from "../../lib/poll";
import { clampOption, NAME_MAX, type Option, type UserMode } from "../../lib/types";
import { fallbackVoterName, persistVoterName, type VoterIdentity } from "../../lib/identity";
import { getVoterRank, setVoterRank } from "../../lib/storage";
import { ArrangeOptions } from "../../components/ArrangeOptions";
import { AddOption } from "../../components/AddOption";
import { SubmitVote } from "../../components/SubmitVote";
import { VoterResults } from "./VoterResults";
import {
  PollTopBar,
  PoweredByFooter,
  questionFontSize,
  sameRanking,
  StickyQuestion,
  shuffleIds,
  type PollData,
} from "./shared";

type Screen = "compose" | "results";

/** A voter's view of a poll: rank the options (naming yourself as you lock in), then see results. */
export function VoterView({ poll, identity }: { poll: PollData; identity: VoterIdentity }) {
  const { roomId, meta, settings, pollHeading, options, votesMap, usersMap } = poll;
  const navigate = useNavigate();
  const { send, status } = usePoll();

  const [name, setName] = useState(identity.name);
  // The name field above Lock it in. Saved on blur and with the vote; remembered for next time.
  const [nameDraft, setNameDraft] = useState(identity.name);
  const [selectedVoterId, setSelectedVoterId] = useState<string | null>(null);
  const [ranking, setRanking] = useState<string[]>(() => getVoterRank(roomId) ?? []);
  const [shouldRandomizeFirstVote, setShouldRandomizeFirstVote] = useState(() => {
    const stored = getVoterRank(roomId);
    return !stored || stored.length === 0;
  });
  const [voterView, setVoterView] = useState<Screen>("results");
  const pollWasClosedRef = useRef(false);
  const voterOpenedEditRef = useRef(false);
  const [pendingAddedOptions, setPendingAddedOptions] = useState<Option[]>([]);

  const voterVisibleOptions = useMemo<Option[]>(
    () => [...options, ...pendingAddedOptions].sort((a, b) => a.addedAt - b.addedAt),
    [options, pendingAddedOptions],
  );

  const myVote = useMemo(
    () => votesMap.get(identity.userId) ?? null,
    [votesMap, identity.userId],
  );

  const hasVoted = Boolean(myVote?.ranking?.length);
  const hasSubmittedAnyVote = Boolean(myVote?.submittedAt);
  const hasPendingOptionAdds = pendingAddedOptions.length > 0;
  const rankingChanged = hasVoted
    ? !sameRanking(ranking, myVote?.ranking ?? [])
    : ranking.length > 0;
  const canSubmitVote = rankingChanged || hasPendingOptionAdds;

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

  const stageVoterOptions = useCallback(
    (texts: string[]) => {
      const now = Date.now();
      const next = texts
        .map((text) => clampOption(text))
        .filter((text): text is string => Boolean(text))
        .map((text, index) => ({
          id: nanoid(10),
          text,
          addedBy: identity.userId,
          addedAt: now + index,
        }));
      if (next.length === 0) return;
      setPendingAddedOptions((prev) => [...prev, ...next]);
    },
    [identity.userId],
  );

  const cancelVoteEdit = useCallback(() => {
    const submittedRanking = myVote?.ranking ?? [];
    const known = new Set(voterVisibleOptions.map((o) => o.id));
    const cleaned = submittedRanking.filter((id) => known.has(id));
    const missing = voterVisibleOptions
      .map((o) => o.id)
      .filter((id) => !cleaned.includes(id));
    updateRanking([...cleaned, ...missing]);
    setPendingAddedOptions([]);
    voterOpenedEditRef.current = false;
    setVoterView("results");
  }, [myVote?.ranking, updateRanking, voterVisibleOptions]);

  // "voting"  = first-time voter on the ballot (no prior submission)
  // "editing" = re-editing after submit with actual changes (submit button re-enabled)
  // "idle"    = everything else (results, or ballot with nothing changed)
  const mode: UserMode = (() => {
    if (meta.state !== "open" || voterView !== "compose") return "idle";
    if (!hasSubmittedAnyVote) return "voting";
    if (canSubmitVote) return "editing";
    return "idle";
  })();
  useEffect(() => {
    if (status !== "ready") return;
    const displayName = name.trim() || fallbackVoterName(identity.userId);
    const existingUser = usersMap.get(identity.userId);
    if (existingUser && existingUser.name === displayName && existingUser.mode === mode) return;
    send({ type: "join", name: displayName, mode }).catch((e) =>
      console.warn("[rankzap] failed to update user record:", e),
    );
  }, [send, status, identity.userId, name, mode, usersMap]);

  useEffect(() => {
    if (!settings.showUsers || !settings.showVoterVotes) setSelectedVoterId(null);
  }, [settings.showUsers, settings.showVoterVotes]);

  useEffect(() => {
    if (meta.state === "closed") {
      voterOpenedEditRef.current = false;
      setVoterView("results");
      pollWasClosedRef.current = true;
      return;
    }
    const wasClosed = pollWasClosedRef.current;
    pollWasClosedRef.current = false;
    if (wasClosed && !hasVoted) return;
    if (hasVoted) {
      if (!voterOpenedEditRef.current) setVoterView("results");
      return;
    }
    voterOpenedEditRef.current = false;
    setVoterView("compose");
  }, [hasVoted, meta.state]);

  // After a vote lands, line the ballot up with what was submitted.
  useEffect(() => {
    if (!hasSubmittedAnyVote || !shouldRandomizeFirstVote) return;
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
  }, [hasSubmittedAnyVote, myVote?.ranking, shouldRandomizeFirstVote, updateRanking, voterVisibleOptions]);

  // The first ballot starts shuffled so the host's order doesn't bias anyone.
  useEffect(() => {
    if (hasSubmittedAnyVote || !shouldRandomizeFirstVote) return;
    if (options.length === 0) return;
    const canonicalIds = options.map((o) => o.id);
    const rankingLooksUntouched = ranking.length === 0 || sameRanking(ranking, canonicalIds);
    if (!rankingLooksUntouched) {
      // User already arranged manually before auto-randomization ran.
      setShouldRandomizeFirstVote(false);
      return;
    }
    updateRanking(shuffleIds(canonicalIds));
    setShouldRandomizeFirstVote(false);
  }, [hasSubmittedAnyVote, options, ranking, shouldRandomizeFirstVote, updateRanking]);

  const canShowVoterResults = settings.showLiveResults || meta.state === "closed";
  const canChangeVote = meta.state === "open" && settings.allowRevote;
  const canLockIn = meta.state === "open" && !(hasVoted && !settings.allowRevote);
  const commitName = () => {
    const next = persistVoterName(nameDraft);
    setNameDraft(next);
    setName(next);
  };

  // Live counts under the question, not counting this voter.
  const others = [...usersMap.values()].filter((u) => u.id !== identity.userId);
  const votedCount = others.filter((u) => poll.votedUserIds.has(u.id)).length;
  const rankingNow = others.filter((u) => poll.onlineUserIds.has(u.id) && u.mode !== "idle").length;
  const counts = [
    `${options.length} ${options.length === 1 ? "option" : "options"}`,
    `${votedCount} voted`,
    rankingNow > 0 ? `${rankingNow} ranking now` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col text-ink">
      <PollTopBar roomId={roomId}>
        {name ? <span className="min-w-0 truncate">Voting as {name}</span> : undefined}
      </PollTopBar>

      <StickyQuestion>
        <h1
          className="display border-b-4 border-current pt-1 pb-2 wrap-break-word"
          style={{ fontSize: questionFontSize(pollHeading, 28, 44) }}
        >
          {pollHeading}
        </h1>
      </StickyQuestion>

      <div className="flex-1">
        <Activity mode={voterView === "compose" ? "visible" : "hidden"}>
          <section aria-label="Your vote" inert={voterView !== "compose" ? true : undefined}>
            <p className="mx-[18px] mt-3 mb-1 text-[15px] font-semibold">
              {meta.state === "closed"
                ? "This poll is closed."
                : !settings.allowRevote && hasVoted
                  ? "Your vote is locked in."
                  : "Drag your favourite to the top."}
            </p>
            <p className="mx-[18px] mb-4 text-[13px] font-bold opacity-80">{counts}</p>
            <ArrangeOptions
              options={voterVisibleOptions}
              ranking={ranking}
              onChange={updateRanking}
              reorderingDisabled={(!settings.allowRevote && hasVoted) || meta.state === "closed"}
            />
            {settings.allowAdd && meta.state === "open" && (
              <div className="mt-1">
                <AddOption onAddOption={stageVoterOptions} />
              </div>
            )}
            <div className="grid gap-1 px-[18px] pt-5 pb-6">
              {canLockIn && (
                <div className="mb-3">
                  <label htmlFor="voter-name" className="mb-1 block text-sm font-extrabold">
                    Your name <span className="font-semibold opacity-80">· so others know who voted</span>
                  </label>
                  <input
                    id="voter-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    maxLength={NAME_MAX}
                    placeholder="Your name"
                    autoComplete="name"
                    enterKeyHint="done"
                    className="display w-full rounded-none border-b-4 border-current bg-transparent pt-1 pb-1.5 text-[32px] text-ink outline-none placeholder:text-current placeholder:opacity-50"
                  />
                </div>
              )}
              <SubmitVote
                name={nameDraft.trim()}
                ranking={ranking}
                newOptions={pendingAddedOptions.map(({ id, text }) => ({ id, text }))}
                hasVoted={hasVoted}
                disabled={meta.state === "closed" || (!settings.allowRevote && hasVoted) || !canSubmitVote}
                disabledReason={
                  meta.state === "closed"
                    ? "Poll is closed."
                    : !settings.allowRevote && hasVoted
                      ? "Revoting is turned off for this poll."
                      : undefined
                }
                onSubmitted={() => {
                  commitName();
                  setPendingAddedOptions([]);
                  voterOpenedEditRef.current = false;
                  setVoterView("results");
                }}
              />
              {hasSubmittedAnyVote ? (
                <button type="button" onClick={cancelVoteEdit} className="min-h-11 font-extrabold underline-offset-4 hover:underline">
                  Keep my old vote
                </button>
              ) : canShowVoterResults ? (
                <button type="button" onClick={() => setVoterView("results")} className="min-h-11 font-extrabold underline-offset-4 hover:underline">
                  Skip to results
                </button>
              ) : null}
            </div>
          </section>
        </Activity>

        <Activity mode={voterView === "results" ? "visible" : "hidden"}>
          <div inert={voterView !== "results" ? true : undefined}>
            <VoterResults
              poll={poll}
              selfUserId={identity.userId}
              myVote={myVote}
              canChangeVote={canChangeVote}
              canShowResults={canShowVoterResults}
              onChangeVote={() => {
                voterOpenedEditRef.current = true;
                setVoterView("compose");
              }}
              selectedVoterId={selectedVoterId}
              onToggleVoter={toggleVoterSelection}
              onClearVoter={clearVoterSelection}
            />
          </div>
        </Activity>
      </div>
      <PoweredByFooter onCreatePoll={() => navigate("/")} />
    </main>
  );
}

