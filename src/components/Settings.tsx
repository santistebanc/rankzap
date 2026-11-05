import { usePoll } from "../lib/poll";
import { usePollData } from "../pages/poll/shared";
import {
  pollColourOf,
  POLL_COLOURS,
  TALLY_MODE_INFO,
  TALLY_MODES,
  type Settings as SettingsT,
} from "../lib/types";
import { ColourPicker } from "./ColourPicker";

/** The poll's settings plus a writer that merges a patch into them. */
function useSettings() {
  const { settings } = usePollData();
  const { send } = usePoll();
  const save = (patch: Partial<SettingsT>) =>
    send({ type: "updateSettings", patch }).catch((e) => {
      console.warn("[rankzap] failed to update settings:", e);
      throw e;
    });
  const update = (patch: Partial<SettingsT>) => {
    save(patch).catch(() => {});
  };
  return { settings, save, update };
}

/** A white admin panel with a condensed heading and an optional note on the right. */
export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={`bg-step px-5 pt-[18px] pb-5 text-step-ink [--ink:var(--step-ink)] ${className}`}>
      <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <span className="display text-[26px]">{title}</span>
        {aside ? <span className="text-right text-[13px] font-bold">{aside}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function ColourPanel() {
  const { settings, save } = useSettings();
  const colour = pollColourOf(settings.colour);
  return (
    <Panel title="Colour" aside={POLL_COLOURS[colour].name}>
      <div className="@container">
        <ColourPicker value={colour} onChange={(next) => save({ colour: next })} className="grid-cols-4 @min-[394px]:grid-cols-8" />
      </div>
    </Panel>
  );
}

const SHORT_LABELS = { borda: "Borda", dowdall: "Dowdall", copeland: "Copeland" } as const;

export function ScoringPanel() {
  const { settings, update } = useSettings();
  return (
    <Panel title="Scoring">
      <div role="group" aria-label="Scoring method" className="grid grid-cols-3 gap-1">
        {TALLY_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={settings.tallyMode === m}
            onClick={() => update({ tallyMode: m })}
            className="min-h-11 bg-[#f1efe8] text-[15px] font-extrabold text-[#0b0b0b] aria-pressed:bg-[#0b0b0b] aria-pressed:text-sig-fg"
          >
            {SHORT_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[13px] leading-snug">{TALLY_MODE_INFO[settings.tallyMode].summary}</p>
    </Panel>
  );
}

export function SettingsPanel() {
  const { settings, update } = useSettings();
  return (
    <Panel title="Settings">
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
    </Panel>
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
    <div className="flex min-h-12 items-center justify-between gap-4 border-b-2 border-[#f1efe8] py-2 text-[15px] font-semibold last:border-b-0">
      <span className="min-w-0">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-12 shrink-0 transition-colors ${value ? "bg-[#0b0b0b]" : "bg-[#f1efe8]"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 left-1 size-5 transition-transform duration-200 ease-(--ease-spring) ${
            value ? "translate-x-5 bg-sig-fg" : "translate-x-0 bg-[#0b0b0b]/40"
          }`}
        />
      </button>
    </div>
  );
}
