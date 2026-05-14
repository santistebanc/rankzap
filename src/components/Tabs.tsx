import type { ReactNode } from "react";

export interface TabDef<Id extends string> {
  id: Id;
  label: ReactNode;
  disabled?: boolean;
  hint?: string;
}

interface TabsProps<Id extends string> {
  tabs: readonly TabDef<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  /** When provided, buttons get id=`${idPrefix}-${tab.id}` and aria-controls=`${panelIdPrefix}-${tab.id}`. */
  idPrefix?: string;
  panelIdPrefix?: string;
}

export function Tabs<Id extends string>({ tabs, active, onChange, idPrefix, panelIdPrefix }: TabsProps<Id>) {
  return (
    <div
      role="tablist"
      aria-label="Poll view tabs"
      className="inline-flex gap-1 rounded-full bg-surface p-1 shadow-card"
    >
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            id={idPrefix ? `${idPrefix}-${tab.id}` : undefined}
            aria-controls={panelIdPrefix ? `${panelIdPrefix}-${tab.id}` : undefined}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-disabled={tab.disabled}
            tabIndex={tab.disabled ? -1 : undefined}
            title={tab.disabled && tab.hint ? tab.hint : undefined}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`min-h-11 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors ${
              selected
                ? "bg-text/90 font-semibold text-bg"
                : "font-medium text-muted hover:bg-surface-2 hover:text-text"
            } ${tab.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
