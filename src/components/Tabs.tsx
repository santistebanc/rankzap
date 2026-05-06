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
}

export function Tabs<Id extends string>({ tabs, active, onChange }: TabsProps<Id>) {
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
            role="tab"
            type="button"
            aria-selected={selected}
            aria-disabled={tab.disabled}
            title={tab.disabled && tab.hint ? tab.hint : undefined}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`min-h-9 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors ${
              selected
                ? "bg-accent font-semibold text-white"
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
