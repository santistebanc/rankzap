import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { RoomClient } from "room-server/client";
import {
  DEFAULT_META,
  DEFAULT_SETTINGS,
  HOME_TIMEOUT_MS,
  ROOM_TTL_SEC,
} from "../lib/types";
import { ROOM_SCHEMAS, SCHEMA_VERSION, type RoomSchema } from "../lib/schemas";
import { getAdminLastRoomId, setAdminLastRoomId } from "../lib/storage";

const HOST = import.meta.env.VITE_HOST;
const API_KEY = import.meta.env.VITE_API_KEY;

const newRoomClient = (roomId: string) =>
  new RoomClient<RoomSchema>({
    host: HOST,
    roomId,
    config: { apiKey: API_KEY, persistence: "durable" },
    schemas: { server: ROOM_SCHEMAS, version: SCHEMA_VERSION },
  });

const SET_OPTS = { ttl: ROOM_TTL_SEC } as const;

async function tryResume(): Promise<string | null> {
  const lastId = getAdminLastRoomId();
  if (!lastId) return null;
  const c = newRoomClient(lastId);
  try {
    await c.ready(5_000);
    const meta = await c.get("meta");
    if (meta.value !== null && meta.value !== undefined) return lastId;
    return null;
  } catch {
    return null;
  } finally {
    try {
      c.flushAndDisconnect(1_000);
    } catch {
      /* ignore */
    }
  }
}

async function createRoom(): Promise<string> {
  // Generate, atomically reserve via room.reserve() with a TTL so abandoned
  // attempts (browser closed, network drop) are reaped automatically rather
  // than holding their id forever. Expand id length if collisions persist.
  for (let attempt = 0; attempt < 22; attempt++) {
    const length = attempt < 20 ? 6 : 8;
    const candidate = nanoid(length);
    const c = newRoomClient(candidate);
    try {
      await c.ready(5_000);
      const reserved = await c.reserve("meta", DEFAULT_META(), {
        ttl: ROOM_TTL_SEC,
      });
      if (reserved) {
        await c.set("settings", DEFAULT_SETTINGS(), SET_OPTS).catch(() => {});
        return candidate;
      }
    } catch {
      /* try next */
    } finally {
      try {
        c.flushAndDisconnect(1_000);
      } catch {
        /* ignore */
      }
    }
  }
  throw new Error("Couldn't reserve a room id after 22 attempts.");
}

export function Home() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    setError(null);

    const overall = setTimeout(() => {
      if (aliveRef.current) {
        setError("Couldn't connect to the server.");
      }
    }, HOME_TIMEOUT_MS);

    (async () => {
      try {
        const resumed = await tryResume();
        if (!aliveRef.current) return;
        if (resumed) {
          clearTimeout(overall);
          navigate(`/admin/${resumed}`, { replace: true });
          return;
        }
        const fresh = await createRoom();
        if (!aliveRef.current) return;
        setAdminLastRoomId(fresh);
        clearTimeout(overall);
        navigate(`/admin/${fresh}`, { replace: true });
      } catch (e) {
        if (aliveRef.current) {
          setError(e instanceof Error ? e.message : "Couldn't create a poll.");
        }
        clearTimeout(overall);
      }
    })();

    return () => {
      aliveRef.current = false;
      clearTimeout(overall);
    };
  }, [navigate, retryToken]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        {error ? (
          <>
            <div className="text-lg font-medium">Couldn't connect</div>
            <p className="text-sm text-muted">{error}</p>
            <button
              type="button"
              onClick={() => setRetryToken((n) => n + 1)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Retry
            </button>
          </>
        ) : (
          <>
            <Spinner />
            <p className="text-sm text-muted">Setting up your poll…</p>
          </>
        )}
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="size-8 animate-spin rounded-full border-2 border-border border-t-accent"
    />
  );
}
