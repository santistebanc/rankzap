import { Activity, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { usePoll } from "../../lib/poll";
import { clampOption, type Option, type UserMode } from "../../lib/types";
import { adaptiveSize } from "../../lib/adaptiveSize";
import { fallbackVoterName, persistVoterName, type VoterIdentity } from "../../lib/identity";
import { getVoterRank, setVoterRank } from "../../lib/storage";
import { UserPill, pillStateFor } from "../../components/UserPill";
import { ArrangeOptions } from "../../components/ArrangeOptions";
import { AddOption } from "../../components/AddOption";
import { SubmitVote } from "../../components/SubmitVote";
import { VoterResults } from "./VoterResults";
import { Arrow } from "../../components/Arrow";
import {
  PollTopBar,
  PoweredByFooter,
  sameRanking,
  shuffleIds,
  type PollData,
} from "./shared";

type Screen = "compose" | "results";

/** A voter's view of a poll: say who you are, rank the options, see results. */
export function VoterView({ poll, identity }: { poll: PollData; identity: VoterIdentity }) {
  const { roomId, meta, settings, pollHeading, options, votesMap, usersMap } = poll;
  const navigate = useNavigate();
  const { send, status } = usePoll();

  const [name, setName] = useState(identity.name);
  // First visit to any poll: ask for a name before the ballot. Remembered after.
  const [arrived, setArrived] = useState(() => Boolean(identity.name));
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
  // Someone who already voted, or a closed poll, skips the name screen.
  const showArrive = !arrived && !hasSubmittedAnyVote && meta.state === "open";

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
  // "idle"    = everything else (name screen, results, or ballot with nothing changed)
  const mode: UserMode = (() => {
    if (meta.state !== "open" || voterView !== "compose" || showArrive) return "idle";
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
  const displayName = name.trim() || fallbackVoterName(identity.userId);

  if (showArrive) {
    return (
      <ArriveScreen
        poll={poll}
        selfUserId={identity.userId}
        name={name}
        placeholder={fallbackVoterName(identity.userId)}
        onStart={(next) => {
          setName(persistVoterName(next));
          setArrived(true);
        }}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col text-ink">
      <PollTopBar roomId={roomId}>
        <button
          type="button"
          onClick={() => setArrived(false)}
          disabled={hasSubmittedAnyVote}
          title={hasSubmittedAnyVote ? undefined : "Change your name"}
          className="min-h-11 max-w-[60%] truncate text-left enabled:hover:underline"
        >
          Hi {displayName}
        </button>
      </PollTopBar>

      <div className="flex-1">
        <Activity mode={voterView === "compose" ? "visible" : "hidden"}>
          <section aria-label="Your vote" inert={voterView !== "compose" ? true : undefined}>
            <h1
              className="display mx-[18px] mt-[18px] mb-1.5 wrap-break-word"
              style={{ fontSize: adaptiveSize(pollHeading, 34, 52, 16, 80) }}
            >
              {pollHeading}
            </h1>
            <p className="mx-[18px] mb-4 text-[15px] font-semibold">
              {meta.state === "closed"
                ? "This poll is closed."
                : !settings.allowRevote && hasVoted
                  ? "Your vote is locked in."
                  : "Drag your favourite to the top."}
            </p>
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
            <div className="grid gap-1 px-[18px] pt-4 pb-6">
              <SubmitVote
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

/** First visit: the question, a few live facts, and a name before ranking. */
function ArriveScreen({
  poll,
  selfUserId,
  name,
  placeholder,
  onStart,
}: {
  poll: PollData;
  selfUserId: string;
  name: string;
  placeholder: string;
  onStart: (name: string) => void;
}) {
  const { roomId, pollHeading, options, usersMap, onlineUserIds, votedUserIds } = poll;
  const [draft, setDraft] = useState(name);
  const others = [...usersMap.values()].filter(
    (u) => u.id !== selfUserId && (onlineUserIds.has(u.id) || votedUserIds.has(u.id)),
  );
  const rankingNow = others.filter((u) => onlineUserIds.has(u.id) && u.mode !== "idle").length;
  const votedCount = [...votedUserIds].filter((id) => id !== selfUserId).length;
  const facts: [number, string][] = [
    [options.length, options.length === 1 ? "option" : "options"],
    [votedCount, "have voted"],
    [rankingNow, "ranking now"],
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col text-ink">
      <PollTopBar roomId={roomId} />
      <h1
        className="display mx-[18px] mt-[18px] mb-4 wrap-break-word"
        style={{ fontSize: adaptiveSize(pollHeading, 40, 72, 12, 80) }}
      >
        {pollHeading}
      </h1>
      <dl className="mx-[18px] grid grid-cols-3 gap-1">
        {facts.map(([n, label]) => (
          <div key={label} className="flex flex-col-reverse bg-step px-2.5 py-3 text-step-ink">
            <dt className="text-xs font-semibold">{label}</dt>
            <dd className="display text-[34px] tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <form
        className="px-[18px] pt-[18px] pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(draft);
        }}
      >
        <label htmlFor="voter-name" className="mb-2 block text-sm font-extrabold">
          Your name
        </label>
        <input
          id="voter-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={32}
          placeholder={placeholder}
          autoComplete="name"
          className="display w-full rounded-none border-b-4 border-current bg-transparent pt-1 pb-2 text-[44px] text-ink outline-none placeholder:text-current placeholder:opacity-60"
        />
        <button
          type="submit"
          className="mt-[18px] flex min-h-16 w-full items-center justify-between bg-hi px-5 text-hi-ink transition-transform duration-150 ease-(--ease-spring) active:scale-[0.97]"
        >
          <span className="display text-[26px]">Start ranking</span>
          <Arrow />
        </button>
        {others.length > 0 && (
          <>
            <p className="mt-[18px] mb-2 text-sm font-extrabold">Already here</p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((u) => (
                <UserPill
                  key={u.id}
                  user={u}
                  state={pillStateFor(u, onlineUserIds.has(u.id), votedUserIds.has(u.id))}
                />
              ))}
            </div>
          </>
        )}
      </form>
    </main>
  );
}

