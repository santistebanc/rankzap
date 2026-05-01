/**
 * Smoke test — deployed room-server v3.2.0+
 *
 * Covers: schemaVersion accurate when ready() settles, reserve+TTL, validation,
 * explicit delete emits priorValue, presence/ delete emits priorValue.userId on disconnect().
 *
 * Node has no built-in WebSocket — register `ws` before connecting.
 */
import { WebSocket } from "ws";
import { RoomClient, RoomError } from "room-server/client";
import { nanoid } from "nanoid";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket;
}

const HOST = "room-server.santistebanc.partykit.dev";
const API_KEY = "ranked-vote";
const SCHEMA_VERSION = 3;
const ROOM_TTL_SEC = 60;

const ROOM_SCHEMAS = {
  meta: {
    type: "object",
    required: ["title", "state", "createdAt"],
    properties: {
      title: { type: "string", minLength: 0, maxLength: 100 },
      state: { type: "string", enum: ["open", "closed"] },
      createdAt: { type: "number" },
    },
  },
  "users/": {
    type: "object",
    required: ["id", "name", "mode"],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 32 },
      name: { type: "string", minLength: 1, maxLength: 32 },
      mode: { type: "string", enum: ["idle", "voting"] },
    },
  },
  "votes/": {
    type: "object",
    required: ["userId", "ranking", "submittedAt"],
    properties: {
      userId: { type: "string", minLength: 1, maxLength: 32 },
      ranking: { type: "array", items: { type: "string", maxLength: 32 } },
      submittedAt: { type: "number" },
    },
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[smoke]", ...a);

async function main() {
  const roomId = `smoke-${nanoid(6)}`;
  const userId = `u-${nanoid(6)}`;
  log("room=", roomId, "user=", userId);

  const admin = new RoomClient({
    host: HOST,
    roomId,
    config: { apiKey: API_KEY, persistence: "durable" },
    schemas: { server: ROOM_SCHEMAS, version: SCHEMA_VERSION },
  });
  await admin.ready(8_000);
  if (admin.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `schemaVersion stale after ready(): ${admin.schemaVersion} expected ${SCHEMA_VERSION}`,
    );
  }
  log("✓ ready() reflects schema upload (schemaVersion=", admin.schemaVersion, ")");

  const reserved = await admin.reserve(
    "meta",
    { title: "Smoke poll", state: "open", createdAt: Date.now() },
    { ttl: ROOM_TTL_SEC },
  );
  if (!reserved) throw new Error("reserve returned false");
  log("✓ reserve (with TTL) succeeded");

  try {
    await admin.set("meta", {
      title: "x".repeat(101),
      state: "open",
      createdAt: Date.now(),
    });
    throw new Error("expected validation rejection");
  } catch (e) {
    if (!(e instanceof RoomError) || e.kind !== "validation") {
      throw new Error(`expected validation kind, got ${e?.kind ?? e}`);
    }
    log("✓ server-side validation works (kind='validation')");
  }

  await admin.set("meta", { title: "", state: "open", createdAt: Date.now() });
  log("✓ empty meta title accepted");

  /** @type {({ userId?: string }) | null} */
  let presenceDeletePrior = null;
  /** @type {Map<string, unknown>} */
  const presenceByKey = new Map();
  const {
    initial: pi,
    unsubscribe: unsubPresence,
  } = await admin.subscribeWithSnapshotPrefix("presence/", (e) => {
    if (e.type === "set") {
      presenceByKey.set(e.key, e.value);
    } else {
      presenceByKey.delete(e.key);
      if (e.priorValue?.userId === userId) presenceDeletePrior = e.priorValue;
    }
  });
  for (const [k, v] of Object.entries(pi.entries ?? {}))
    presenceByKey.set(k, v);

  const voter = new RoomClient({
    host: HOST,
    roomId,
    config: { apiKey: API_KEY, persistence: "durable", userId },
    schemas: { server: ROOM_SCHEMAS, version: SCHEMA_VERSION },
  });
  await voter.ready(8_000);
  await sleep(600);

  const hasPresenceUserId = [...presenceByKey.values()].some(
    (info) =>
      !!info &&
      typeof info === "object" &&
      "userId" in info &&
      /** @type {{ userId?: string }} */ (info).userId === userId,
  );
  if (!hasPresenceUserId) throw new Error(`presence/ did not surface userId ${userId}`);
  log("✓ presence/ surfaced voter userId");

  let sawExplicitPrior = false;
  const skid = `prior-${nanoid(4)}`;
  const { unsubscribe: unsubUsersProbe } = await admin.subscribeWithSnapshotPrefix(
    "users/",
    (e) => {
      if (
        e.type === "delete" &&
        e.key === `users/${skid}` &&
        e.priorValue?.id === skid
      ) {
        sawExplicitPrior = true;
      }
    },
    { includeSelf: true },
  );
  await admin.set(
    `users/${skid}`,
    { id: skid, name: "p", mode: "idle" },
    { ttl: ROOM_TTL_SEC },
  );
  await admin.delete(`users/${skid}`);
  await sleep(400);
  unsubUsersProbe();
  if (!sawExplicitPrior) throw new Error("explicit delete missing priorValue on users/");
  log("✓ explicit delete carries priorValue on users/");

  await voter.set(
    `users/${userId}`,
    { id: userId, name: "Alice", mode: "voting" },
    { ttl: ROOM_TTL_SEC },
  );
  await voter.set(
    `votes/${userId}`,
    { userId, ranking: ["a", "b"], submittedAt: Date.now() },
    { ttl: ROOM_TTL_SEC },
  );
  log("✓ write users/{id} and votes/{id}");

  const { initial: votesSnap, unsubscribe: unsubVotes } =
    await admin.subscribeWithSnapshotPrefix("votes/", () => {});
  if (Object.keys(votesSnap.entries).length !== 1) {
    throw new Error(`expected 1 vote, got ${Object.keys(votesSnap.entries).length}`);
  }
  log("✓ votes/ snapshot contains 1 entry");

  await voter.flushAndDisconnect(2_000);

  for (let i = 0; i < 30 && presenceDeletePrior == null; i++) await sleep(150);

  if (!presenceDeletePrior?.userId || presenceDeletePrior.userId !== userId) {
    throw new Error(
      `presence/ disconnect delete lacked priorValue.userId (${JSON.stringify(presenceDeletePrior)})`,
    );
  }
  log("✓ presence disconnect carries priorValue.userId");

  unsubPresence();
  unsubVotes();
  await admin.deletePrefix("votes/");
  await admin.delete("meta");
  await admin.flushAndDisconnect(2_000);
  log("done.");
}

main().catch((e) => {
  console.error("[smoke] FAILED:", e);
  process.exit(1);
});
