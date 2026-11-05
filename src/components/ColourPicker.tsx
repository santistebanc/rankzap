import { useRef, useState } from "react";
import { applyPollColour } from "../lib/pollColour";
import { POLL_COLOUR_IDS, POLL_COLOURS, type PollColour } from "../lib/types";

interface ColourPickerProps {
  value: PollColour;
  className?: string;
  /** Home picks a future poll's colour without repainting the page. */
  previewPage?: boolean;
  /** Resolves once saved; a rejection puts the previous colour back. */
  onChange: (next: PollColour) => Promise<unknown>;
}

/**
 * Eight swatches as a radio group. Picking one floods the page with the new
 * colour from the swatch outwards (View Transitions), or switches instantly
 * when the API is missing or reduced motion is on.
 */
export function ColourPicker({ value, onChange, className = "grid-cols-8", previewPage = true }: ColourPickerProps) {
  const refs = useRef(new Map<PollColour, HTMLButtonElement>());
  // The room only reports the new colour after a round trip, so show the pick right away.
  const [pending, setPending] = useState<{ from: PollColour; to: PollColour } | null>(null);
  const shown = pending && pending.from === value ? pending.to : value;

  const pick = (next: PollColour) => {
    if (next === shown) return;
    const button = refs.current.get(next);
    const commit = () => {
      if (previewPage) applyPollColour(next);
      setPending({ from: value, to: next });
      onChange(next).catch(() => {
        setPending(null);
        if (previewPage) applyPollColour(value);
      });
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!previewPage || !document.startViewTransition || reduced || !button) {
      commit();
      return;
    }
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    void document.startViewTransition(commit).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 550, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  };

  const onKeyDown = (e: React.KeyboardEvent, current: PollColour) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = POLL_COLOUR_IDS.indexOf(current);
    const next = POLL_COLOUR_IDS[(i + step + POLL_COLOUR_IDS.length) % POLL_COLOUR_IDS.length];
    refs.current.get(next)?.focus();
    pick(next);
  };

  return (
    <div role="radiogroup" aria-label="Poll colour" className={`grid gap-1.5 ${className}`}>
      {POLL_COLOUR_IDS.map((id) => {
        const c = POLL_COLOURS[id];
        const checked = id === shown;
        return (
          <button
            key={id}
            ref={(el) => {
              if (el) refs.current.set(id, el);
              else refs.current.delete(id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={c.name}
            title={c.name}
            tabIndex={checked ? 0 : -1}
            onClick={() => pick(id)}
            onKeyDown={(e) => onKeyDown(e, id)}
            style={{ background: c.sig, color: c.ink }}
            className={`grid aspect-square min-h-11 place-items-center transition-[transform,box-shadow] duration-200 ease-(--ease-spring) active:scale-95 ${
              checked
                ? "scale-105 shadow-[0_0_0_4px_#0b0b0b]"
                : "shadow-[0_0_0_2px_rgb(0_0_0/0.25)] hover:-translate-y-0.5"
            }`}
          >
            <svg viewBox="0 0 24 24" aria-hidden className={`size-[18px] ${checked ? "" : "opacity-0"}`}>
              <path d="M4 12.5 9.5 18 20 6" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinecap="square" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
