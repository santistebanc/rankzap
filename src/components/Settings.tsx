import { SET_OPTS, useRoom, useRoomValue } from "../lib/room";
import {
  DEFAULT_SETTINGS,
  TALLY_MODES,
  TALLY_MODE_LABELS,
  type Settings as SettingsT,
  type TallyMode,
} from "../lib/types";

export function Settings() {
  const { client } = useRoom();
  const { value: stored } = useRoomValue("settings");
  const settings = stored ?? DEFAULT_SETTINGS();

  const update = (patch: Partial<SettingsT>) => {
    void client
      .set("settings", { ...settings, ...patch }, SET_OPTS)
      .catch((e) => console.warn("[voter] failed to update settings:", e));
  };

  return (
    <section aria-label="Settings" className="rounded-xl border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold tracking-tight">
        Settings
      </h2>
      <div className="flex flex-col">
        <Row label="Ranking system">
          <select
            value={settings.tallyMode}
            onChange={(e) => update({ tallyMode: e.target.value as TallyMode })}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
          >
            {TALLY_MODES.map((m) => (
              <option key={m} value={m}>
                {TALLY_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Row>
        <Toggle
          label="Show live results"
          hint="Voters see results before the poll closes."
          value={settings.showLiveResults}
          onChange={(v) => update({ showLiveResults: v })}
        />
        <Toggle
          label="Allow change vote"
          hint="Voters can re-rank and re-submit while the poll is open."
          value={settings.allowRevote}
          onChange={(v) => update({ allowRevote: v })}
        />
        <Toggle
          label="Allow adding options"
          hint="Voters can add write-in options."
          value={settings.allowAdd}
          onChange={(v) => update({ allowAdd: v })}
        />
        <Toggle
          label="Show users to voters"
          hint="When off, voters don't see the participants list."
          value={settings.showUsers}
          onChange={(v) => update({ showUsers: v })}
        />
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? "bg-accent" : "bg-surface-2 border border-border"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
