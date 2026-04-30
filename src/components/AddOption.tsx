import { useState, type ChangeEvent, type FormEvent } from "react";
import { nanoid } from "nanoid";
import { SET_OPTS, useRoom } from "../lib/room";
import { clampOption, OPTION_MAX, PASTE_THROTTLE_MS } from "../lib/types";

interface AddOptionProps {
  /** Identifier of the user adding (admin can pass "admin"). */
  addedBy: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AddOption({ addedBy }: AddOptionProps) {
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = text;
    if (!clampOption(v)) return;
    setText("");
    await writeOne(v);
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
    for (let i = 0; i < lines.length; i++) {
      setBatchMessage(`Adding ${i + 1} / ${lines.length}…`);
      await writeOne(lines[i]);
      if (i < lines.length - 1) await sleep(PASTE_THROTTLE_MS);
    }
    setBatchMessage(null);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          onPaste={onPaste}
          maxLength={OPTION_MAX}
          placeholder="Add an option…"
          aria-label="Add an option"
          disabled={busy}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!clampOption(text) || busy}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {batchMessage ? (
        <p role="status" aria-live="polite" className="text-xs text-muted">
          {batchMessage}
        </p>
      ) : (
        <p className="text-[0.7rem] text-muted">
          Tip: paste multiple lines to add several options at once.
        </p>
      )}
    </form>
  );
}
