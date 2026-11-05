import { DurableObject } from "cloudflare:workers";
import {
  clampName,
  clampOption,
  clampTitle,
  DEFAULT_SETTINGS,
  POLL_COLOUR_IDS,
  TALLY_MODES,
  type Option,
  type PollColour,
  type Settings,
  type UserMode,
  type UserRecord,
  type Vote,
} from "../src/lib/types";
import type {
  ClientMessage,
  PollAction,
  PollSnapshot,
  PollSummary,
  ServerMessage,
  Viewer,
} from "../src/lib/protocol";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A poll nobody has touched in this long is deleted. */
const IDLE_TTL_MS = 30 * DAY_MS;
/** A poll that was created but never set up or joined is deleted sooner. */
const UNTOUCHED_TTL_MS = DAY_MS;

const MAX_OPTIONS = 200;
const MAX_USERS = 1000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const USER_MODES: UserMode[] = ["idle", "voting", "editing"];

/** What's kept in storage. `online` is worked out from live sockets instead. */
interface StoredPoll {
  id: string;
  state: PollSnapshot["state"];
  createdAt: number;
  lastActivity: number;
  settings: Settings;
  options: Option[];
  users: Record<string, UserRecord>;
  votes: Record<string, Vote>;
}

/** Stored on each socket so it survives hibernation. */
type Attachment = Viewer;

class ActionError extends Error {}

/**
 * One poll. Holds the whole poll in memory and in storage, accepts actions
 * from its sockets, and sends every socket a fresh snapshot after each change.
 */
