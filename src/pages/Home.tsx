import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Scribble } from "../components/Scribble";
import { customAlphabet } from "nanoid";

const roomIdAlphabet = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 4);
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
import { RankzapLogo } from "../components/RankzapLogo";
import { ThemeToggle } from "../components/ThemeToggle";

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
    const candidate = roomIdAlphabet();
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

  const busy = creatingPoll || openingRoomId !== null || deletingRoomId !== null;
  const formatOptionsPreview = (items: string[]) =>
    items.length === 0 ? "" : items.join(", ");

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-2xl sm:items-center sm:px-4 sm:py-10 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
    >
      <div className="paper-card w-full min-h-dvh sm:min-h-0">
        <div style={CORNER_TOOLBAR}>
          <ThemeToggle style={CORNER_BTN} />
        </div>
        <div className="paper-content">

          {/* Top bar */}
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: "clamp(2rem, 5vw, 3.5rem)" }}>
            <RankzapLogo />
          </div>

          {/* Hero */}
          <div>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
              ranked voting · for small groups
            </p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.6rem, 9vw, 4.5rem)", lineHeight: 0.98, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 8px", color: "var(--text)" }}>
              make a poll.<br />
              <span style={{ color: "var(--accent)", position: "relative", display: "inline-block" }}>
                share the link.
                <Scribble
                  width={340}
                  color="var(--accent)"
                  style={{ position: "absolute", left: 0, bottom: -6, width: "100%", height: 14 }}
                />
              </span><br />
              rank together.
            </h1>
            <p style={{ marginTop: "1.1rem", fontSize: "1rem", lineHeight: 1.55, color: "var(--muted)", maxWidth: "42ch" }}>
              Drop in your options, send the link to friends, watch the ranking come together. No accounts, no fuss.
            </p>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: "clamp(1.5rem, 4vw, 2.5rem)" }}>
            <button
              type="button"
              onClick={startPoll}
              disabled={busy}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "1rem",
                fontWeight: 600,
                padding: "14px 30px",
                background: "var(--text)",
                color: "var(--bg)",
                border: "none",
                borderRadius: 999,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
                boxShadow: busy ? undefined : "3px 3px 0 var(--accent)",
                transition: "box-shadow 0.15s, opacity 0.15s",
              }}
            >
              {creatingPoll ? "Creating…" : "+ start a poll"}
            </button>

          </div>

          {/* Recent polls */}
          <div style={{ marginTop: "clamp(2.5rem, 7vw, 4rem)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.85rem", fontWeight: 700, color: "var(--text)", margin: 0, lineHeight: 1.05 }}>
                recent polls
              </h2>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted)", letterSpacing: "0.06em" }}>
                on this device
              </span>
            </div>

            <div aria-busy={loadingRecents}>
              {loadingRecents ? (
                <p style={{ color: "var(--muted)", fontSize: "0.9rem", padding: "8px 0" }}>Checking recent polls…</p>
              ) : recentPolls.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "0.9rem", padding: "8px 0" }}>No recent polls on this device.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "min(50vh,22rem)", overflowY: "auto", overflowX: "hidden" }}>
                  {recentPolls.map((p, i) => (
                    <li
                      key={p.roomId}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderBottom: "1px dashed var(--border)" }}
                    >
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--muted)", width: 28, textAlign: "right", flexShrink: 0, opacity: 0.7 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", fontSize: "0.95rem" }}>
                          {p.title || p.roomId}
                        </div>
                        {p.optionsPreview.length > 0 && (
                          <div style={{ fontSize: "0.78rem", color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                            {formatOptionsPreview(p.optionsPreview)}
                          </div>
                        )}
                        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--muted)", marginTop: 2, letterSpacing: "0.04em" }}>
                          {p.roomId} · {formatLastOpened(p.savedAt)}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {confirmingDeleteRoomId === p.roomId ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteRoomId(null)}
                              disabled={busy}
                              style={btnStyle("secondary")}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => { setConfirmingDeleteRoomId(null); void deletePoll(p.roomId); }}
                              disabled={busy}
                              style={btnStyle("danger")}
                            >
                              {deletingRoomId === p.roomId ? "Deleting…" : "Delete"}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteRoomId(p.roomId)}
                            disabled={busy}
                            aria-label={`Delete poll ${p.roomId}`}
                            title="Delete poll"
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%", border: "1.5px solid color-mix(in oklch, var(--danger) 35%, transparent)", background: "transparent", color: "var(--danger)", cursor: "pointer", opacity: busy ? 0.5 : 1, flexShrink: 0 }}
                          >
                            <Trash2 size={14} strokeWidth={2} aria-hidden />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void openExisting(p.roomId)}
                          disabled={busy}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%", border: "1.5px solid color-mix(in oklch, var(--accent) 35%, transparent)", background: "transparent", color: "var(--accent)", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1, fontFamily: "var(--font-display)", fontSize: 24, paddingBottom: 2, flexShrink: 0 }}
                          aria-label={`Open poll ${p.roomId}`}
                        >
                          {openingRoomId === p.roomId ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted)" }}>…</span> : "→"}
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
              style={{ marginTop: "1rem", borderRadius: 10, border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", background: "var(--danger-soft)", padding: "12px 16px", fontSize: "0.875rem", color: "var(--danger)" }}
            >
              {error}
            </div>
          ) : null}

        </div>
      </div>
    </main>
  );
}

const CORNER_TOOLBAR: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  zIndex: 2,
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
};

const CORNER_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  background: "none",
  border: "none",
  color: "var(--muted)",
  cursor: "pointer",
  padding: 4,
  borderRadius: 6,
};

function btnStyle(variant: "secondary" | "danger"): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: "0.825rem",
    fontWeight: 600,
    padding: "8px 14px",
    borderRadius: 999,
    cursor: "pointer",
    minHeight: 36,
  };
  if (variant === "danger") {
    return { ...base, background: "var(--danger-soft)", color: "var(--danger)", border: "1.5px solid color-mix(in oklch, var(--danger) 35%, transparent)" };
  }
  return { ...base, background: "transparent", color: "var(--text)", border: "1.5px solid var(--border)" };
}

