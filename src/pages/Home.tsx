import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { customAlphabet } from "nanoid";

const roomIdAlphabet = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 4);
import {
  createRoomClient,
  isRoomServerConfigured,
} from "../lib/roomClient";
import {
  DEFAULT_META,
  DEFAULT_SETTINGS,
  HOME_TIMEOUT_MS,
  POLL_COLOURS,
  pollColourOf,
  type PollColour,
  ROOM_TTL_SEC,
} from "../lib/types";
import {
  addRecentPoll,
  clearPollLocalStorage,
  getRecentPolls,
  removeRecentPoll,
  setAdminLastRoomId,
  setRecentPolls,
  type RecentPollEntry,
} from "../lib/storage";
import { ColourPicker } from "../components/ColourPicker";
import { Arrow } from "../components/Arrow";
import { usePollColour } from "../lib/pollColour";

interface RecentPollView extends RecentPollEntry {
  title: string;
  optionsPreview: string[];
  colour: PollColour;
}

let recentPollsSessionCache: { key: string; polls: RecentPollView[] } | null = null;

const newRoomClient = (roomId: string) => createRoomClient(roomId);

const SET_OPTS = { ttl: ROOM_TTL_SEC } as const;
const HOME_UNAVAILABLE_MESSAGE = "Polls are unavailable right now. Please try again later.";

function recentPollStorageKey(entries: RecentPollEntry[]): string {
  return entries.map((entry) => `${entry.roomId}:${entry.savedAt}`).join("|");
}

function getCachedRecentPolls(): RecentPollView[] | null {
  const stored = getRecentPolls();
  const key = recentPollStorageKey(stored);
  if (recentPollsSessionCache?.key !== key) return null;
  return recentPollsSessionCache.polls;
}

