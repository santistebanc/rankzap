import { useEffect, useMemo } from "react";
import { useRoomList } from "../lib/room";
import { fallbackVoterName } from "../lib/identity";
import type { UserRecord } from "../lib/types";
import { UserPill, type PillState } from "./UserPill";

interface UsersListProps {
  selfUserId?: string;
  includeSelf?: boolean;
  showIgnoredBadge?: boolean;
  /** `tabStrip`: one horizontal row of boxy segments (like main tabs), with scroll on overflow. */
  variant?: "pills" | "tabStrip";
  /** Selected voter in `tabStrip` (shows pressed state). */
  selectedVoterId?: string | null;
  /** Toggle or select a voter for `tabStrip` (caller handles single-select / toggle). */
  onToggleVoter?: (userId: string) => void;
  /** Called when the selected voter disappears from this list (e.g. went offline without a vote). */
  onInvalidateVoterSelection?: () => void;
}

export function UsersList({
  selfUserId,
  includeSelf = true,
  showIgnoredBadge = false,
  variant = "pills",
  selectedVoterId = null,
  onToggleVoter,
  onInvalidateVoterSelection,
}: UsersListProps) {
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
    for (const [key, vote] of votesMap.entries()) {
      if (!key.startsWith("votes/")) continue;
      if (vote?.ranking?.length) set.add(key.replace(/^votes\//, ""));
    }
    return set;
  }, [votesMap]);

  const visible = useMemo(() => {
    const arr: UserRecord[] = [];
    const inMap = new Set<string>();
    for (const u of usersMap.values()) {
      inMap.add(u.id);
      if (!includeSelf && u.id === selfUserId) continue;
      const online = onlineUserIds.has(u.id);
      const voted = votedUserIds.has(u.id);
      if (online || voted) arr.push(u);
    }
    const syntheticSeen = new Set(arr.map((u) => u.id));
    for (const uid of onlineUserIds) {
      if (!includeSelf && uid === selfUserId) continue;
      if (inMap.has(uid) || syntheticSeen.has(uid)) continue;
      syntheticSeen.add(uid);
      arr.push({
        id: uid,
        name: fallbackDisplayName(uid),
        mode: "idle",
      });
    }
    for (const uid of votedUserIds) {
      if (!includeSelf && uid === selfUserId) continue;
      if (syntheticSeen.has(uid)) continue;
      syntheticSeen.add(uid);
      arr.push({
        id: uid,
        name: fallbackDisplayName(uid),
        mode: "idle",
      });
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
  }, [usersMap, onlineUserIds, votedUserIds, selfUserId, includeSelf]);

  useEffect(() => {
    if (variant !== "tabStrip" || selectedVoterId == null) return;
    if (visible.some((u) => u.id === selectedVoterId)) return;
    onInvalidateVoterSelection?.();
  }, [variant, visible, selectedVoterId, onInvalidateVoterSelection]);

  if (variant === "tabStrip") {
    return (
      <div role="group" aria-label="Voters" className="flex w-full flex-nowrap overflow-x-auto bg-surface-2">
        {visible.length === 0 ? (
          <div className="flex min-h-9 min-w-full shrink-0 items-center px-3 py-2 text-sm text-muted sm:min-w-0">
            No voters yet.
          </div>
        ) : (
          visible.map((u) => {
            const selected = selectedVoterId === u.id;
            return (
              <div
                key={u.id}
                className={`flex shrink-0 border-r border-border last:border-r-0 ${
                  selected ? "ring-2 ring-inset ring-accent" : ""
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onToggleVoter?.(u.id)}
                  className="min-h-9 w-full text-left outline-none transition-shadow focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <UserPill
                    user={u}
                    variant="tab"
                    showIgnoredBadge={showIgnoredBadge}
                    state={pillStateFor(
                      u,
                      onlineUserIds.has(u.id),
                      votedUserIds.has(u.id),
                    )}
                    isYou={u.id === selfUserId}
                  />
                </button>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.length === 0 ? (
        <span className="text-xs text-muted">No voters yet.</span>
      ) : (
        visible.map((u) => (
          <UserPill
            key={u.id}
            user={u}
            showIgnoredBadge={showIgnoredBadge}
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

function fallbackDisplayName(userId: string): string {
  return fallbackVoterName(userId);
}
