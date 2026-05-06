/**
 * Typed localStorage helpers with strict admin/voter namespacing.
 *
 * Every function is wrapped in try/catch — Safari Private mode throws on setItem,
 * and quota errors can happen on aggressive use. Failures silently no-op and
 * fall back to in-memory state for the session.
 *
 * Key layout (must stay in sync with the plan):
 *   rankzap:admin:lastRoomId          - last poll this browser CREATED
 *   rankzap:vote:userId               - global voter identity
 *   rankzap:vote:name                 - last entered display name
 *   rankzap:room:{roomId}:vote:rank   - voter's local drag order
 *   rankzap:room:{roomId}:vote:tally  - voter's local tally-mode override
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

const NS = "rankzap";
const LEGACY_NS = "voter";
const withNs = (suffix: string) => `${NS}:${suffix}`;
const withLegacyNs = (suffix: string) => `${LEGACY_NS}:${suffix}`;
const safeGetCompat = (key: string, legacyKey: string): string | null =>
  safeGet(key) ?? safeGet(legacyKey);

// ── Admin: last created room ────────────────────────────────────────────────

const K_ADMIN_LAST_ROOM = withNs("admin:lastRoomId");
const K_ADMIN_LAST_ROOM_LEGACY = withLegacyNs("admin:lastRoomId");
const K_ADMIN_RECENT_POLLS = withNs("admin:recentPolls");
const K_ADMIN_RECENT_POLLS_LEGACY = withLegacyNs("admin:recentPolls");

export const getAdminLastRoomId = (): string | null =>
  safeGetCompat(K_ADMIN_LAST_ROOM, K_ADMIN_LAST_ROOM_LEGACY);
export const setAdminLastRoomId = (id: string): void => safeSet(K_ADMIN_LAST_ROOM, id);
export const clearAdminLastRoomId = (): void => safeRemove(K_ADMIN_LAST_ROOM);

export interface RecentPollEntry {
  roomId: string;
  savedAt: number;
}

export const getRecentPolls = (): RecentPollEntry[] => {
  const raw = safeGetCompat(K_ADMIN_RECENT_POLLS, K_ADMIN_RECENT_POLLS_LEGACY);
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

const K_VOTER_USER_ID = withNs("vote:userId");
const K_VOTER_USER_ID_LEGACY = withLegacyNs("vote:userId");
const K_VOTER_NAME = withNs("vote:name");
const K_VOTER_NAME_LEGACY = withLegacyNs("vote:name");

export const getVoterUserId = (): string | null =>
  safeGetCompat(K_VOTER_USER_ID, K_VOTER_USER_ID_LEGACY);
export const setVoterUserId = (id: string): void => safeSet(K_VOTER_USER_ID, id);

export const getVoterName = (): string | null =>
  safeGetCompat(K_VOTER_NAME, K_VOTER_NAME_LEGACY);
export const setVoterName = (name: string): void => safeSet(K_VOTER_NAME, name);

// ── Voter: per-room drag order ──────────────────────────────────────────────

const rankKey = (roomId: string) => withNs(`room:${roomId}:vote:rank`);
const rankKeyLegacy = (roomId: string) => withLegacyNs(`room:${roomId}:vote:rank`);

export const getVoterRank = (roomId: string): string[] | null => {
  const raw = safeGetCompat(rankKey(roomId), rankKeyLegacy(roomId));
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

const tallyKey = (roomId: string) => withNs(`room:${roomId}:vote:tally`);
const tallyKeyLegacy = (roomId: string) => withLegacyNs(`room:${roomId}:vote:tally`);

export const getVoterTally = (roomId: string): TallyMode | null => {
  const v = safeGetCompat(tallyKey(roomId), tallyKeyLegacy(roomId));
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
