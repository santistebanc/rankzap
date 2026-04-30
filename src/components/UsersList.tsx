import { useMemo } from "react";
import { useRoomList } from "../lib/room";
import type { UserRecord } from "../lib/types";
import { UserPill, type PillState } from "./UserPill";

interface UsersListProps {
  selfUserId?: string;
}

export function UsersList({ selfUserId }: UsersListProps) {
  const usersMap = useRoomList("users/");
  const votesMap = useRoomList("votes/");
  const presenceMap = useRoomList("presence/");

  // Set of userIds with at least one live socket. Server manages presence/
  // entries via WS lifetime — no client-side timeouts or tick intervals.
  const onlineUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const info of presenceMap.values()) {
      if (info?.userId) set.add(info.userId);
    }
    return set;
  }, [presenceMap]);

  const votedUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const key of votesMap.keys()) {
      set.add(key.replace(/^votes\//, ""));
    }
    return set;
  }, [votesMap]);

  const visible = useMemo(() => {
    const arr: UserRecord[] = [];
    for (const u of usersMap.values()) {
      const online = onlineUserIds.has(u.id);
      const voted = votedUserIds.has(u.id);
      if (online || voted) arr.push(u);
    }
    arr.sort((a, b) => {
      // Self first, then voters, then by name.
      if (a.id === selfUserId) return -1;
      if (b.id === selfUserId) return 1;
      const aV = votedUserIds.has(a.id) ? 0 : 1;
      const bV = votedUserIds.has(b.id) ? 0 : 1;
      if (aV !== bV) return aV - bV;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [usersMap, onlineUserIds, votedUserIds, selfUserId]);

  const onlineCount = visible.filter((u) => onlineUserIds.has(u.id)).length;
  const votedCount = visible.filter((u) => votedUserIds.has(u.id)).length;

  return (
    <section aria-label="Participants" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs text-muted">
        <span>
          {votedCount} voted · {onlineCount} online
        </span>
        <span>{visible.length} total</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.length === 0 ? (
          <span className="text-xs text-muted">No participants yet.</span>
        ) : (
          visible.map((u) => (
            <UserPill
              key={u.id}
              user={u}
              state={pillStateFor(
                u,
                onlineUserIds.has(u.id),
                votedUserIds.has(u.id),
              )}
              isYou={u.id === selfUserId}
            />
          ))
        )}
      </div>
    </section>
  );
}

function pillStateFor(
  user: UserRecord,
  online: boolean,
  hasVoted: boolean,
): PillState {
  if (!online) return "offline";
  if (user.mode === "voting" && hasVoted) return "changing";
  if (user.mode === "voting") return "voting";
  if (hasVoted) return "voted";
  return "online";
}
