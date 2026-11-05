import { useState, type ChangeEvent, type FormEvent } from "react";
import { nanoid } from "nanoid";
import { SET_OPTS, useRoom } from "../lib/room";
import { clampOption, OPTION_MAX, PASTE_THROTTLE_MS } from "../lib/types";
import { adaptiveSize } from "../lib/adaptiveSize";

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
    <form
      onSubmit={submit}
      className="grid min-h-[52px] grid-cols-[74px_1fr] items-center text-ink shadow-[inset_0_0_0_3px_currentColor] focus-within:bg-step focus-within:text-step-ink focus-within:shadow-none"
    >
      <span className="display text-center text-[34px]" aria-hidden="true">+</span>
      <input
        value={text}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
        onPaste={onPaste}
        maxLength={OPTION_MAX}
        placeholder={batchMessage ?? "Add an option"}
        aria-label="Add an option"
        disabled={busy}
        style={{ fontSize: adaptiveSize(text, 15, 17, 20, 80) }}
        className="min-h-[52px] min-w-0 bg-transparent pr-4 font-bold outline-none placeholder:text-current placeholder:opacity-100 focus:placeholder:opacity-40 disabled:opacity-50"
      />
    </form>
  );

}
