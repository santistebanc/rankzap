import type { ClientMessage, PollAction, PollSnapshot, ServerMessage, Viewer } from "./protocol";
import { SUBMIT_TIMEOUT_MS } from "./types";

export type ConnStatus = "connecting" | "ready" | "reconnecting" | "closed";

/** Why the server refused an action, or why it never got an answer. */
export class PollActionError extends Error {}

interface Pending {
  resolve: () => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type Listener = () => void;

/**
 * A live connection to one poll. Reconnects with backoff, keeps the latest
 * snapshot, and turns actions into promises that settle on the server's reply.
 */
export class PollConnection {
  status: ConnStatus = "connecting";
  snapshot: PollSnapshot | null = null;
  you: Viewer | null = null;
  /** Set when the poll doesn't exist (or was deleted). */
  missing = false;

  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<Listener>();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly url: string;

  constructor(pollId: string, who: { userId: string } | { hostKey: string }) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const query = "hostKey" in who ? `host=${encodeURIComponent(who.hostKey)}` : `user=${encodeURIComponent(who.userId)}`;
    this.url = `${proto}//${location.host}/api/polls/${encodeURIComponent(pollId)}/ws?${query}`;
    this.open();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sends an action. Resolves once the server has applied it. */
  send(action: PollAction): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new PollActionError("Not connected. Check your connection and try again."));
    }
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new PollActionError("The server didn't answer. Try again."));
      }, SUBMIT_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, action } satisfies ClientMessage));
    });
  }

  close(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close(1000);
    this.ws = null;
    this.failPending("Disconnected.");
    this.setStatus("closed");
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (e) => this.onMessage(e.data);
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending("Connection lost. Try again.");
      // 4004: the poll was deleted while we were connected.
      if (e.code === 4004) {
        this.missing = true;
        this.setStatus("closed");
        return;
      }
      if (this.stopped) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.setStatus(this.snapshot ? "reconnecting" : "connecting");
    const delay = Math.min(10_000, 500 * 2 ** this.retry) * (0.75 + Math.random() * 0.5);
    this.retry++;
    // After a few failed tries before ever loading, check whether the poll exists at all.
    if (!this.snapshot && this.retry === 3) void this.checkExists();
    this.retryTimer = setTimeout(() => {
      if (!this.stopped) this.open();
    }, delay);
  }

  private async checkExists(): Promise<void> {
    try {
      const res = await fetch(this.url.replace(/^ws/, "http").replace(/\/ws\?.*$/, ""));
      if (res.status === 404) {
        this.missing = true;
        this.stopped = true;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.setStatus("closed");
      }
    } catch {
      /* offline: keep retrying */
    }
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === "snapshot") {
      this.snapshot = msg.poll;
      this.you = msg.you;
      this.retry = 0;
      this.setStatus("ready");
      return;
    }
    if (msg.type === "result") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve();
      else p.reject(new PollActionError(msg.error));
    }
  }

  private failPending(reason: string): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new PollActionError(reason));
    }
    this.pending.clear();
  }

  /** Bumped on every change, for useSyncExternalStore. */
  version = 0;

  private setStatus(status: ConnStatus): void {
    this.status = status;
    this.version++;
    for (const l of this.listeners) l();
  }
}
