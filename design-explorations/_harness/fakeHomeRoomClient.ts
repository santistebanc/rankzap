import { DEFAULT_META, DEFAULT_SETTINGS } from "../../src/lib/types";
const q = new URLSearchParams(location.search);
const initial = (colour: string, title: string, options: string[]) => ({ meta: DEFAULT_META(), settings: { ...DEFAULT_SETTINGS(), colour, ballotTitle: title }, ...Object.fromEntries(options.map((text, i) => [`options/o${i}`, { id: `o${i}`, text, addedAt: i }])) });
const rooms: Record<string, Record<string, any>> = q.has('empty') ? {} : {
  A3ZK: initial('yellow', 'Best morning ritual?', ['Morning walk', 'Coffee first', 'Write for 20 minutes']),
  Q7PL: initial('cobalt', 'Team offsite city', ['Lisbon', 'Berlin', 'Copenhagen']),
  M2XD: initial('mint', q.has('long') ? 'Which film should we watch together after dinner this Friday evening?' : 'Friday film', ['Past Lives', 'Perfect Days', 'The Grand Budapest Hotel']),
};
(window as any).__homeRooms = rooms;
(window as any).__homeWrites = [];
export const ROOM_CONFIG_ERROR = 'Server not configured.';
export const isRoomServerConfigured = () => !q.has('unconfigured');
export function createRoomClient(roomId: string) {
  const room = () => rooms[roomId] ??= {};
  return {
    ready: async () => { if(q.has('offline')) throw new Error('Connection failed'); if(q.has('slow')) await new Promise(()=>{}); },
    get: async (key: string) => ({ value: room()[key] ?? null }),
    reserve: async (key: string, value: any) => { if(room()[key]) return false; room()[key] = value; return true; },
    set: async (key: string, value: any, opts: any) => { if(q.has('savefails')) throw new Error('Could not save the poll. Try again.'); room()[key] = value; (window as any).__homeWrites.push({roomId, key, value, opts}); },
    delete: async (key: string) => { delete room()[key]; },
    deletePrefix: async (prefix: string) => { for(const k of Object.keys(room())) if(k.startsWith(prefix)) delete room()[k]; },
    subscribeWithSnapshotPrefix: async (prefix: string) => ({ initial: { entries: Object.fromEntries(Object.entries(room()).filter(([key])=>key.startsWith(prefix))) }, unsubscribe() {} }),
    flushAndDisconnect() {},
  };
}
