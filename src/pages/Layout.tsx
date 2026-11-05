import { useEffect, useMemo } from "react";
import { useParams, Navigate } from "react-router-dom";
import { RoomProvider, touchKey, useRoom, useRoomList, useRoomValue } from "../lib/room";
import {
  clampTitle,
  DEFAULT_META,
  DEFAULT_SETTINGS,
  pollColourOf,
  type Option,
} from "../lib/types";
import { usePollColour } from "../lib/pollColour";
import { getOrCreateVoterIdentity, type VoterIdentity } from "../lib/identity";
import { AdminView } from "./poll/AdminView";
import { VoterView } from "./poll/VoterView";
import type { PollData } from "./poll/shared";

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
      <LayoutContent roomId={roomId} identity={identity} />
    </RoomProvider>
  );
}

/**
 * Loads the room data both views share, paints the page in the poll colour,
 * and hands over to the admin or voter view.
 */
function LayoutContent({ roomId, identity }: { roomId: string; identity: VoterIdentity | null }) {
  const { client, status } = useRoom();
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
  const meta = useMemo(() => storedMeta ?? DEFAULT_META(), [storedMeta]);
  usePollColour(pollColourOf(settings.colour));

  const pollHeading = useMemo(() => {
    const fromSettings = clampTitle(settings.ballotTitle ?? "").trim();
    if (fromSettings) return fromSettings;
    return clampTitle(meta.title ?? "").trim() || "Rank the options";
  }, [settings.ballotTitle, meta.title]);

  const options = useMemo<Option[]>(
    () => [...optionsMap.values()].sort((a, b) => a.addedAt - b.addedAt),
    [optionsMap],
  );
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

  // Touch meta on connect (refresh TTL).
  useEffect(() => {
    if (status !== "ready") return;
    void touchKey(client, "meta");
    void touchKey(client, "settings");
  }, [client, status]);

  useEffect(() => {
    const fromSettings = clampTitle(settings.ballotTitle ?? "").trim();
    const fromMeta = clampTitle(meta.title ?? "").trim();
    document.title = fromSettings || fromMeta || "Rankzap";
  }, [settings.ballotTitle, meta.title]);

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
        <p role="status" aria-live="polite" className="display text-[34px] text-ink">
          {loadingLabel}
        </p>
      </main>
    );
  }

  const poll: PollData = {
    roomId,
    meta,
    settings,
    pollHeading,
    options,
    optionById,
    optionsMap,
    votesMap,
    usersMap,
    presenceMap,
    onlineUserIds,
    votedUserIds,
  };

  return identity ? <VoterView poll={poll} identity={identity} /> : <AdminView poll={poll} />;
}