export class PollRoom extends DurableObject<Env> {
  private poll: StoredPoll | null = null;
  private hostKey: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.poll = (await ctx.storage.get<StoredPoll>("poll")) ?? null;
      this.hostKey = (await ctx.storage.get<string>("hostKey")) ?? null;
    });
  }

  // ── Called by the Worker ────────────────────────────────────────────────

  /** Set up a new poll. Returns false if this id is already in use. */
  async create(id: string, hostKey: string, colour: PollColour | undefined): Promise<boolean> {
    if (this.poll) return false;
    const now = Date.now();
    this.poll = {
      id,
      state: "open",
      createdAt: now,
      lastActivity: now,
      settings: { ...DEFAULT_SETTINGS(), ...(colour ? { colour } : {}) },
      options: [],
      users: {},
      votes: {},
    };
    this.hostKey = hostKey;
    await this.ctx.storage.put({ poll: this.poll, hostKey });
    await this.ctx.storage.setAlarm(now + UNTOUCHED_TTL_MS);
    return true;
  }

  async summary(): Promise<PollSummary | null> {
    const p = this.poll;
    if (!p) return null;
    return {
      id: p.id,
      title: p.settings.ballotTitle,
      colour: p.settings.colour,
      state: p.state,
      optionsPreview: p.options.slice(0, 6).map((o) => o.text),
    };
  }

  async destroy(hostKey: string): Promise<boolean> {
    if (!this.poll) return true;
    if (!this.isHostKey(hostKey)) return false;
    await this.wipe();
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    if (!this.poll) return new Response("No such poll", { status: 404 });

    const url = new URL(request.url);
    const isHost = this.isHostKey(url.searchParams.get("host") ?? "");
    const rawUser = url.searchParams.get("user") ?? "";
    const userId = !isHost && /^[A-Za-z0-9_-]{1,32}$/.test(rawUser) ? rawUser : null;
    if (!isHost && !userId) return new Response("Missing user id", { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, isHost } satisfies Attachment);
    // Everyone sees the new arrival in `online`.
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── WebSocket events (hibernation API) ─────────────────────────────────

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg?.id !== "number" || typeof msg.action?.type !== "string") return;

    const viewer = ws.deserializeAttachment() as Attachment;
    try {
      const changed = this.apply(msg.action, viewer);
      if (changed) await this.save();
      send(ws, { type: "result", id: msg.id, ok: true });
      if (changed) this.broadcast();
    } catch (e) {
      const error = e instanceof ActionError ? e.message : "Something went wrong.";
      if (!(e instanceof ActionError)) console.error("[rankzap] action failed", e);
      send(ws, { type: "result", id: msg.id, ok: false, error });
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "closing");
    } catch {
      /* already closed */
    }
    this.broadcast(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcast(ws);
  }

  async alarm(): Promise<void> {
    const p = this.poll;
    if (!p) return;
    const now = Date.now();
    const untouched =
      !p.settings.ballotTitle && p.options.length === 0 && Object.keys(p.users).length === 0;
    const deadline = untouched ? p.createdAt + UNTOUCHED_TTL_MS : p.lastActivity + IDLE_TTL_MS;
    if (now >= deadline && this.ctx.getWebSockets().length === 0) {
      await this.wipe();
    } else {
      await this.ctx.storage.setAlarm(Math.max(deadline, now + 60_000));
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────

  /** Applies an action to the poll. Returns whether anything changed. */
  private apply(action: PollAction, viewer: Viewer): boolean {
    const p = this.poll;
    if (!p) throw new ActionError("This poll no longer exists.");

    if (action.type === "join" || action.type === "vote") {
      if (!viewer.userId) throw new ActionError("Only voters can do that.");
      return action.type === "join"
        ? this.join(p, viewer.userId, action.name, action.mode)
        : this.vote(p, viewer.userId, action.ranking, action.newOptions);
    }

    if (!viewer.isHost) throw new ActionError("Only the host can do that.");
    switch (action.type) {
      case "addOptions": {
        const texts = asArray(action.texts).map((t) => clampOption(asString(t))).filter(Boolean);
        if (texts.length === 0) return false;
        if (p.options.length + texts.length > MAX_OPTIONS) throw new ActionError(`A poll can have up to ${MAX_OPTIONS} options.`);
        const now = Date.now();
        texts.forEach((text, i) => p.options.push({ id: newId(), text, addedBy: "admin", addedAt: now + i }));
        return true;
      }
      case "editOption": {
        const option = p.options.find((o) => o.id === action.id);
        const text = clampOption(asString(action.text));
        if (!option || !text || option.text === text) return false;
        option.text = text;
        return true;
      }
      case "removeOption": {
        const before = p.options.length;
        p.options = p.options.filter((o) => o.id !== action.id);
        return p.options.length !== before;
      }
      case "updateSettings":
        p.settings = { ...p.settings, ...cleanSettings(action.patch) };
        return true;
      case "setState":
        if (action.state !== "open" && action.state !== "closed") throw new ActionError("Unknown poll state.");
        if (p.state === action.state) return false;
        p.state = action.state;
        return true;
      case "resetVotes":
        if (Object.keys(p.votes).length === 0) return false;
        p.votes = {};
        return true;
      case "setIgnored": {
        const user = p.users[asString(action.userId)];
        if (!user) return false;
        const ignored = Boolean(action.ignored);
        user.ignored = ignored;
        const vote = p.votes[user.id];
        if (vote) vote.ignored = ignored;
        return true;
      }
      case "deleteVote": {
        const id = asString(action.userId);
        if (!p.votes[id]) return false;
        delete p.votes[id];
        return true;
      }
      default:
        throw new ActionError("Unknown action.");
    }
  }

  private join(p: StoredPoll, userId: string, rawName: unknown, rawMode: unknown): boolean {
    const name = clampName(asString(rawName)) || "Voter";
    const mode: UserMode = USER_MODES.includes(rawMode as UserMode) ? (rawMode as UserMode) : "idle";
    const existing = p.users[userId];
    if (existing && existing.name === name && existing.mode === mode) return false;
    if (!existing && Object.keys(p.users).length >= MAX_USERS) throw new ActionError("This poll is full.");
    p.users[userId] = { id: userId, name, mode, ignored: existing?.ignored ?? false };
    return true;
  }

  private vote(p: StoredPoll, userId: string, rawRanking: unknown, rawNewOptions: unknown): boolean {
    if (p.state !== "open") throw new ActionError("This poll is closed.");
    if (!p.users[userId]) throw new ActionError("Join the poll before voting.");
    const previous = p.votes[userId];
    if (previous && !p.settings.allowRevote) throw new ActionError("Changing your vote is turned off for this poll.");

    // Options the voter added while ranking are saved together with the vote.
    const newOptions = asArray(rawNewOptions);
    if (newOptions.length > 0) {
      if (!p.settings.allowAdd) throw new ActionError("Adding options is turned off for this poll.");
      if (p.options.length + newOptions.length > MAX_OPTIONS) throw new ActionError(`A poll can have up to ${MAX_OPTIONS} options.`);
      const known = new Set(p.options.map((o) => o.id));
      const now = Date.now();
      newOptions.forEach((raw, i) => {
        const id = asString((raw as { id?: unknown })?.id);
        const text = clampOption(asString((raw as { text?: unknown })?.text));
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || known.has(id) || !text) return;
        known.add(id);
        p.options.push({ id, text, addedBy: userId, addedAt: now + i });
      });
    }

    const valid = new Set(p.options.map((o) => o.id));
    const ranking = [...new Set(asArray(rawRanking).map(asString))].filter((id) => valid.has(id));
    if (ranking.length === 0) throw new ActionError("Rank at least one option.");
    p.votes[userId] = {
      userId,
      ranking,
      submittedAt: Date.now(),
      ignored: p.users[userId].ignored ?? false,
    };
    return true;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private isHostKey(key: string): boolean {
    return Boolean(this.hostKey) && key.length > 0 && timingSafeEqual(key, this.hostKey!);
  }

  private async save(): Promise<void> {
    const p = this.poll!;
    p.lastActivity = Date.now();
    await this.ctx.storage.put("poll", p);
    await this.ctx.storage.setAlarm(p.lastActivity + IDLE_TTL_MS);
  }

  private async wipe(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4004, "Poll deleted");
      } catch {
        /* already closed */
      }
    }
    this.poll = null;
    this.hostKey = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private snapshot(online: string[]): PollSnapshot {
    const p = this.poll!;
    return {
      id: p.id,
      state: p.state,
      createdAt: p.createdAt,
      settings: p.settings,
      options: p.options,
      users: Object.values(p.users),
      votes: Object.values(p.votes),
      online,
    };
  }

  /** Sends every open socket (except `leaving`) the current poll. */
  private broadcast(leaving?: WebSocket): void {
    if (!this.poll) return;
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== leaving);
    const online = new Set<string>();
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.userId) online.add(a.userId);
    }
    const poll = this.snapshot([...online]);
    for (const ws of sockets) {
      send(ws, { type: "snapshot", poll, you: ws.deserializeAttachment() as Attachment });
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* socket closing */
  }
}

/** Keeps only known settings with the right types. */
function cleanSettings(patch: unknown): Partial<Settings> {
  const p = (patch ?? {}) as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (TALLY_MODES.includes(p.tallyMode as Settings["tallyMode"])) out.tallyMode = p.tallyMode as Settings["tallyMode"];
  if (typeof p.ballotTitle === "string") out.ballotTitle = clampTitle(p.ballotTitle);
  if (POLL_COLOUR_IDS.includes(p.colour as PollColour)) out.colour = p.colour as PollColour;
  for (const key of ["showLiveResults", "allowRevote", "allowAdd", "showUsers", "showVoterVotes"] as const) {
    if (typeof p[key] === "boolean") out[key] = p[key] as boolean;
  }
  return out;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const newId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
