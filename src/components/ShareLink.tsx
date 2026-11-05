import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { buildVoterUrl } from "../lib/url";
import { Panel } from "./Settings";

function useQrDataUrl(url: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "Q",
      width: 520,
      margin: 1,
      color: { dark: "#0b0b0b", light: "#ffffff" },
    })
      .then((data) => {
        if (alive) setDataUrl(data);
      })
      .catch((e) => console.warn("[rankzap] qr generation failed:", e));
    return () => {
      alive = false;
    };
  }, [url]);
  return dataUrl;
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn("[rankzap] clipboard write failed:", e);
    }
  };
  return { copied, copy };
}

/** Link without the protocol, for display. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function Qr({ dataUrl, size }: { dataUrl: string | null; size: number }) {
  return dataUrl ? (
    <img
      src={dataUrl}
      alt="QR code for the voter link to this poll"
      width={size}
      height={size}
      className="block h-auto w-full bg-white"
    />
  ) : (
    <div className="grid aspect-square w-full place-items-center bg-white text-xs font-semibold text-[#0b0b0b]">
      Making QR…
    </div>
  );
}

/** Admin panel: small QR, the code, the link, and buttons to copy it or show the big QR. */
export function SharePanel({ roomId, onShowQr }: { roomId: string; onShowQr: () => void }) {
  const url = buildVoterUrl(roomId);
  const qr = useQrDataUrl(url);
  const { copied, copy } = useCopy(url);
  return (
    <Panel title="Share">
      <div className="grid grid-cols-[112px_1fr] items-center gap-3.5">
        <div className="bg-white p-1.5 shadow-[inset_0_0_0_2px_#0b0b0b]">
          <Qr dataUrl={qr} size={100} />
        </div>
        <div className="min-w-0">
          <p className="display text-[56px]">{roomId}</p>
          <p className="mt-1 mb-2.5 truncate text-sm font-semibold">{shortUrl(url)}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={copy}
              className="display min-h-11 bg-[#0b0b0b] px-3.5 text-lg text-sig-fg"
            >
              <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
            </button>
            <button
              type="button"
              onClick={onShowQr}
              className="display min-h-11 px-3.5 text-lg shadow-[inset_0_0_0_3px_#0b0b0b]"
            >
              Show QR
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Full-screen share: a big QR and a code you can read across a room. */
export function ShareScreen({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const url = buildVoterUrl(roomId);
  const qr = useQrDataUrl(url);
  const { copied, copy } = useCopy(url);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-label="Share this poll"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-y-auto border-0 bg-ground p-0 text-ink"
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col px-[18px] pt-3 pb-[max(24px,env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-between text-[15px] font-extrabold">
          <span>Share</span>
          <button autoFocus type="button" onClick={onClose} className="min-h-11 bg-chip px-3.5 text-chip-ink">
            Done
          </button>
        </div>
        <h2 className="display mt-4 mb-4 text-[64px]">Scan to rank.</h2>
        <div className="bg-white p-3 shadow-[inset_0_0_0_3px_#0b0b0b]">
          <Qr dataUrl={qr} size={520} />
        </div>
        <div className="my-1 grid grid-cols-4 gap-1" aria-label={`Code ${roomId.split("").join(" ")}`}>
          {roomId.split("").map((c, i) => (
            <span key={i} aria-hidden="true" className="display bg-[#0b0b0b] pt-2 pb-1 text-center text-[64px] text-sig-fg">
              {c}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-[1fr_auto] gap-1">
          <span className="flex min-w-0 items-center truncate bg-step px-3.5 text-[15px] font-bold text-step-ink">
            {shortUrl(url)}
          </span>
          <button type="button" onClick={copy} className="display min-h-[52px] bg-hi px-5 text-xl text-hi-ink">
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}
