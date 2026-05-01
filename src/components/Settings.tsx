import { SET_OPTS, useRoom, useRoomValue } from "../lib/room";
import { DEFAULT_SETTINGS, type Settings as SettingsT } from "../lib/types";

export function Settings() {
  const { client } = useRoom();
  const { value: stored } = useRoomValue("settings");
  const settings: SettingsT = { ...DEFAULT_SETTINGS(), ...(stored ?? {}) };

  const update = (patch: Partial<SettingsT>) => {
    void client
      .set("settings", { ...settings, ...patch }, SET_OPTS)
      .catch((e) => console.warn("[voter] failed to update settings:", e));
  };

  return (
    <section aria-label="Settings" className="w-full">
      <div className="flex flex-col">
        <Toggle
          label="Show live results to voters"
          value={settings.showLiveResults}
          onChange={(v) => update({ showLiveResults: v })}
        />
        <Toggle
          label="Allow voters to update their submitted vote"
          value={settings.allowRevote}
          onChange={(v) => update({ allowRevote: v })}
        />
        <Toggle
          label="Allow voters to add options"
          value={settings.allowAdd}
          onChange={(v) => update({ allowAdd: v })}
        />
        <Toggle
          label="Show voter list to voters"
          value={settings.showUsers}
          onChange={(v) => update({ showUsers: v })}
        />
        <Toggle
          label="Let voters view other voters' rankings"
          value={settings.showVoterVotes}
          onChange={(v) => update({ showVoterVotes: v })}
        />
      </div>
    </section>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-b border-border px-3 py-3 last:border-b-0 sm:min-h-12 sm:px-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-11 shrink-0 cursor-pointer transition-colors ${
          value ? "bg-accent" : "border border-border bg-surface-2"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 size-6 bg-surface shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
