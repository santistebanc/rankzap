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

export const getAdminLastRoomId = (): string | null => safeGet(K_ADMIN_LAST_ROOM);
export const setAdminLastRoomId = (id: string): void => safeSet(K_ADMIN_LAST_ROOM, id);
export const clearAdminLastRoomId = (): void => safeRemove(K_ADMIN_LAST_ROOM);

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
