export interface TabDef<Id extends string> {
  id: Id;
  label: string;
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
    <div role="tablist" aria-label="Voter view" className="flex gap-1 rounded-lg bg-surface-2 p-1">
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
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              selected
                ? "bg-surface text-text shadow-sm"
                : "text-muted hover:text-text"
            } ${tab.disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
