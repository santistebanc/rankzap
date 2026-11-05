import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PollProvider, usePoll } from "../lib/poll";
import { clampTitle, pollColourOf, type Meta, type Option, type UserRecord, type Vote } from "../lib/types";
import { usePollColour } from "../lib/pollColour";
import { getOrCreateVoterIdentity, type VoterIdentity } from "../lib/identity";
import { getHostKey } from "../lib/storage";
import { AdminView } from "./poll/AdminView";
import { VoterView } from "./poll/VoterView";
import { PollDataContext, type PollData } from "./poll/shared";

interface LayoutProps {
  isAdmin: boolean;
}

export function Layout({ isAdmin }: LayoutProps) {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const upperId = roomId.toUpperCase();

  const identity = useMemo(() => (isAdmin ? null : getOrCreateVoterIdentity()), [isAdmin]);
  const hostKey = useMemo(() => (isAdmin ? getHostKey(upperId) : null), [isAdmin, upperId]);

  // Redirect lowercase/mixed-case URLs to canonical uppercase form
  if (roomId !== upperId) {
    return <Navigate to={isAdmin ? `/${upperId}/admin` : `/${upperId}`} replace />;
  }
  if (!roomId) return null;

  if (isAdmin && !hostKey) {
    return (
      <Message title="Not your poll.">
        Only the browser that created poll <b>{roomId}</b> can manage it.{" "}
        <Link to={`/${roomId}`} className="font-extrabold underline underline-offset-4">
          Vote in it instead
        </Link>
        .
      </Message>
    );
  }

  return (
    <PollProvider key={roomId} pollId={roomId} hostKey={hostKey ?? undefined} userId={identity?.userId}>
      <LayoutContent roomId={roomId} identity={identity} />
    </PollProvider>
  );
}

/**
 * Turns the live poll into what the views read, paints the page in the poll
 * colour, and hands over to the admin or voter view.
 */
function LayoutContent({ roomId, identity }: { roomId: string; identity: VoterIdentity | null }) {
  const { status, poll: snapshot, missing } = usePoll();
  usePollColour(pollColourOf(snapshot?.settings.colour));

  const poll = useMemo<PollData | null>(() => {
    if (!snapshot) return null;
    const options: Option[] = [...snapshot.options].sort((a, b) => a.addedAt - b.addedAt);
    const votesMap = new Map<string, Vote>(snapshot.votes.map((v) => [v.userId, v]));
    const meta: Meta = { state: snapshot.state, createdAt: snapshot.createdAt };
    return {
      roomId,
      meta,
      settings: snapshot.settings,
      pollHeading: clampTitle(snapshot.settings.ballotTitle ?? "").trim() || "Rank the options",
      options,
      optionById: new Map(options.map((o) => [o.id, o])),
      votesMap,
      usersMap: new Map<string, UserRecord>(snapshot.users.map((u) => [u.id, u])),
      onlineUserIds: new Set(snapshot.online),
      votedUserIds: new Set(snapshot.votes.filter((v) => v.ranking.length > 0).map((v) => v.userId)),
    };
  }, [roomId, snapshot]);

  useEffect(() => {
    document.title = poll ? `${clampTitle(poll.settings.ballotTitle ?? "").trim() || roomId} · Rankzap` : "Rankzap";
  }, [poll, roomId]);

  if (missing) {
    return (
      <Message title="No such poll.">
        There's no poll with the code <b>{roomId}</b>. It may have been deleted, or it expired after 30 days without
        activity.{" "}
        <Link to="/" className="font-extrabold underline underline-offset-4">
          Make a new one
        </Link>
        .
      </Message>
    );
  }

  if (!poll) {
    const label = status === "reconnecting" ? "Reconnecting…" : status === "closed" ? "Disconnected" : "Connecting…";
    return (
      <main className="flex min-h-dvh w-full items-center justify-center px-4 py-10">
        <p role="status" aria-live="polite" className="display text-[34px] text-ink">
          {label}
        </p>
      </main>
    );
  }

  return (
    <PollDataContext.Provider value={poll}>
      {status === "reconnecting" ? (
        <p role="status" className="sticky top-0 z-40 bg-[#0b0b0b] px-[18px] py-2 text-center text-sm font-bold text-white">
          Connection lost. Reconnecting…
        </p>
      ) : null}
      {identity ? <VoterView poll={poll} identity={identity} /> : <AdminView poll={poll} />}
    </PollDataContext.Provider>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-[18px] py-10 text-ink">
      <h1 className="display mb-4 text-[56px]">{title}</h1>
      <p className="text-[17px] font-semibold">{children}</p>
    </main>
  );
}
