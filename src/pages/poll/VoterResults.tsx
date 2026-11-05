import { useMemo, useState } from "react";
import { TALLY_MODE_LABELS, type TallyMode, type Vote } from "../../lib/types";
import { computeTally } from "../../lib/tally";
import { adaptiveSize } from "../../lib/adaptiveSize";
import { LiveOptions } from "../../components/LiveOptions";
import { UsersList } from "../../components/UsersList";
import { VoterRankingPanel } from "../../components/VoterRankingPanel";
import { Modal, type PollData } from "./shared";

interface VoterResultsProps {
  poll: PollData;
  selfUserId: string;
  myVote: Vote | null;
  canChangeVote: boolean;
  canShowResults: boolean;
  onChangeVote: () => void;
  selectedVoterId: string | null;
  onToggleVoter: (userId: string) => void;
  onClearVoter: () => void;
}

/**
 * After ranking: a black banner ("You're in." or, once closed, the winner),
 * then the results so far, your own ranking, and who has voted.
 */
export function VoterResults({
  poll,
  selfUserId,
  myVote,
  canChangeVote,
  canShowResults,
  onChangeVote,
  selectedVoterId,
  onToggleVoter,
  onClearVoter,
}: VoterResultsProps) {
  const { meta, settings, options, optionById, votesMap, usersMap } = poll;
  const closed = meta.state === "closed";
  const hasVoted = Boolean(myVote?.ranking?.length);

  const countedVotes = useMemo(() => {
    const ignored = new Set([...usersMap.values()].filter((u) => u.ignored).map((u) => u.id));
    return [...votesMap.values()].filter((v) => v.ranking?.length && !v.ignored && !ignored.has(v.userId));
  }, [usersMap, votesMap]);
  const tally = useMemo(
    () => computeTally({ options, votes: countedVotes, mode: settings.tallyMode }),
    [options, countedVotes, settings.tallyMode],
  );

  const voteSummary = `${countedVotes.length} ${countedVotes.length === 1 ? "vote" : "votes"} · ${TALLY_MODE_LABELS[settings.tallyMode]}`;
  const selectedName = selectedVoterId ? usersMap.get(selectedVoterId)?.name || "Voter" : "Voter";

  return (
    <section aria-label={closed ? "Final results" : "Results"} className="grid">
      {closed ? (
        <FinalBanner
          summary={voteSummary}
          tally={tally}
          mode={settings.tallyMode}
          nameOf={(id) => optionById.get(id)?.text ?? ""}
        />
      ) : (
        <div className="bg-[#0b0b0b] px-[18px] pt-5 pb-[18px] text-white">
          <h1 className="display mb-2 text-[56px] text-sig-fg">{hasVoted ? "You're in." : "Not in yet."}</h1>
          <p className="mb-3.5 text-[15px]">
            {!hasVoted
              ? "You're looking at the results without a vote. Rank the options to add yours."
              : canChangeVote
                ? "Your ranking is saved. You can change it until the host closes the poll."
                : "Your ranking is saved."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(canChangeVote || !hasVoted) && (
              <button
                type="button"
                onClick={onChangeVote}
                className="display min-h-11 bg-sig px-3.5 text-lg text-sig-ink transition-transform duration-150 ease-(--ease-spring) active:scale-[0.97]"
              >
                {hasVoted ? "Change my vote" : "Rank now"}
              </button>
            )}
            <ShareButton />
          </div>
        </div>
      )}

      {canShowResults ? (
        <>
          {!closed && <SubHeading aside={voteSummary}>Results so far</SubHeading>}
          <div className="mx-[18px] mt-3.5">
            <LiveOptions
              removable={false}
              showResults
              tallyMode={settings.tallyMode}
            />
          </div>
        </>
      ) : (
        <p className="mx-[18px] mt-[18px] text-[15px] font-semibold">
          Results stay hidden until the host closes the poll.
        </p>
      )}

      {hasVoted && (closed || !canShowResults) && (
        <>
          <SubHeading>Your ranking</SubHeading>
          <div className="mx-[18px] mt-2.5">
            <VoterRankingPanel voterName="Your" ranking={myVote?.ranking} optionById={optionById} />
          </div>
        </>
      )}

      {settings.showUsers && (
        <>
          <SubHeading>Who's voted</SubHeading>
          <div className="mx-[18px] mt-2.5">
            {settings.showVoterVotes ? (
              <UsersList
                selfUserId={selfUserId}
                variant="tabStrip"
                selectedVoterId={selectedVoterId}
                onToggleVoter={onToggleVoter}
                onInvalidateVoterSelection={onClearVoter}
              />
            ) : (
              <UsersList selfUserId={selfUserId} />
            )}
          </div>
          <Modal open={Boolean(settings.showVoterVotes && selectedVoterId)} title={selectedName} onClose={onClearVoter}>
            {selectedVoterId ? (
              <VoterRankingPanel
                voterName={selectedName}
                ranking={votesMap.get(selectedVoterId)?.ranking}
                optionById={optionById}
              />
            ) : null}
          </Modal>
        </>
      )}
    </section>
  );
}

