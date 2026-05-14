/**
 * Server-side JSON Schemas — registered once at construction time via
 * RoomClient's `schemas` option. The SDK auto-uploads when our local version
 * is greater than the room's recorded version, otherwise it skips the
 * register_schemas round trip entirely (zero bandwidth in steady state).
 *
 * Pattern keys follow room-server's resolution rules (exact > longest prefix
 * > "*" > unknown):
 *   - "meta"        → exact
 *   - "settings"    → exact
 *   - "options/"    → prefix
 *   - "users/"      → prefix
 *   - "votes/"      → prefix
 *
 * `presence/` is a server-managed namespace (clients can't write to it) so
 * it is intentionally absent from the server schema map but present in the
 * TS schema map below for client-side type narrowing.
 *
 * Bump SCHEMA_VERSION on any breaking change.
 */
import type { JsonSchema, PresenceInfo } from "room-server/types";
import type { Meta, Option, Settings, UserRecord, Vote } from "./types";

export const SCHEMA_VERSION = 8;

const metaSchema: JsonSchema = {
  type: "object",
  required: ["title", "state", "createdAt"],
  properties: {
    title: { type: "string", minLength: 0, maxLength: 100 },
    state: { type: "string", enum: ["open", "closed"] },
    createdAt: { type: "number" },
  },
};

const settingsSchema: JsonSchema = {
  type: "object",
  required: [
    "tallyMode",
    "ballotTitle",
    "showLiveResults",
    "allowRevote",
    "allowAdd",
    "showUsers",
    "showVoterVotes",
  ],
  properties: {
    tallyMode: { type: "string", enum: ["borda", "dowdall", "copeland"] },
    /** Poll heading; legacy property name retained for persisted rooms. */
    ballotTitle: { type: "string", maxLength: 100 },
    showLiveResults: { type: "boolean" },
    allowRevote: { type: "boolean" },
    allowAdd: { type: "boolean" },
    showUsers: { type: "boolean" },
    showVoterVotes: { type: "boolean" },
  },
};

const optionSchema: JsonSchema = {
  type: "object",
  required: ["id", "text", "addedAt"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 32 },
    text: { type: "string", minLength: 1, maxLength: 200 },
    addedBy: { type: "string", maxLength: 64 },
    addedAt: { type: "number" },
  },
};

const userSchema: JsonSchema = {
  type: "object",
  required: ["id", "name", "mode"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 32 },
    name: { type: "string", minLength: 1, maxLength: 32 },
    mode: { type: "string", enum: ["idle", "voting", "editing"] },
    ignored: { type: "boolean" },
  },
};

const voteSchema: JsonSchema = {
  type: "object",
  required: ["userId", "ranking", "submittedAt"],
  properties: {
    userId: { type: "string", minLength: 1, maxLength: 32 },
    ranking: {
      type: "array",
      items: { type: "string", maxLength: 32 },
    },
    submittedAt: { type: "number" },
    ignored: { type: "boolean" },
  },
};

export const ROOM_SCHEMAS: Record<string, JsonSchema> = {
  meta: metaSchema,
  settings: settingsSchema,
  "options/": optionSchema,
  "users/": userSchema,
  "votes/": voteSchema,
};

/**
 * TS schema map fed to `RoomClient<RoomSchema>`. Includes `presence/` for
 * type narrowing on subscriptions; absence from `ROOM_SCHEMAS` is fine
 * because nothing client-side ever writes to that namespace.
 */
export interface RoomSchema {
  meta: Meta;
  settings: Settings;
  "options/": Option;
  "users/": UserRecord;
  "votes/": Vote;
  "presence/": PresenceInfo;
}
