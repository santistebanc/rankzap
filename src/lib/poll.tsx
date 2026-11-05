import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { PollConnection, type ConnStatus } from "./pollConnection";
import type { PollAction, PollSnapshot, Viewer } from "./protocol";

export { PollActionError, type ConnStatus } from "./pollConnection";

interface PollContextValue {
  status: ConnStatus;
  poll: PollSnapshot | null;
  you: Viewer | null;
  /** The poll doesn't exist, or was deleted. */
  missing: boolean;
  send: (action: PollAction) => Promise<void>;
}

const PollContext = createContext<PollContextValue | null>(null);

const notConnected = () => Promise.reject(new Error("Not connected."));
const noop = () => () => {};

/** Opens a live connection to one poll for everything inside it. */
export function PollProvider({
  pollId,
  userId,
  hostKey,
  children,
}: {
  pollId: string;
  /** Voters connect as themselves. */
  userId?: string;
  /** The host connects with the key it got when creating the poll. */
  hostKey?: string;
  children: React.ReactNode;
}) {
  const [conn, setConn] = useState<PollConnection | null>(null);

  useEffect(() => {
    const c = new PollConnection(pollId, hostKey ? { hostKey } : { userId: userId ?? "" });
    setConn(c);
    return () => c.close();
  }, [pollId, userId, hostKey]);

  const subscribe = useCallback((cb: () => void) => (conn ? conn.subscribe(cb) : noop()), [conn]);
  useSyncExternalStore(subscribe, () => conn?.version ?? -1);

  const send = useCallback(
    (action: PollAction) => (conn ? conn.send(action) : notConnected()),
    [conn],
  );

  const value: PollContextValue = {
    status: conn?.status ?? "connecting",
    poll: conn?.snapshot ?? null,
    you: conn?.you ?? null,
    missing: conn?.missing ?? false,
    send,
  };
  return <PollContext.Provider value={value}>{children}</PollContext.Provider>;
}

export function usePoll(): PollContextValue {
  const ctx = useContext(PollContext);
  if (!ctx) throw new Error("usePoll must be used inside <PollProvider>");
  return ctx;
}

/** Sends an action and logs failures. For fire-and-forget host controls. */
export function useSendAction(): (action: PollAction) => void {
  const { send } = usePoll();
  return useCallback(
    (action: PollAction) => {
      send(action).catch((e) => console.warn(`[rankzap] ${action.type} failed:`, e));
    },
    [send],
  );
}
