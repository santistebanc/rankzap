import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RoomClient,
  type ResolveKey,
  type Status,
} from "room-server/client";
import { ROOM_TTL_SEC } from "./types";
import { ROOM_SCHEMAS, SCHEMA_VERSION, type RoomSchema } from "./schemas";

const HOST = import.meta.env.VITE_HOST;
const API_KEY = import.meta.env.VITE_API_KEY;

if (!HOST || !API_KEY) {
  console.error(
    "[rankzap] Missing VITE_HOST or VITE_API_KEY — set them in .env or repo secrets.",
  );
}

export type TypedRoomClient = RoomClient<RoomSchema>;

// ── Module-level RoomClient cache ───────────────────────────────────────────
// Reference-counted, cached by roomId. Survives React strict-mode double-mount
// and is torn down via flushAndDisconnect when the last consumer releases.
//
// userId only affects how the SDK identifies this connection in the
// presence/* namespace; admin tabs omit it. Different tabs live in separate
// JS contexts so cache key is just the roomId.
interface CacheEntry {
  client: TypedRoomClient;
  refcount: number;
  disposeTimer: ReturnType<typeof setTimeout> | null;
}
const clientCache = new Map<string, CacheEntry>();

function acquireEntry(roomId: string, userId?: string): CacheEntry {
  let entry = clientCache.get(roomId);
  if (!entry) {
    const client = new RoomClient<RoomSchema>({
      host: HOST,
      roomId,
      config: { apiKey: API_KEY, persistence: "durable", userId },
      schemas: { server: ROOM_SCHEMAS, version: SCHEMA_VERSION },
    });
    entry = { client, refcount: 0, disposeTimer: null };
    clientCache.set(roomId, entry);
  }
  if (entry.disposeTimer) {
    clearTimeout(entry.disposeTimer);
    entry.disposeTimer = null;
  }
  entry.refcount++;
  return entry;
}

function releaseEntry(roomId: string): void {
  const entry = clientCache.get(roomId);
  if (!entry) return;
  entry.refcount--;
  if (entry.refcount > 0) return;
  entry.disposeTimer = setTimeout(() => {
    if (entry.refcount === 0) {
      entry.client.flushAndDisconnect(2_000).catch(() => {
        try {
          entry.client.disconnect();
        } catch {
          /* ignore */
        }
      });
      clientCache.delete(roomId);
    }
  }, 200);
}

export type ConnStatus = Status;

interface RoomContextValue {
  client: TypedRoomClient;
  roomId: string;
  status: ConnStatus;
}

const RoomContext = createContext<RoomContextValue | null>(null);

interface RoomProviderProps {
  roomId: string;
  /** Optional stable user identity propagated to presence/{connId}.userId. */
  userId?: string;
  children: ReactNode;
}

/**
 * Provide a room-scoped {@link RoomClient}. When `roomId` changes, the parent
 * should remount this provider (e.g. `key={roomId}`) so the ref-counted cache
 * swaps to the correct client and subtree state resets.
 */
