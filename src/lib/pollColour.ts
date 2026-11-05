import { useLayoutEffect } from "react";
import { POLL_COLOURS, type PollColour } from "./types";

const VARS = ["--sig", "--sig-ink", "--sig-fg"] as const;

/** Sets the poll colour on <html>, where the page background (`--ground`) lives. */
export function applyPollColour(colour: PollColour): void {
  const { sig, ink, fg } = POLL_COLOURS[colour];
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
export function usePollColour(colour: PollColour): void {
  useLayoutEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColour = meta?.content;
    applyPollColour(colour);
    return () => {
      const root = document.documentElement.style;
      for (const v of VARS) root.removeProperty(v);
      if (meta && previousThemeColour !== undefined) meta.content = previousThemeColour;
    };
  }, [colour]);
}
