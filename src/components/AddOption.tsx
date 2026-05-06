import { useState, type ChangeEvent, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { nanoid } from "nanoid";
import { SET_OPTS, useRoom } from "../lib/room";
import { clampOption, OPTION_MAX, PASTE_THROTTLE_MS } from "../lib/types";

interface AddOptionProps {
  addedBy: string;
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
      await client.set(`options/${id}`, { id, text: clamped, addedBy, addedAt: Date.now() }, SET_OPTS);
    } catch (e) {
      console.warn("[rankzap] failed to add option:", e);
    }
  };

  const addTexts = async (texts: string[]) => {
    if (texts.length === 0) return;
    if (onAddOption) { await onAddOption(texts); return; }
    for (let i = 0; i < texts.length; i++) {
      await writeOne(texts[i]);
      if (i < texts.length - 1) await sleep(PASTE_THROTTLE_MS);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clamped = clampOption(text);
    if (!clamped) return;
    setText("");
    await addTexts([clamped]);
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const data = e.clipboardData.getData("text");
    if (!data.includes("\n")) return;
    e.preventDefault();
    const lines = data.split(/\r?\n/).map((l) => clampOption(l)).filter(Boolean);
    if (lines.length === 0) return;
    setBusy(true);
    setBatchMessage(`Adding ${lines.length} options…`);
    await addTexts(lines as string[]);
    setBatchMessage(null);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-border/20 px-4 py-3">
      <span className="flex size-6 shrink-0 items-center justify-center text-muted/60" aria-hidden="true">
        <Plus className="size-4" strokeWidth={2} aria-hidden />
      </span>
      <input
        value={text}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
        onPaste={onPaste}
        maxLength={OPTION_MAX}
        placeholder={batchMessage ?? "Add an item…"}
        aria-label="Add an option"
        disabled={busy}
        className="min-h-0 flex-1 bg-transparent py-1 text-sm text-text outline-none placeholder:text-muted/50 disabled:opacity-50"
      />
    </form>
  );
}
