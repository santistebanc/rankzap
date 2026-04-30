import { useEffect, useRef, useState } from "react";
import { clampName, NAME_MAX } from "../lib/types";
import { persistVoterName } from "../lib/identity";

interface UsernameProps {
  name: string;
  onCommit: (next: string) => void;
}

export function Username({ name, onCommit }: UsernameProps) {
  const [draft, setDraft] = useState(name);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync FROM external when not focused.
  useEffect(() => {
    if (!focused) setDraft(name);
  }, [name, focused]);

  const commit = (next: string) => {
    const clamped = clampName(next);
    if (!clamped) {
      setDraft(name);
      return;
    }
    if (clamped !== name) {
      persistVoterName(clamped);
      onCommit(clamped);
    }
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">Your name</span>
      <input
        ref={inputRef}
        value={draft}
        maxLength={NAME_MAX}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          }
        }}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
