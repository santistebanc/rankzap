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
export const TALLY_MODE_INFO: Record<
  TallyMode,
  { title: string; summary: string }
> = {
  borda: {
    title: "Borda Count",
    summary: "Rewards broadly liked options, higher ranks earn more points.",
  },
  dowdall: {
    title: "Dowdall",
    summary: "Strongly favors first choices while still counting lower ranks.",
  },
  copeland: {
    title: "Copeland",
    summary: "Compares options head to head, strongest in direct matchups wins.",
  },
};

export type PollState = "open" | "closed";

export type PollColour =
  | "yellow"
  | "lime"
  | "mint"
  | "sky"
  | "cobalt"
  | "pink"
  | "tomato"
  | "orange";
export const DEFAULT_POLL_COLOUR: PollColour = "yellow";
/**
 * `sig` fills the page, `ink` is text on `sig`, `fg` is the colour used as
 * text or fill on black (lighter where `sig` is too dark to read on black).
 */
export const POLL_COLOURS: Record<
  PollColour,
  { name: string; sig: string; ink: string; fg: string }
> = {
  yellow: { name: "Yellow", sig: "#ffdd1f", ink: "#0b0b0b", fg: "#ffdd1f" },
  lime: { name: "Lime", sig: "#c8f031", ink: "#0b0b0b", fg: "#c8f031" },
  mint: { name: "Mint", sig: "#2fdc8e", ink: "#0b0b0b", fg: "#2fdc8e" },
  sky: { name: "Sky", sig: "#4db6ff", ink: "#0b0b0b", fg: "#4db6ff" },
  cobalt: { name: "Cobalt", sig: "#2d4bff", ink: "#ffffff", fg: "#8b9bff" },
  pink: { name: "Pink", sig: "#ff6ac1", ink: "#0b0b0b", fg: "#ff6ac1" },
  tomato: { name: "Tomato", sig: "#ff4a2b", ink: "#0b0b0b", fg: "#ff6a50" },
  orange: { name: "Orange", sig: "#ff8a1f", ink: "#0b0b0b", fg: "#ff8a1f" },
};
export const POLL_COLOUR_IDS = Object.keys(POLL_COLOURS) as PollColour[];

export function pollColourOf(value: unknown): PollColour {
  return typeof value === "string" && value in POLL_COLOURS
    ? (value as PollColour)
    : DEFAULT_POLL_COLOUR;
}

/** Optional poll title from room bootstrap; prefer `Settings.ballotTitle` for the heading. */
export interface Meta {
  title: string;
  state: PollState;
  createdAt: number;
}

export interface Settings {
  tallyMode: TallyMode;
  /**
   * Poll heading shown to admins and voters (optional).
   * Stored under the key `ballotTitle` for backward compatibility with existing rooms.
   */
  ballotTitle: string;
  showLiveResults: boolean;
  allowRevote: boolean;
  allowAdd: boolean;
  showUsers: boolean;
  showVoterVotes: boolean;
  /** Poll colour picked by the host. Missing on older rooms; read it with `pollColourOf`. */
  colour?: PollColour;
}

export interface Option {
  id: string;
  text: string;
  addedBy: string;
  addedAt: number;
}

export type UserMode = "idle" | "voting" | "editing";

// `lastSeen` is gone in v3.1: presence/{connId} answers "is this socket alive?".
// users/{userId} records the persistent identity (name + current mode).
export interface UserRecord {
  id: string;
  name: string;
  mode: UserMode;
  ignored?: boolean;
}

export interface Vote {
  userId: string;
  ranking: string[];
  submittedAt: number;
  ignored?: boolean;
}

export const DEFAULT_META = (): Meta => ({
  title: "",
  state: "open",
  createdAt: Date.now(),
});

export const DEFAULT_SETTINGS = (): Settings => ({
  tallyMode: "borda",
  ballotTitle: "",
  showLiveResults: true,
  allowRevote: true,
  allowAdd: true,
  showUsers: true,
  showVoterVotes: false,
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
