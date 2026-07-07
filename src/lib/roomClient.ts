import { RoomClient } from "room-server/client";
import { ROOM_SCHEMAS, SCHEMA_VERSION, type RoomSchema } from "./schemas";

const HOST = import.meta.env.VITE_HOST;
const API_KEY = import.meta.env.VITE_API_KEY;

if (!HOST || !API_KEY) {
  console.error(
    "[rankzap] Missing VITE_HOST or VITE_API_KEY — set them in .env or repo secrets.",
  );
}

export type TypedRoomClient = RoomClient<RoomSchema>;

export const ROOM_CONFIG_ERROR =
  "Server not configured. Copy .env.example to .env and set VITE_HOST and VITE_API_KEY.";

export function isRoomServerConfigured(): boolean {
  return Boolean(HOST && API_KEY);
}

export function createRoomClient(
  roomId: string,
  options?: { userId?: string },
): TypedRoomClient {
  if (!HOST || !API_KEY) {
    throw new Error(ROOM_CONFIG_ERROR);
  }
  return new RoomClient<RoomSchema>({
    host: HOST,
    roomId,
    config: { apiKey: API_KEY, persistence: "durable", userId: options?.userId },
    schemas: { server: ROOM_SCHEMAS, version: SCHEMA_VERSION },
  });
}