function setCachedRecentPolls(entries: RecentPollEntry[], polls: RecentPollView[]): void {
  recentPollsSessionCache = {
    key: recentPollStorageKey(entries),
    polls,
  };
}

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
): Promise<{ title: string; optionsPreview: string[]; colour: PollColour } | null> {
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
          colour?: unknown;
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
      pollColourOf(settingsValue.colour) === "yellow" &&
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

    return { title, optionsPreview, colour: pollColourOf(settingsValue?.colour) };
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

async function createRoom(colour: PollColour): Promise<string> {
  for (let attempt = 0; attempt < 22; attempt++) {
    const candidate = roomIdAlphabet();
    const c = newRoomClient(candidate);
    let reserved = false;
    try {
      await c.ready(5_000);
      reserved = await c.reserve("meta", DEFAULT_META(), {
        ttl: ROOM_TTL_SEC,
      });
      if (reserved) {
        await c.set("settings", { ...DEFAULT_SETTINGS(), colour }, SET_OPTS);
        return candidate;
      }
    } catch (e) {
      if (reserved) {
        await c.delete("meta").catch(() => {});
        throw e;
      }
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
  usePollColour("yellow");
  const aliveRef = useRef(true);
  const initialCachedRecentPolls = getCachedRecentPolls();
  const initialStoredRecentPollCountRef = useRef(getRecentPolls().length);
  const [recentPolls, setRecentPollsState] = useState<RecentPollView[]>(
    () => initialCachedRecentPolls ?? [],
  );
  const [loadingRecents, setLoadingRecents] = useState(
    () => initialCachedRecentPolls === null,
  );
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [colour, setColour] = useState<PollColour>("yellow");
  const [joinCode, setJoinCode] = useState("");
  const [joiningPoll, setJoiningPoll] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteRoomId, setConfirmingDeleteRoomId] = useState<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    document.title = "Rankzap Â· Rank it together";
    setError(null);

    if (!isRoomServerConfigured()) {
      setRecentPollsState([]);
      setLoadingRecents(false);
      setError(HOME_UNAVAILABLE_MESSAGE);
      return;
    }

    void (async () => {
      const stored = getRecentPolls();
      const storedKey = recentPollStorageKey(stored);
      if (recentPollsSessionCache?.key === storedKey) {
        setRecentPollsState(recentPollsSessionCache.polls);
        setLoadingRecents(false);
        return;
      }
      if (stored.length === 0) {
        if (aliveRef.current) {
          setRecentPollsState([]);
          setCachedRecentPolls(stored, []);
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
          colour: x.info!.colour,
        }));
      setRecentPollsState(valid);
      if (valid.length !== stored.length) {
        const nextStored = valid.map(({ roomId, savedAt }) => ({ roomId, savedAt }));
        setRecentPolls(nextStored);
        setCachedRecentPolls(nextStored, valid);
      } else {
        setCachedRecentPolls(stored, valid);
      }
      setLoadingRecents(false);
    })();

    return () => {
      aliveRef.current = false;
    };
  }, []);

  const openExisting = async (roomId: string) => {
    if (busy) return;
    if (!isRoomServerConfigured()) {
      setError(HOME_UNAVAILABLE_MESSAGE);
      return;
    }
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
      if (timedOut || !aliveRef.current) return;
      if (!ok) {
        setOpeningRoomId(null);
        const next = recentPolls.filter((x) => x.roomId !== roomId);
        const nextStored = next.map(({ roomId: id, savedAt }) => ({ roomId: id, savedAt }));
        setRecentPolls(nextStored);
        setCachedRecentPolls(nextStored, next);
        setRecentPollsState(next);
        setError("This poll is no longer available.");
        return;
      }
      addRecentPoll(roomId);
      navigate(`/${roomId}/admin`);
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
    if (busy) return;
    if (!isRoomServerConfigured()) {
      setError(HOME_UNAVAILABLE_MESSAGE);
      return;
    }
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
      if (timedOut || !aliveRef.current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      removeRecentPoll(roomId);
      clearPollLocalStorage(roomId);
      setRecentPollsState((prev) => {
        const next = prev.filter((p) => p.roomId !== roomId);
        setCachedRecentPolls(
          next.map(({ roomId: id, savedAt }) => ({ roomId: id, savedAt })),
          next,
        );
        return next;
      });
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
    if (busy) return;
    if (!isRoomServerConfigured()) {
      setError(HOME_UNAVAILABLE_MESSAGE);
      return;
    }
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
      const fresh = await createRoom(colour);
      if (timedOut || !aliveRef.current) return;
      setAdminLastRoomId(fresh);
      addRecentPoll(fresh);
      navigate(`/${fresh}/admin`);
    } catch (e) {
      if (!timedOut) {
        setCreatingPoll(false);
        setError(e instanceof Error ? e.message : "Couldn't create a poll.");
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const busy = creatingPoll || joiningPoll || openingRoomId !== null || deletingRoomId !== null;

  const joinPoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setJoinError("Enter the four-letter or number code from your host.");
      return;
    }
    if (!isRoomServerConfigured()) {
      setJoinError(HOME_UNAVAILABLE_MESSAGE);
      return;
    }
    setJoiningPoll(true);
    setJoinError(null);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (!aliveRef.current) return;
      setJoiningPoll(false);
      setJoinError("Couldn't connect. Check the code and try again.");
    }, HOME_TIMEOUT_MS);
    try {
      const available = await checkRoomAvailable(code);
      if (timedOut || !aliveRef.current) return;
      if (available) navigate(`/${code}`);
      else setJoinError("Couldn't find that poll. Check the code or try again.");
    } finally {
      clearTimeout(timeoutId);
      if (!timedOut && aliveRef.current) setJoiningPoll(false);
    }
  };

  const action = "display flex min-h-14 items-center justify-between gap-4 bg-hi px-5 py-4 text-2xl text-hi-ink transition-transform duration-150 ease-(--ease-spring) hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-50";

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 pt-5 pb-[max(24px,env(safe-area-inset-bottom,0px))] text-ink sm:px-6 lg:px-7">
      <header className="flex min-h-11 items-center gap-2 font-extrabold uppercase">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" />
        </svg>
        Rankzap
      </header>

      {/* At 1240px: 1184px inside the gutters = 672px + 48px + 464px. */}
      <div className="grid gap-8 pt-6 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:items-center lg:gap-12 lg:pt-10">
        <div>
          <h1 className="display text-[clamp(112px,25vw,180px)] tracking-[-0.03em] lg:text-[clamp(180px,17vw,232px)]">
            Rank<br />it.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-snug font-semibold sm:text-xl">
            One link. Everyone ranks their favourites. See what comes out on top.
          </p>
        </div>

        <div className="grid min-w-0 gap-6">
          <section aria-labelledby="create-heading" className="min-w-0 bg-step p-5 text-step-ink sm:p-6">
            <h2 id="create-heading" className="display text-3xl">Start a poll</h2>
            <p className="mt-2 text-base">Add your question and options next.</p>
            <fieldset disabled={busy} className="mt-5 min-w-0 disabled:opacity-50">
              <legend className="mb-3 text-sm font-bold">Poll colour · {POLL_COLOURS[colour].name}</legend>
              <div className="@container">
                <ColourPicker value={colour} onChange={async (next) => setColour(next)} previewPage={false} className="grid-cols-4 @min-[394px]:grid-cols-8 [&>button]:h-11 [&>button]:aspect-auto" />
              </div>
            </fieldset>
            <button type="button" onClick={() => void startPoll()} disabled={busy} className={`${action} mt-5 w-full`}>
              <span aria-live="polite">{creatingPoll ? "Creating…" : "Start a poll"}</span>
              <Arrow className="size-6" />
            </button>
            {error ? <p role="alert" className="mt-3 bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p> : null}
          </section>

          <section aria-labelledby="join-heading">
            <h2 id="join-heading" className="display text-3xl">Got a code?</h2>
            <form onSubmit={joinPoll} className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-1">
              <label htmlFor="join-code" className="sr-only">Poll code</label>
              <input
                id="join-code"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null); }}
                maxLength={4}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="A3ZK"
                disabled={busy}
                aria-invalid={Boolean(joinError)}
                aria-describedby={joinError ? "join-error" : "join-hint"}
                className="display min-h-16 w-full min-w-0 border-3 border-transparent bg-step px-4 py-3 text-4xl tracking-[0.15em] text-step-ink outline-none placeholder:text-step-ink/60 focus:border-[#0b0b0b] disabled:opacity-50"
              />
              <button type="submit" disabled={busy || joinCode.trim().length !== 4} className={action}>
                {joiningPoll ? "Joining…" : "Join"}
              </button>
            </form>
            <p id="join-hint" className="mt-2 text-sm font-semibold">Enter the four-character code from your host.</p>
            {joinError ? <p id="join-error" role="alert" className="mt-3 bg-danger-soft p-3 text-sm font-semibold text-danger">{joinError}</p> : null}
          </section>
        </div>
      </div>

      <section aria-labelledby="recent-heading" className="mt-10 sm:mt-12">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="recent-heading" className="display text-3xl">Your polls</h2>
          <span className="text-sm font-semibold">Saved on this device</span>
        </div>
        <div aria-busy={loadingRecents}>
          {loadingRecents ? (
            <div role="status" aria-label="Loading your polls" className="grid gap-1">
              {Array.from({ length: Math.min(Math.max(initialStoredRecentPollCountRef.current, 1), 3) }).map((_, i) => (
                <div key={i} aria-hidden="true" className="h-24 animate-pulse bg-step/60" />
              ))}
            </div>
          ) : recentPolls.length === 0 ? (
            <p className="bg-low p-5 text-base font-semibold text-low-ink">Your polls will appear here after you create one.</p>
          ) : (
            <ul className="grid gap-1">
              {recentPolls.map((p) => (
                <li key={p.roomId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 bg-step text-step-ink">
                  <button type="button" onClick={() => void openExisting(p.roomId)} disabled={busy} aria-label={`Open poll ${p.roomId}: ${p.title || "Untitled poll"}`} className="group flex min-w-0 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-low disabled:opacity-50 sm:gap-4 sm:px-5">
                    <span aria-hidden="true" style={{ background: POLL_COLOURS[p.colour].sig }} className="size-4 shrink-0 border-2 border-[#0b0b0b]" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-base leading-tight font-extrabold wrap-anywhere sm:text-lg">{p.title || "Untitled poll"}</span>
                      {p.optionsPreview.length > 0 ? <span className="mt-1 line-clamp-1 text-sm wrap-anywhere">{p.optionsPreview.join(", ")}</span> : null}
                      <span className="mt-1 block text-xs font-semibold">{p.roomId} · {openingRoomId === p.roomId ? "Opening…" : formatLastOpened(p.savedAt)}</span>
                    </span>
                    <span className="hidden sm:block"><Arrow className="size-6" /></span>
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmingDeleteRoomId(confirmingDeleteRoomId === p.roomId ? null : p.roomId)} aria-label={`Delete poll ${p.roomId}`} aria-expanded={confirmingDeleteRoomId === p.roomId} className="mr-2 grid size-11 place-items-center text-step-ink/60 hover:bg-danger-soft hover:text-danger disabled:opacity-50">
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                  {confirmingDeleteRoomId === p.roomId ? (
                    <div className="col-span-2 flex flex-wrap items-center gap-3 bg-danger-soft px-4 py-3 text-sm text-danger" role="group" aria-label={`Confirm deleting poll ${p.roomId}`}>
                      <p className="min-w-0 flex-1 font-semibold">Delete {p.roomId} and all its votes for everyone?</p>
                      <button type="button" disabled={busy} onClick={() => setConfirmingDeleteRoomId(null)} className="min-h-11 px-3 font-bold underline underline-offset-4">Cancel</button>
                      <button type="button" disabled={busy} onClick={() => { void deletePoll(p.roomId); }} className="min-h-11 bg-danger px-4 font-bold text-white">{deletingRoomId === p.roomId ? "Deleting…" : "Yes, delete"}</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <footer className="mt-8 text-sm font-semibold">Rank together. Decide together.</footer>
    </main>
  );
}
