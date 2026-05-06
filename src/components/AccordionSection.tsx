import { type ReactNode, useId, useState } from "react";

interface AccordionSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionSection({
  title,
  defaultOpen = false,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const triggerId = useId();
  const panelId = useId();

  return (
    <section
      className="overflow-hidden rounded-xl bg-surface shadow-card"
      aria-labelledby={triggerId}
    >
      <button
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:z-10 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-accent sm:px-4"
      >
        <span className="text-base font-semibold tracking-tight text-text">{title}</span>
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-surface-2 text-muted transition-[transform,color] duration-200 ${
            open ? "rotate-180 text-text" : ""
          }`}
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="border-t border-border px-4 pb-4 pt-3 sm:px-4"
            inert={!open ? true : undefined}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
