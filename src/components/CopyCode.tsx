import { useEffect, useRef, useState } from "react";

/**
 * The poll code chip. Tapping it copies the code, and the chip says "Copied"
 * for a moment. Both labels share one grid cell, so the chip keeps its width.
 */
export function CopyCode({ roomId, className = "" }: { roomId: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await writeClipboard(roomId))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy the code"
      aria-label={`Poll code ${roomId}. Copy`}
      className={`grid cursor-pointer bg-chip px-2.5 py-[7px] tracking-[0.04em] text-chip-ink transition-transform active:scale-95 ${className}`}
    >
      <span aria-hidden="true" className={`col-start-1 row-start-1 text-center transition-opacity duration-150 ${copied ? "opacity-0" : ""}`}>
        {roomId}
      </span>
      <span aria-hidden="true" className={`col-start-1 row-start-1 text-center transition-opacity duration-150 ${copied ? "" : "opacity-0"}`}>
        Copied
      </span>
      <span role="status" className="sr-only">
        {copied ? `Copied ${roomId}` : ""}
      </span>
    </button>
  );
}

/** Copies text, falling back to a hidden textarea where the Clipboard API is blocked. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
