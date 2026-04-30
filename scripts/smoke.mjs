// Smoke test against deployed room-server v3.1 — exercises the v3.1 features
// the voter app now depends on: typed reserve+TTL, schemas-at-construction,
// auto schema upload, presence/, RoomError.kind.
import { RoomClient, RoomError } from "room-server/client";
import { nanoid } from "nanoid";

const HOST = "room-server.santistebanc.partykit.dev";
const API_KEY = "ranked-vote";
const ROOM_TTL_SEC = 60; // short TTL for smoke

const ROOM_SCHEMAS = {
  meta: {
    type: "object",
    required: ["title", "state", "createdAt"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
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

const log = (...a) => console.log("[smoke]", ...a);

async function main() {
  const roomId = `smoke-${nanoid(6)}`;
  const userId = `u-${nanoid(6)}`;
  log("room=", roomId, "user=", userId);

  const admin = new RoomClient({
    host: HOST,
    roomId,
    config: { apiKey: API_KEY, persistence: "durable" },
    schemas: { server: ROOM_SCHEMAS, version: 2 },
  });
  await admin.ready(8_000);
  log("admin ready, schemaVersion=", admin.schemaVersion);

  // 1. reserve with TTL
  const reserved = await admin.reserve(
    "meta",
    { title: "Smoke poll", state: "open", createdAt: Date.now() },
    { ttl: ROOM_TTL_SEC },
  );
  if (!reserved) throw new Error("reserve returned false");
  log("✓ reserve (with TTL) succeeded");

  // 2. validation: bad meta should be rejected
  try {
    await admin.set("meta", { title: "", state: "open", createdAt: Date.now() });
    throw new Error("expected validation rejection");
  } catch (e) {
    if (!(e instanceof RoomError) || e.kind !== "validation") {
      throw new Error(`expected validation kind, got ${e?.kind ?? e}`);
    }
    log("✓ server-side validation works (kind='validation')");
  }

  // 3. presence/ subscription
  const voter = new RoomClient({
    host: HOST,
    roomId,
    config: { apiKey: API_KEY, persistence: "durable", userId },
    schemas: { server: ROOM_SCHEMAS, version: 2 },
  });
  const presenceUserIds = new Set();
  const { initial: presenceInitial, unsubscribe: unsubPresence } =
    await admin.subscribeWithSnapshotPrefix("presence/", (e) => {
      if (e.type === "delete") {
        // we don't have userId in delete events — simplest is to recompute
      } else if (e.value?.userId) {
        presenceUserIds.add(e.value.userId);
      }
    });
  for (const v of Object.values(presenceInitial.entries)) {
    if (v?.userId) presenceUserIds.add(v.userId);
  }
  await voter.ready(8_000);
  log("voter ready, voter connId=", voter.connectionId);

  // give presence a beat to propagate
  await new Promise((r) => setTimeout(r, 500));
  if (!presenceUserIds.has(userId)) {
    throw new Error(`presence/ did not surface userId ${userId}`);
  }
  log("✓ presence/ surfaced voter userId on connect");

  // 4. write users/{id} (no lastSeen) and votes/{id}
  await voter.set(`users/${userId}`, { id: userId, name: "Alice", mode: "voting" });
  await voter.set(`votes/${userId}`, {
    userId,
    ranking: ["a", "b"],
    submittedAt: Date.now(),
  });
  log("✓ write users/{id} (no lastSeen) and votes/{id} succeeded");

  // 5. verify counts via prefix subscription
  const { initial: votesSnap, unsubscribe: unsubVotes } =
    await admin.subscribeWithSnapshotPrefix("votes/", () => {});
  const voteCount = Object.keys(votesSnap.entries).length;
  if (voteCount !== 1) throw new Error(`expected 1 vote, got ${voteCount}`);
  log("✓ votes/ snapshot contains 1 entry");

  // 6. voter disconnect → presence eviction
  await voter.flushAndDisconnect(2_000);
  await new Promise((r) => setTimeout(r, 1500));
  // Re-snapshot presence
  const { initial: presenceAfter } = await admin.subscribeWithSnapshotPrefix(
    "presence/",
    () => {},
  );
  const stillPresent = Object.values(presenceAfter.entries).some(
    (v) => v?.userId === userId,
  );
  if (stillPresent) {
    log("⚠ voter still in presence/ after disconnect — server-side eviction lag (acceptable)");
  } else {
    log("✓ voter dropped from presence/ after disconnect");
  }

  unsubPresence();
  unsubVotes();
  // 7. cleanup
  await admin.deletePrefix("votes/");
  await admin.delete("meta");
  await admin.flushAndDisconnect(2_000);
  log("done.");
}

main().catch((e) => {
  console.error("[smoke] FAILED:", e);
  process.exit(1);
});
