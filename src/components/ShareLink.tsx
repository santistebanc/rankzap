import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildVoterUrl } from "../lib/url";

interface ShareLinkProps {
  roomId: string;
}

export function ShareLink({ roomId }: ShareLinkProps) {
  const url = buildVoterUrl(roomId);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!showQr) return;
    let alive = true;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      width: 256,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((data) => {
        if (alive) setQrDataUrl(data);
      })
      .catch((e) => {
        console.warn("[voter] qr generation failed:", e);
      });
    return () => {
      alive = false;
    };
  }, [showQr, url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn("[voter] clipboard write failed:", e);
    }
  };

  return (
    <section
      aria-label="Share voter link"
      className="rounded-xl border border-border bg-surface p-3"
    >
      <div className="text-xs text-muted">Voter link</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-surface-2 px-2 py-1.5 font-mono text-xs">
          {url}
        </code>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
        >
          Open in new tab
        </a>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          aria-expanded={showQr}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
        >
          {showQr ? "Hide QR" : "Show QR"}
        </button>
      </div>
      {showQr ? (
        <div className="mt-3 flex justify-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR code for the voter URL: ${url}`}
              className="rounded-md border border-border bg-white p-1"
              width={256}
              height={256}
            />
          ) : (
            <div className="text-xs text-muted">Generating QR…</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
