import { useEffect, useRef, useState } from "react";
import { Check, Copy, QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { buildVoterUrl } from "../lib/url";

interface ShareBarProps {
  roomId: string;
}

export function ShareBar({ roomId }: ShareBarProps) {
  const url = buildVoterUrl(roomId);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const qrTriggerRef = useRef<HTMLButtonElement>(null);
  const qrDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "Q",
      width: 520,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((data) => {
        if (alive) setQrDataUrl(data);
      })
      .catch((e) => {
        console.warn("[rankzap] qr generation failed:", e);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn("[rankzap] clipboard write failed:", e);
    }
  };

  useEffect(() => {
    if (!isQrOpen) return;
    const getFocusable = () =>
      Array.from(
        qrDialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    getFocusable()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setIsQrOpen(false); return; }
      if (e.key !== "Tab") return;
      const els = getFocusable();
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      qrTriggerRef.current?.focus();
    };
  }, [isQrOpen]);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex min-h-11 w-full min-w-0 items-stretch overflow-hidden border-t border-b border-border"
        role="region"
        aria-label="Poll link for voters"
      >
        <div className="flex min-h-11 min-w-0 flex-1 items-center px-1 py-2">
          <p className="m-0 min-w-0 flex-1 cursor-text select-text text-sm leading-snug break-all text-text">
            {url}
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          title={copied ? "Copied" : "Copy link"}
          aria-label={copied ? "Copied" : "Copy link"}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center border-border border-l px-2 text-text transition-opacity hover:opacity-60 focus-visible:z-10 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {copied ? (
            <Check className="size-4" strokeWidth={2} aria-hidden />
          ) : (
            <Copy className="size-4" strokeWidth={2} aria-hidden />
          )}
        </button>
        <button
          ref={qrTriggerRef}
          type="button"
          onClick={() => setIsQrOpen(true)}
          title="Show QR code"
          aria-label="Show QR code"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center border-border border-l px-2 text-text transition-opacity hover:opacity-60 focus-visible:z-10 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-accent lg:hidden"
        >
          <QrCode className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      {/* Desktop: always-visible QR panel (white backing kept for scannability) */}
      <div className="hidden flex-col items-start gap-3 lg:flex">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR code for the voter link to this poll"
            width={320}
            height={320}
            className="block rounded-[10px] bg-surface p-3"
          />
        ) : (
          <div className="flex h-[320px] w-[320px] items-center justify-center bg-surface text-xs text-muted">Generating…</div>
        )}
        <span className="font-mono text-[11px] text-muted">scan to open poll</span>
      </div>

      {isQrOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/55 p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))]"
          role="dialog"
          aria-modal="true"
          aria-label="QR code for this poll link"
          onClick={() => setIsQrOpen(false)}
        >
          <div
            ref={qrDialogRef}
            className="w-full max-w-[min(620px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-page"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="m-0 text-sm font-semibold text-text">Scan to open poll</p>
              <button
                type="button"
                onClick={() => setIsQrOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-accent"
                aria-label="Close QR code modal"
                title="Close"
              >
                <X className="size-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
            {qrDataUrl ? (
              <div className="mx-auto inline-block overflow-hidden rounded border border-border">
                <img
                  src={qrDataUrl}
                  alt="QR code for the voter link to this poll"
                  className="block h-auto w-[min(520px,calc(100vw-4.5rem))]"
                  width={520}
                  height={520}
                />
              </div>
            ) : (
              <div className="py-3 text-sm text-muted">Generating…</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
