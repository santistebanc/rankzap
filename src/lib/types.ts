export const TITLE_MAX = 100;
export const OPTION_MAX = 200;
export const NAME_MAX = 32;
export const SUBMIT_TIMEOUT_MS = 10_000;
export const HOME_TIMEOUT_MS = 8_000;
export const ROOM_TTL_SEC = 30 * 24 * 60 * 60;
export const PASTE_THROTTLE_MS = 50;

export type TallyMode = "borda" | "dowdall" | "copeland";
export const TALLY_MODES: TallyMode[] = ["borda", "dowdall", "copeland"];
export const TALLY_MODE_LABELS: Record<TallyMode, string> = {
  borda: "Borda Count",
  dowdall: "Dowdall",
  copeland: "Copeland",
};

export type PollState = "open" | "closed";

export interface Meta {
  title: string;
  state: PollState;
  createdAt: number;
}

export interface Settings {
  tallyMode: TallyMode;
  showLiveResults: boolean;
  allowRevote: boolean;
  allowAdd: boolean;
  showUsers: boolean;
}

export interface Option {
  id: string;
  text: string;
  addedBy: string;
  addedAt: number;
}

export type UserMode = "idle" | "voting";

// `lastSeen` is gone in v3.1: presence/{connId} answers "is this socket alive?".
// users/{userId} records the persistent identity (name + current mode).
export interface UserRecord {
  id: string;
  name: string;
  mode: UserMode;
}

export interface Vote {
  userId: string;
  ranking: string[];
  submittedAt: number;
}

export const DEFAULT_META = (): Meta => ({
  title: "Rank the options",
  state: "open",
  createdAt: Date.now(),
});

export const DEFAULT_SETTINGS = (): Settings => ({
  tallyMode: "borda",
  showLiveResults: true,
  allowRevote: true,
  allowAdd: true,
  showUsers: true,
});

export function clampTitle(s: string): string {
  return s.trim().slice(0, TITLE_MAX);
}
export function clampOption(s: string): string {
  return s.trim().slice(0, OPTION_MAX);
}
export function clampName(s: string): string {
  return s.trim().slice(0, NAME_MAX);
}
