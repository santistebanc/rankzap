import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { RoomClient } from "room-server/client";
import {
  DEFAULT_META,
  DEFAULT_SETTINGS,
  HOME_TIMEOUT_MS,
  ROOM_TTL_SEC,
} from "../lib/types";
import { ROOM_SCHEMAS, SCHEMA_VERSION, type RoomSchema } from "../lib/schemas";
import {
  addRecentPoll,
  clearPollLocalStorage,
  getRecentPolls,
  removeRecentPoll,
  setAdminLastRoomId,
  setRecentPolls,
  type RecentPollEntry,
} from "../lib/storage";

const HOST = import.meta.env.VITE_HOST;
const API_KEY = import.meta.env.VITE_API_KEY;

interface RecentPollView extends RecentPollEntry {
  title: string;
  optionsPreview: string[];
}

const newRoomClient = (roomId: string) =>
  new RoomClient<RoomSchema>({
    host: HOST,
    roomId,
    config: { apiKey: API_KEY, persistence: "durable" },
    schemas: { server: ROOM_SCHEMAS, version: SCHEMA_VERSION },
  });

const SET_OPTS = { ttl: ROOM_TTL_SEC } as const;

function formatLastOpened(ts: number): string {
  const diffMs = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "opened just now";
  if (diffMs < hour) return `opened ${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `opened ${Math.floor(diffMs / hour)}h ago`;
  return `opened ${Math.floor(diffMs / day)}d ago`;
}

async function checkRoomAvailable(roomId: string): Promise<boolean> {
  const c = newRoomClient(roomId);
  try {
    await c.ready(5_000);
    const meta = await c.get("meta");
    return meta.value !== null && meta.value !== undefined;
  } catch {
    return false;
  } finally {
    try {
      c.flushAndDisconnect(1_000);
    } catch {
      /* ignore */
    }
  }
}

async function fetchRecentPollInfo(
  roomId: string,
): Promise<{ title: string; optionsPreview: string[] } | null> {
  const c = newRoomClient(roomId);
  try {
    await c.ready(5_000);
    const meta = await c.get("meta");
    if (!meta.value) return null;
    const settings = await c.get("settings");
    const optionsRes = await c.subscribeWithSnapshotPrefix(
      "options/",
      () => {
        // one-shot snapshot read
      },
      { includeSelf: false },
    );
    const usersRes = await c.subscribeWithSnapshotPrefix(
      "users/",
      () => {
        // one-shot snapshot read
      },
      { includeSelf: false },
    );
    const votesRes = await c.subscribeWithSnapshotPrefix(
      "votes/",
      () => {
        // one-shot snapshot read
      },
      { includeSelf: false },
    );

    const optionEntries = Object.values(optionsRes.initial.entries) as Array<{
      text?: string;
      addedAt?: number;
    }>;
    const userEntries = Object.values(usersRes.initial.entries);
    const voteEntries = Object.values(votesRes.initial.entries);

    optionsRes.unsubscribe();
    usersRes.unsubscribe();
    votesRes.unsubscribe();

    const settingsValue = settings.value as
      | {
          tallyMode?: unknown;
          ballotTitle?: unknown;
          showLiveResults?: unknown;
          allowRevote?: unknown;
          allowAdd?: unknown;
          showUsers?: unknown;
          showVoterVotes?: unknown;
        }
      | null;

    const isDefaultUntouched =
      meta.value.state === "open" &&
      (meta.value.title ?? "") === "" &&
      settingsValue !== null &&
      settingsValue.tallyMode === "borda" &&
      (settingsValue.ballotTitle ?? "") === "" &&
      settingsValue.showLiveResults === true &&
      settingsValue.allowRevote === true &&
      settingsValue.allowAdd === true &&
      settingsValue.showUsers === true &&
      settingsValue.showVoterVotes === false &&
      optionEntries.length === 0 &&
      voteEntries.length === 0 &&
      userEntries.length === 0;

    if (isDefaultUntouched) {
      // Auto-prune stale empty polls: never configured and never joined.
      await Promise.allSettled([
        c.deletePrefix("options/"),
        c.deletePrefix("votes/"),
        c.deletePrefix("users/"),
        c.delete("settings"),
        c.delete("meta"),
      ]);
      return null;
    }

    const fromSettings =
      settingsValue &&
      typeof settingsValue === "object" &&
      typeof settingsValue.ballotTitle === "string"
        ? settingsValue.ballotTitle.trim()
        : "";
    const fromMeta = typeof meta.value.title === "string" ? meta.value.title.trim() : "";
    const titleRaw = fromSettings || fromMeta;
    const title = titleRaw;

    const optionsPreview = optionEntries
      .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0))
      .map((o) => (typeof o.text === "string" ? o.text.trim() : ""))
      .filter((x) => x.length > 0);

    return { title, optionsPreview };
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

async function deletePollOnServer(roomId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const c = newRoomClient(roomId);
  try {
    await c.ready(5_000);
    const meta = await c.get("meta");
    if (!meta.value) {
      return { ok: true };
    }
    await Promise.allSettled([
      c.deletePrefix("options/"),
      c.deletePrefix("votes/"),
      c.deletePrefix("users/"),
      c.delete("settings"),
      c.delete("meta"),
    ]);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Couldn't delete this poll.",
    };
  } finally {
    try {
      c.flushAndDisconnect(1_000);
    } catch {
      /* ignore */
    }
  }
}

async function createRoom(): Promise<string> {
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
  const aliveRef = useRef(true);
  const [recentPolls, setRecentPollsState] = useState<RecentPollView[]>([]);
  const [loadingRecents, setLoadingRecents] = useState(true);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteRoomId, setConfirmingDeleteRoomId] = useState<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    setError(null);

    void (async () => {
      const stored = getRecentPolls();
      if (stored.length === 0) {
        if (aliveRef.current) {
          setRecentPollsState([]);
          setLoadingRecents(false);
        }
        return;
      }
      const checks = await Promise.all(
        stored.map(async (entry) => ({
          entry,
          info: await fetchRecentPollInfo(entry.roomId),
        })),
      );
      if (!aliveRef.current) return;
      const valid = checks
        .filter((x) => x.info !== null)
        .map((x) => ({
          ...x.entry,
          title: x.info!.title,
          optionsPreview: x.info!.optionsPreview,
        }));
      setRecentPollsState(valid);
      if (valid.length !== stored.length) {
        setRecentPolls(valid.map(({ roomId, savedAt }) => ({ roomId, savedAt })));
      }
      setLoadingRecents(false);
    })();

    return () => {
      aliveRef.current = false;
    };
  }, []);

  const openExisting = async (roomId: string) => {
    setOpeningRoomId(roomId);
    setError(null);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (aliveRef.current) {
        setError("Couldn't open this poll.");
        setOpeningRoomId(null);
      }
    }, HOME_TIMEOUT_MS);
    try {
      const ok = await checkRoomAvailable(roomId);
      if (timedOut) return;
      if (!ok) {
        setOpeningRoomId(null);
        const next = recentPolls.filter((x) => x.roomId !== roomId);
        setRecentPolls(next.map(({ roomId: id, savedAt }) => ({ roomId: id, savedAt })));
        setRecentPollsState(next);
        setError("This poll is no longer available.");
        return;
      }
      addRecentPoll(roomId);
      navigate(`/admin/${roomId}`);
    } catch (e) {
      if (!timedOut) {
        setOpeningRoomId(null);
        setError(e instanceof Error ? e.message : "Couldn't open this poll.");
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const deletePoll = async (roomId: string) => {
    setDeletingRoomId(roomId);
    setError(null);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (aliveRef.current) {
        setError("Couldn't delete this poll (timed out).");
        setDeletingRoomId(null);
      }
    }, HOME_TIMEOUT_MS);

    try {
      const result = await deletePollOnServer(roomId);
      if (timedOut) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      removeRecentPoll(roomId);
      clearPollLocalStorage(roomId);
      setRecentPollsState((prev) => prev.filter((p) => p.roomId !== roomId));
    } catch (e) {
      if (!timedOut) {
        setError(e instanceof Error ? e.message : "Couldn't delete this poll.");
      }
    } finally {
      clearTimeout(timeoutId);
      if (!timedOut) {
        setDeletingRoomId(null);
      }
    }
  };

  const startPoll = async () => {
    setCreatingPoll(true);
    setError(null);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (aliveRef.current) {
        setError("Couldn't connect to the server.");
        setCreatingPoll(false);
      }
    }, HOME_TIMEOUT_MS);
    try {
      const fresh = await createRoom();
      if (timedOut) return;
      setAdminLastRoomId(fresh);
      addRecentPoll(fresh);
      navigate(`/admin/${fresh}`);
    } catch (e) {
      if (!timedOut) {
        setCreatingPoll(false);
        setError(e instanceof Error ? e.message : "Couldn't create a poll.");
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const busy = creatingPoll || openingRoomId !== null || deletingRoomId !== null;
  const formatOptionsPreview = (items: string[]) =>
    items.length === 0 ? "No options yet" : items.join(", ");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl items-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-8">
      <section className="w-full overflow-hidden rounded-2xl bg-surface p-6 shadow-page sm:p-8">
        <div className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          Ranked voting
        </div>
        <h1 className="mt-5 max-w-prose text-4xl font-semibold tracking-tight text-text sm:text-5xl">
          Create a poll and share it.
        </h1>
        <p className="mt-3 max-w-[42ch] text-base leading-7 text-muted sm:text-lg">
          Quick ranked voting for small groups.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={startPoll}
            disabled={busy}
            className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingPoll ? "Creating…" : "Create poll"}
          </button>
        </div>

        <div className="mt-7">
          <h2 className="text-sm font-semibold text-text">Recent polls</h2>
          <div
            className="mt-2 max-h-[min(50vh,20rem)] overflow-y-auto overflow-x-hidden rounded-xl bg-surface-2/50 px-2 py-2"
            aria-busy={loadingRecents}
          >
            {loadingRecents ? (
              <p className="px-1 text-sm text-muted">Checking recent polls…</p>
            ) : recentPolls.length === 0 ? (
              <p className="px-1 text-sm text-muted">No recent polls found.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recentPolls.map((p) => (
                  <li key={p.roomId} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5 shadow-card">
                    <div className="min-w-0 flex-1">
                      {p.title ? (
                        <div className="truncate text-sm font-semibold tracking-tight text-text">{p.title}</div>
                      ) : null}
                      <div className="truncate text-xs font-medium text-accent/90">
                        {formatOptionsPreview(p.optionsPreview)}
                      </div>
                      <div className="truncate text-[11px] text-muted">
                        <span className="font-mono text-muted/95">{p.roomId}</span>
                        <span className="text-muted/75"> · {formatLastOpened(p.savedAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {confirmingDeleteRoomId === p.roomId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteRoomId(null)}
                            disabled={busy}
                            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-border bg-surface-2 px-3 text-sm font-semibold text-text transition-colors hover:bg-surface disabled:opacity-60"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => { setConfirmingDeleteRoomId(null); void deletePoll(p.roomId); }}
                            disabled={busy}
                            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-danger px-3 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-60"
                          >
                            {deletingRoomId === p.roomId ? "Deleting…" : "Confirm"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteRoomId(p.roomId)}
                          disabled={busy}
                          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-danger/25 bg-danger-soft text-danger transition-colors hover:brightness-98 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Delete poll"
                          aria-label={`Delete poll ${p.roomId}`}
                        >
                          <Trash2 className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void openExisting(p.roomId)}
                        disabled={busy}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {openingRoomId === p.roomId ? "Opening…" : "Open"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}

