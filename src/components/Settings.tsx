import { Check } from "lucide-react";
import { SET_OPTS, useRoom, useRoomValue } from "../lib/room";
import { DEFAULT_SETTINGS, TALLY_MODES, TALLY_MODE_LABELS, type Settings as SettingsT } from "../lib/types";

export function Settings() {
  const { client } = useRoom();
  const { value: stored } = useRoomValue("settings");
  const settings: SettingsT = { ...DEFAULT_SETTINGS(), ...(stored ?? {}) };

  const update = (patch: Partial<SettingsT>) => {
    void client
      .set("settings", { ...settings, ...patch }, SET_OPTS)
      .catch((e) => console.warn("[rankzap] failed to update settings:", e));
  };

  return (
    <section aria-label="Settings" className="w-full">
      <div className="flex flex-col">
        <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border px-3 py-3 sm:min-h-12 sm:px-4">
          <div className="text-base font-medium">Scoring method</div>
          <div role="group" aria-label="Scoring method" className="flex gap-1 rounded-full bg-surface-2 p-1">
            {TALLY_MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={settings.tallyMode === m}
                onClick={() => update({ tallyMode: m })}
                className={`min-h-11 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  settings.tallyMode === m
                    ? "bg-text/90 text-bg"
                    : "text-muted hover:text-text"
                }`}
              >
                {TALLY_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
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
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border px-3 py-3 last:border-b-0 sm:min-h-12 sm:px-4">
      <div className="min-w-0">
        <div className="text-base font-medium">{label}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
          value ? "bg-accent" : "border border-border bg-surface-2"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 flex size-6 items-center justify-center rounded-full bg-surface shadow-card transition-transform ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        >
          {value ? (
            <Check className="size-3 text-accent" strokeWidth={2.5} aria-hidden />
          ) : null}
        </span>
      </button>
    </div>
  );
}
