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
    if (clamped !== name) {
      persistVoterName(clamped);
      onCommit(clamped);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-12 w-full min-w-0 items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          maxLength={NAME_MAX}
          placeholder="Your name"
          autoComplete="name"
          onChange={(e) => {
            setDraft(e.target.value);
          }}
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
          aria-label="Your name"
          className="h-12 min-w-0 w-full max-w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent sm:max-w-72"
        />
      </div>
    </div>
  );
}
