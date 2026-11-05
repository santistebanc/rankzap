import { useLayoutEffect } from "react";
import { POLL_COLOURS, type PollColour } from "./types";

const VARS = ["--sig", "--sig-ink", "--sig-fg"] as const;

/** Black with white text, shown while a poll loads so its colour can flood in after. */
const LOADING = { sig: "#0b0b0b", ink: "#ffffff", fg: "#ffffff" };

/** A poll colour, or the black loading palette. */
export type PagePalette = PollColour | "loading";

/** Sets the palette on <html>, where the page background (`--ground`) lives. */
export function applyPollColour(palette: PagePalette): void {
  const { sig, ink, fg } = palette === "loading" ? LOADING : POLL_COLOURS[palette];
  const root = document.documentElement.style;
  root.setProperty("--sig", sig);
  root.setProperty("--sig-ink", ink);
  root.setProperty("--sig-fg", fg);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = sig;
}

/**
 * Paints the page in the poll's colour while a poll screen is mounted.
 * Unmounting restores the brand yellow from index.css, so Home stays yellow.
 */
export function usePollColour(palette: PagePalette): void {
  useLayoutEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColour = meta?.content;
    applyPollColour(palette);
    return () => {
      const root = document.documentElement.style;
      for (const v of VARS) root.removeProperty(v);
      if (meta && previousThemeColour !== undefined) meta.content = previousThemeColour;
    };
  }, [palette]);
}

/**
 * Runs `update` (which must change the page synchronously) and reveals the
 * result in a circle growing from (x, y). Falls back to a plain update when
 * View Transitions are missing or reduced motion is on.
 */
export function floodReveal(update: () => void, x: number, y: number): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduced) {
    update();
    return;
  }
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  void document.startViewTransition(update).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 550, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}
