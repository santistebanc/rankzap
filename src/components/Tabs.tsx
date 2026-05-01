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
      className="flex w-full flex-nowrap divide-x divide-border/60 overflow-x-auto border-b border-border/80"
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
            disabled={tab.disabled}
            title={tab.disabled && tab.hint ? tab.hint : undefined}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`min-h-11 min-w-0 flex-1 shrink px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
              selected
                ? "bg-surface-2 font-semibold text-text"
                : "font-medium text-muted hover:bg-surface-2/80 hover:text-text"
            } ${tab.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