function SubHeading({ children, aside }: { children: React.ReactNode; aside?: string }) {
  return (
    <h2 className="mx-[18px] mt-6 flex items-baseline justify-between gap-3 text-ink">
      <span className="display text-2xl">{children}</span>
      {aside ? <span className="text-[13px] font-bold">{aside}</span> : null}
    </h2>
  );
}

/** Closed poll: the winner, big, with the margin over second place. */
function FinalBanner({
  summary,
  tally,
  mode,
  nameOf,
}: {
  summary: string;
  tally: { optionId: string; score: number; rank: number }[];
  mode: TallyMode;
  nameOf: (id: string) => string;
}) {
  const [first, second] = tally;
  const hasWinner = Boolean(first && first.score > 0);
  const tiedForFirst = tally.filter((t) => t.rank === 1);
  const winnerText = hasWinner
    ? tiedForFirst.length > 1
      ? tiedForFirst.map((t) => nameOf(t.optionId)).join(" & ")
      : nameOf(first.optionId)
    : "No votes";

  let margin = "";
  if (hasWinner && tiedForFirst.length > 1) {
    margin = `A ${tiedForFirst.length}-way tie for first.`;
  } else if (hasWinner && second) {
    const diff = first.score - second.score;
    const unit = mode === "copeland" ? (diff === 1 ? "head-to-head win" : "head-to-head wins") : diff === 1 ? "point" : "points";
    margin = `Won by ${formatNumber(diff)} ${unit} over ${nameOf(second.optionId)}.`;
  }

  return (
    <div className="relative overflow-hidden bg-[#0b0b0b] px-[18px] pt-4 pb-[22px] text-white">
      <p className="mb-1.5 text-sm font-bold">Poll closed · {summary}</p>
      {hasWinner && <p className="display text-[30px] text-sig-fg">{tiedForFirst.length > 1 ? "Winners" : "Winner"}</p>}
      <p
        className="display relative mt-1 text-sig-fg wrap-break-word"
        style={{ fontSize: adaptiveSize(winnerText, 48, 100, 10, 60), lineHeight: 0.82 }}
      >
        {winnerText}
      </p>
      {margin && <p className="relative mt-3 text-[15px]">{margin}</p>}
      <span
        aria-hidden="true"
        className="display pointer-events-none absolute -right-3.5 -bottom-12 text-[240px] text-white opacity-[0.08]"
      >
        1
      </span>
    </div>
  );
}

/** Share the poll link: the system share sheet where there is one, otherwise copy it. */
function ShareButton() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: document.title });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; nothing else to try */
    }
  };
  return (
    <button
      type="button"
      onClick={share}
      className="display min-h-11 bg-[#2a2a28] px-3.5 text-lg text-white transition-transform duration-150 ease-(--ease-spring) active:scale-[0.97]"
    >
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </button>
  );
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
