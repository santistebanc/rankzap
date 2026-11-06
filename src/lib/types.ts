export const TITLE_MAX = 100;
export const OPTION_MAX = 200;
export const NAME_MAX = 32;
export const SUBMIT_TIMEOUT_MS = 10_000;
export const HOME_TIMEOUT_MS = 8_000;

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
  | "teal"
  | "forest"
  | "sky"
  | "cobalt"
  | "navy"
  | "violet"
  | "lavender"
  | "pink"
  | "cherry"
  | "tomato"
  | "orange"
  | "peach"
  | "sand";
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
  teal: { name: "Teal", sig: "#14c4b0", ink: "#0b0b0b", fg: "#14c4b0" },
  forest: { name: "Forest", sig: "#1e7d4f", ink: "#ffffff", fg: "#4fd08b" },
  sky: { name: "Sky", sig: "#4db6ff", ink: "#0b0b0b", fg: "#4db6ff" },
  cobalt: { name: "Cobalt", sig: "#2d4bff", ink: "#ffffff", fg: "#8b9bff" },
  navy: { name: "Navy", sig: "#1b2a6b", ink: "#ffffff", fg: "#8b9bff" },
  violet: { name: "Violet", sig: "#7c4dff", ink: "#ffffff", fg: "#ab94ff" },
  lavender: { name: "Lavender", sig: "#c6a8ff", ink: "#0b0b0b", fg: "#c6a8ff" },
  pink: { name: "Pink", sig: "#ff6ac1", ink: "#0b0b0b", fg: "#ff6ac1" },
  cherry: { name: "Cherry", sig: "#e3194b", ink: "#ffffff", fg: "#ff6b8c" },
  tomato: { name: "Tomato", sig: "#ff4a2b", ink: "#0b0b0b", fg: "#ff6a50" },
  orange: { name: "Orange", sig: "#ff8a1f", ink: "#0b0b0b", fg: "#ff8a1f" },
  peach: { name: "Peach", sig: "#ffb08f", ink: "#0b0b0b", fg: "#ffb08f" },
  sand: { name: "Sand", sig: "#ead9b6", ink: "#0b0b0b", fg: "#ead9b6" },
};
export const POLL_COLOUR_IDS = Object.keys(POLL_COLOURS) as PollColour[];

export function pollColourOf(value: unknown): PollColour {
  return typeof value === "string" && value in POLL_COLOURS
    ? (value as PollColour)
    : DEFAULT_POLL_COLOUR;
}

/** Whether the poll is open, and when it was made. */
export interface Meta {
  state: PollState;
  createdAt: number;
}

export interface Settings {
  tallyMode: TallyMode;
  /** The poll question shown to the host and voters. Empty until the host writes one. */
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
