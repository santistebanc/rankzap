/**
 * Typed localStorage helpers with strict admin/voter namespacing.
 *
 * Every function is wrapped in try/catch — Safari Private mode throws on setItem,
 * and quota errors can happen on aggressive use. Failures silently no-op and
 * fall back to in-memory state for the session.
 *
 * Key layout (must stay in sync with the plan):
 *   voter:admin:lastRoomId          - last poll this browser CREATED
 *   voter:vote:userId               - global voter identity
 *   voter:vote:name                 - last entered display name
 *   voter:room:{roomId}:vote:rank   - voter's local drag order
 *   voter:room:{roomId}:vote:tally  - voter's local tally-mode override
 */

import type { TallyMode } from "./types";

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

const safeRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

// ── Admin: last created room ────────────────────────────────────────────────

const K_ADMIN_LAST_ROOM = "voter:admin:lastRoomId";
const K_ADMIN_RECENT_POLLS = "voter:admin:recentPolls";

export const getAdminLastRoomId = (): string | null => safeGet(K_ADMIN_LAST_ROOM);
export const setAdminLastRoomId = (id: string): void => safeSet(K_ADMIN_LAST_ROOM, id);
export const clearAdminLastRoomId = (): void => safeRemove(K_ADMIN_LAST_ROOM);

export interface RecentPollEntry {
  roomId: string;
  savedAt: number;
}

export const getRecentPolls = (): RecentPollEntry[] => {
  const raw = safeGet(K_ADMIN_RECENT_POLLS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is RecentPollEntry =>
          Boolean(x) &&
          typeof x.roomId === "string" &&
          x.roomId.length > 0 &&
          typeof x.savedAt === "number",
      )
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
};

export const setRecentPolls = (entries: RecentPollEntry[]): void => {
  safeSet(K_ADMIN_RECENT_POLLS, JSON.stringify(entries));
};

export const addRecentPoll = (roomId: string): void => {
  const now = Date.now();
  const next = getRecentPolls()
    .filter((x) => x.roomId !== roomId)
    .concat({ roomId, savedAt: now })
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 20);
  setRecentPolls(next);
};

/** Remove one poll from the recents list and clear admin last-room if it matches. */
export const removeRecentPoll = (roomId: string): void => {
  const next = getRecentPolls().filter((x) => x.roomId !== roomId);
  setRecentPolls(next);
  if (getAdminLastRoomId() === roomId) {
    clearAdminLastRoomId();
  }
};

// ── Voter: global identity ──────────────────────────────────────────────────

const K_VOTER_USER_ID = "voter:vote:userId";
const K_VOTER_NAME = "voter:vote:name";

export const getVoterUserId = (): string | null => safeGet(K_VOTER_USER_ID);
export const setVoterUserId = (id: string): void => safeSet(K_VOTER_USER_ID, id);

export const getVoterName = (): string | null => safeGet(K_VOTER_NAME);
export const setVoterName = (name: string): void => safeSet(K_VOTER_NAME, name);

// ── Voter: per-room drag order ──────────────────────────────────────────────

const rankKey = (roomId: string) => `voter:room:${roomId}:vote:rank`;

export const getVoterRank = (roomId: string): string[] | null => {
  const raw = safeGet(rankKey(roomId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return null;
  }
};

export const setVoterRank = (roomId: string, ranking: string[]): void => {
  safeSet(rankKey(roomId), JSON.stringify(ranking));
};

// ── Voter: per-room local tally override ────────────────────────────────────

const tallyKey = (roomId: string) => `voter:room:${roomId}:vote:tally`;

export const getVoterTally = (roomId: string): TallyMode | null => {
  const v = safeGet(tallyKey(roomId));
  return v === "borda" || v === "dowdall" || v === "copeland" ? v : null;
};

export const setVoterTally = (roomId: string, mode: TallyMode): void => {
  safeSet(tallyKey(roomId), mode);
};

/** Drop per-room voter prefs from this browser (rank + tally mode). */
export const clearPollLocalStorage = (roomId: string): void => {
  safeRemove(rankKey(roomId));
  safeRemove(tallyKey(roomId));
};
