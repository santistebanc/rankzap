import { TALLY_MODES, TALLY_MODE_LABELS, type TallyMode } from "../lib/types";

interface TallyModeSelectorProps {
  value: TallyMode;
  onChange: (mode: TallyMode) => void;
}

export function TallyModeSelector({ value, onChange }: TallyModeSelectorProps) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      <span>Tally:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TallyMode)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
        aria-label="Tally mode (only affects your view)"
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
