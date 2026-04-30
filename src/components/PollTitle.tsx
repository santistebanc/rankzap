import { useEffect, useRef, useState } from "react";
import { SET_OPTS, useRoom, useRoomValue } from "../lib/room";
import { clampTitle, DEFAULT_META } from "../lib/types";

interface PollTitleProps {
  editable: boolean;
}

export function PollTitle({ editable }: PollTitleProps) {
  const { client } = useRoom();
  const { value: meta } = useRoomValue("meta");
  const title = meta?.title ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string>(title);
  const [focused, setFocused] = useState(false);

  // Sync FROM server only when input is unfocused — avoids flicker fight.
  useEffect(() => {
    if (!focused) setDraft(title);
  }, [title, focused]);

  // Mirror to document.title.
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  const commit = (next: string) => {
    const clamped = clampTitle(next);
    if (!clamped || clamped === title) {
      setDraft(title);
      return;
    }
    const base = meta ?? DEFAULT_META();
    void client
      .set("meta", { ...base, title: clamped }, SET_OPTS)
      .catch((e) => console.warn("[voter] failed to update title:", e));
  };

  if (!editable) {
    return (
      <h1 className="text-2xl font-semibold tracking-tight break-words">
        {title || "Untitled poll"}
      </h1>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      maxLength={100}
      aria-label="Poll title"
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
        } else if (e.key === "Escape") {
          setDraft(title);
          inputRef.current?.blur();
        }
      }}
      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-accent focus:bg-surface"
    />
  );
}
