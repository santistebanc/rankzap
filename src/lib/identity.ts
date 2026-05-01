import { nanoid } from "nanoid";
import { clampName } from "./types";
import { getVoterName, getVoterUserId, setVoterName, setVoterUserId } from "./storage";

export interface VoterIdentity {
  userId: string;
  /** Empty until the voter chooses a display name */
  name: string;
}

export function getOrCreateVoterIdentity(): VoterIdentity {
  let userId = getVoterUserId();
  if (!userId) {
    userId = nanoid(12);
    setVoterUserId(userId);
  }
  const stored = getVoterName();
  const name = stored ? clampName(stored) : "";
  return { userId, name };
}

export function persistVoterName(name: string): string {
  const clamped = clampName(name);
  setVoterName(clamped);
  return clamped;
}

export function fallbackVoterName(userId: string): string {
  const seed = userId.slice(0, 6);
  const n = Number.parseInt(seed, 36);
  const suffix = Number.isFinite(n) ? (n % 999) + 1 : 1;
  return `User ${suffix}`;
}
