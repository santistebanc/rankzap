import { useSyncExternalStore } from "react";
export const SET_OPTS = {};
const empty = new Map();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const maps = () => (window as any).__fakeRoom ?? {};
const values = () => ((window as any).__fakeValues ??= {});
function emit() { listeners.forEach((fn) => fn()); }
const client = {
  set: async (key: string, value: unknown) => {
    ((window as any).__writes ??= []).push({ key, value });
    const slash = key.indexOf("/");
    if (slash < 0) values()[key] = value;
    else {
      const prefix = key.slice(0, slash + 1);
      maps()[prefix] = new Map(maps()[prefix] ?? empty).set(key, value);
    }
    emit();
  },
  delete: async (key: string) => {
    const prefix = key.slice(0, key.indexOf("/") + 1);
    const next = new Map(maps()[prefix] ?? empty);
    next.delete(key);
    maps()[prefix] = next;
    emit();
  },
  deletePrefix: async (prefix: string) => { maps()[prefix] = new Map(); emit(); },
};
export function useRoom() { return { client, status: "ready" }; }
export function useRoomList(prefix: string): Map<string, any> {
  return useSyncExternalStore(subscribe, () => maps()[prefix] ?? empty);
}
export function useRoomValue(key: string) {
  const value = useSyncExternalStore(subscribe, () => values()[key] ?? null);
  return { value };
}
