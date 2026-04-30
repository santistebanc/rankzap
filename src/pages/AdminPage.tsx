import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RoomProvider, touchKey, useRoom, useRoomValue } from "../lib/room";
import { DEFAULT_SETTINGS } from "../lib/types";
import { clearAdminLastRoomId } from "../lib/storage";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { ShareLink } from "../components/ShareLink";
import { UsersList } from "../components/UsersList";
import { PollTitle } from "../components/PollTitle";
import { LiveOptions } from "../components/LiveOptions";
import { AddOption } from "../components/AddOption";
import { Settings as SettingsPanel } from "../components/Settings";
import { PollState } from "../components/PollState";

export function AdminPage() {
  const { roomId = "" } = useParams<{ roomId: string }>();
  if (!roomId) return null;

  return (
    <RoomProvider roomId={roomId}>
      <ConnectionStatus />
      <AdminLayout roomId={roomId} />
    </RoomProvider>
  );
}

function AdminLayout({ roomId }: { roomId: string }) {
  const { client, status } = useRoom();
  const navigate = useNavigate();
  const { value: storedSettings } = useRoomValue("settings");
  const { value: meta } = useRoomValue("meta");
  const settings = storedSettings ?? DEFAULT_SETTINGS();

  // Touch meta + settings on connect to refresh their TTL.
  useEffect(() => {
    if (status !== "ready") return;
    void touchKey(client, "meta");
    void touchKey(client, "settings");
  }, [client, status]);

  const newPoll = () => {
    clearAdminLastRoomId();
    navigate("/", { replace: true });
  };

  // Skeleton until meta loads — avoids flash of "Untitled poll".
  const ready = meta !== undefined;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 pb-16 sm:py-8">
      <header className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
          Admin
        </span>
        <button
          type="button"
          onClick={newPoll}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
        >
          New poll
        </button>
      </header>

      <ShareLink roomId={roomId} />

      <UsersList />

      <PollTitle editable />

      {ready ? (
        <>
          <section aria-label="Options" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-muted">
              Options
            </h2>
            <LiveOptions
              removable
              showResults
              tallyMode={settings.tallyMode}
              editable
            />
            <AddOption addedBy="admin" />
          </section>

          <SettingsPanel />

          <section aria-label="Poll state" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-muted">
              Poll state
            </h2>
            <PollState controllable />
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          Loading poll…
        </div>
      )}
    </main>
  );
}
