import { useState, type ChangeEvent, type FormEvent } from "react";
import { nanoid } from "nanoid";
import { SET_OPTS, useRoom } from "../lib/room";
import { clampOption, OPTION_MAX, PASTE_THROTTLE_MS } from "../lib/types";

interface AddOptionProps {
  /** Identifier of the user adding (admin can pass "admin"). */
  addedBy: string;
  /** Optional custom handler (used to stage local options before submit). */
  onAddOption?: (texts: string[]) => Promise<void> | void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AddOption({ addedBy, onAddOption }: AddOptionProps) {
  const { client } = useRoom();
  const [text, setText] = useState("");
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const writeOne = async (raw: string) => {
    const clamped = clampOption(raw);
    if (!clamped) return;
    const id = nanoid(10);
    try {
      await client.set(
        `options/${id}`,
        { id, text: clamped, addedBy, addedAt: Date.now() },
        SET_OPTS,
      );
    } catch (e) {
      console.warn("[voter] failed to add option:", e);
    }
  };

  const addTexts = async (texts: string[]) => {
    if (texts.length === 0) return;
    if (onAddOption) {
      await onAddOption(texts);
      return;
    }
    for (let i = 0; i < texts.length; i++) {
      await writeOne(texts[i]);
      if (i < texts.length - 1) await sleep(PASTE_THROTTLE_MS);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = text;
    const clamped = clampOption(v);
    if (!clamped) return;
    setText("");
    await addTexts([clamped]);
  };

  // Multi-line paste → batch add (throttled).
  const onPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const data = e.clipboardData.getData("text");
    if (!data.includes("\n")) return; // single-line paste — let it through normally
    e.preventDefault();
    const lines = data
      .split(/\r?\n/)
      .map((l) => clampOption(l))
      .filter(Boolean);
    if (lines.length === 0) return;
    setBusy(true);
    setBatchMessage(`Adding ${lines.length} options…`);
    await addTexts(lines as string[]);
    setBatchMessage(null);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex w-full min-w-0 items-stretch gap-2">
        <input
          value={text}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          onPaste={onPaste}
          maxLength={OPTION_MAX}
          placeholder="Add an option…"
          aria-label="Add an option"
          disabled={busy}
          className="min-h-12 min-w-0 flex-1 border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!clampOption(text) || busy}
          className="inline-flex min-h-12 shrink-0 items-center justify-center bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {batchMessage ? (
        <p role="status" aria-live="polite" className="text-xs text-muted">
          {batchMessage}
        </p>
      ) : null}
    </form>
  );
}
