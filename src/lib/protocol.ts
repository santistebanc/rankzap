/**
 * What the poll server and the app say to each other. Shared by the Worker
 * (worker/) and the browser, so it must not touch the DOM.
 */
import type { Option, PollColour, PollState, Settings, UserMode, UserRecord, Vote } from "./types";

/** Everything a client sees about a poll. Sent whole after every change. */
export interface PollSnapshot {
  id: string;
  state: PollState;
  createdAt: number;
  settings: Settings;
  /** In the order they were added. */
  options: Option[];
  users: UserRecord[];
  votes: Vote[];
  /** Voters with a live connection right now. */
  online: string[];
}

/** Who this connection is, as the server sees it. */
export interface Viewer {
  userId: string | null;
  isHost: boolean;
}

export type PollAction =
  // Any voter, about themselves.
  | { type: "join"; name: string; mode: UserMode }
  | { type: "vote"; ranking: string[]; newOptions: { id: string; text: string }[] }
  // Host only.
  | { type: "addOptions"; texts: string[] }
  | { type: "editOption"; id: string; text: string }
  | { type: "removeOption"; id: string }
  | { type: "updateSettings"; patch: Partial<Settings> }
  | { type: "setState"; state: PollState }
  | { type: "resetVotes" }
  | { type: "setIgnored"; userId: string; ignored: boolean }
  | { type: "deleteVote"; userId: string };

export type ClientMessage = { id: number; action: PollAction };

export type ServerMessage =
  | { type: "snapshot"; poll: PollSnapshot; you: Viewer }
  | { type: "result"; id: number; ok: true }
  | { type: "result"; id: number; ok: false; error: string };

/** GET /api/polls/:id — enough for the recent-polls list on Home. */
export interface PollSummary {
  id: string;
  title: string;
  colour: PollColour | undefined;
  state: PollState;
  optionsPreview: string[];
}

/** POST /api/polls */
export interface CreatePollRequest {
  colour?: PollColour;
}
export interface CreatePollResponse {
  id: string;
  hostKey: string;
}

export const POLL_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const POLL_ID_LENGTH = 4;
export const isPollId = (s: string): boolean =>
  s.length === POLL_ID_LENGTH && [...s].every((c) => POLL_ID_ALPHABET.includes(c));

/** Header the host sends to prove it made the poll. */
export const HOST_KEY_HEADER = "x-rankzap-host-key";