export function RoomProvider({ roomId, userId, children }: RoomProviderProps) {
  const entryRef = useRef<CacheEntry | null>(null);
  if (entryRef.current === null) {
    entryRef.current = acquireEntry(roomId, userId);
  }
  const entry = entryRef.current;
  const client = entry.client;
  const [status, setStatus] = useState<ConnStatus>(client.status);

  useEffect(() => {
    setStatus(client.status);
    const unsub = client.on("status", (s) => setStatus(s));
    client.ready(15_000).catch(() => {
      /* status handler reflects "reconnecting"/"closed" */
    });
    return unsub;
  }, [client]);

  useEffect(() => {
    return () => {
      releaseEntry(roomId);
      entryRef.current = null;
    };
  }, [roomId]);

  const value = useMemo<RoomContextValue>(
    () => ({ client, roomId, status }),
    [client, roomId, status],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used inside <RoomProvider>");
  return ctx;
}

/**
 * Subscribe to a single key with atomic snapshot+subscribe in one round trip.
 * Own writes echo back via includeSelf so the change handler is the only
 * update path. Type-narrowed against RoomSchema.
 */
export function useRoomValue<K extends string>(
  key: K,
): {
  // undefined = still loading; null = loaded but key doesn't exist; V = loaded with value
  value: ResolveKey<RoomSchema, K> | null | undefined;
  setLocal: (next: ResolveKey<RoomSchema, K> | null | undefined) => void;
} {
  type V = ResolveKey<RoomSchema, K>;
  const { client, status } = useRoom();
  const [value, setValue] = useState<V | null | undefined>(undefined);

  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    let unsubscribe: (() => void) | null = null;

    client
      .subscribeWithSnapshotKey<K>(
        key,
        (e) => {
          if (!alive) return;
          if (e.type === "delete") setValue(null);
          else setValue(e.value);
        },
        { includeSelf: true },
      )
      .then((res) => {
        if (!alive) {
          res.unsubscribe();
          return;
        }
        unsubscribe = res.unsubscribe;
        const v = res.initial.value;
        // null means key doesn't exist — signal "loaded" so consumers don't wait forever
        setValue(v !== null && v !== undefined ? v : null);
      })
      .catch((e) => console.warn("[rankzap] subscribeWithSnapshotKey failed:", e));

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [client, status, key]);

  const setLocal = useCallback((next: V | null | undefined) => setValue(next), []);

  return { value, setLocal };
}

/**
 * Subscribe to all keys with a given prefix. Atomic snapshot+subscribe in one
 * round trip; own writes echo back. Map keys are full paths
 * (e.g. "votes/abc"), values are type-narrowed against RoomSchema.
 *
 * The server caps the initial snapshot at 1000 entries per prefix (documented
 * trade-off — see room-server v3.1 README). For this app each prefix tops out
 * at typical poll sizes, so it's never close. If you need to cross 1000, shard
 * at write time and run N concurrent subscriptions.
 */
export function useRoomList<K extends string>(
  prefix: K,
): Map<string, ResolveKey<RoomSchema, K>> {
  type V = ResolveKey<RoomSchema, K>;
  const { client, status } = useRoom();
  const [items, setItems] = useState<Map<string, V>>(() => new Map());

  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    setItems(new Map());

    client
      .subscribeWithSnapshotPrefix<K>(
        prefix,
        (e) => {
          if (!alive) return;
          setItems((prev) => {
            const next = new Map(prev);
            // v3.2+: delete events carry priorValue; we key by full path so eviction is by e.key alone.
            if (e.type === "delete") next.delete(e.key);
            else next.set(e.key, e.value);
            return next;
          });
        },
        { includeSelf: true },
      )
      .then((res) => {
        if (!alive) {
          res.unsubscribe();
          return;
        }
        unsubscribe = res.unsubscribe;
        if (res.initial.truncated) {
          console.warn(
            `[rankzap] prefix "${prefix}" exceeded snapshot limit (1000 entries); some entries may be missing until next change.`,
          );
        }
        setItems((prev) => {
          const next = new Map(prev);
          for (const [k, v] of Object.entries(res.initial.entries)) {
            next.set(k, v as V);
          }
          return next;
        });
      })
      .catch((e) => console.warn("[rankzap] subscribeWithSnapshotPrefix failed:", e));

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [client, status, prefix]);

  return items;
}

/**
 * Default TTL set on every write so abandoned polls auto-expire.
 * Admin edits naturally refresh this; voters touch meta on connect.
 */
export const SET_OPTS = { ttl: ROOM_TTL_SEC } as const;

/**
 * Refresh a key's TTL without changing its value. Single round trip.
 */
export async function touchKey(
  client: TypedRoomClient,
  key: string,
): Promise<void> {
  try {
    await client.touch(key, { ttl: ROOM_TTL_SEC });
  } catch {
    /* ignore — best effort */
  }
}
