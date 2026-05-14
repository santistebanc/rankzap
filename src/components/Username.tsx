import { useEffect, useRef, useState } from "react";
import { clampName, NAME_MAX } from "../lib/types";
import { persistVoterName } from "../lib/identity";

interface UsernameProps {
  name: string;
  onCommit: (next: string) => void;
  placeholder?: string;
}

export function Username({ name, onCommit, placeholder = "your name…" }: UsernameProps) {
  const [draft, setDraft] = useState(name);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync FROM external when not focused.
  useEffect(() => {
    if (!focused) setDraft(name);
  }, [name, focused]);

  const commit = (next: string) => {
    const clamped = clampName(next);
    if (clamped !== name) {
      persistVoterName(clamped);
      onCommit(clamped);
    }
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      maxLength={NAME_MAX}
      placeholder={placeholder}
      autoComplete="name"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { setFocused(false); commit(e.target.value); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); inputRef.current?.blur(); }
      }}
      aria-label="Your name"
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "1rem",
        color: "var(--text)",
        background: "transparent",
        border: "none",
        borderBottom: `1.5px ${focused ? "solid" : "dashed"} ${focused ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 0,
        outline: "none",
        padding: "4px 2px 6px",
        width: "100%",
        maxWidth: 240,
        transition: "border-color 0.15s",
        caretColor: "var(--accent)",
      }}
    />
  );
}
