import { TALLY_MODES, TALLY_MODE_LABELS, type TallyMode } from "../lib/types";

interface TallyModeSelectorProps {
  value: TallyMode;
  onChange: (mode: TallyMode) => void;
  ariaLabel?: string;
}

export function TallyModeSelector({
  value,
  onChange,
  ariaLabel = "Tally mode (only affects your view)",
}: TallyModeSelectorProps) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-muted leading-none">
      <span className="text-xs font-semibold text-muted whitespace-nowrap">Scoring</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TallyMode)}
        className="h-9 min-w-38 cursor-pointer border border-border bg-surface-2 px-2.5 pr-8 text-sm font-medium text-text outline-none transition-colors hover:border-accent/40 focus:border-accent"
        aria-label={ariaLabel}
      >
        {TALLY_MODES.map((m) => (
          <option key={m} value={m}>
            {TALLY_MODE_LABELS[m]}
          </option>
        ))}
      </select>
    </label>
  );
}
