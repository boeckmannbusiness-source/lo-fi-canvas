import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { createMobileDelivery, type MobileDeliveryDependencies } from "@/lib/send-to-mobile";

export interface SendToMobileProps {
  /** The already-produced MP4 to upload (export, converted file, or original). */
  blob: Blob;
  filename: string;
  /** Idle action label. */
  label?: string;
  /** Label shown while the upload is running. */
  uploadingLabel?: string;
  /** Optional label after a failed upload (e.g. "Retry"). */
  retryLabel?: string;
  /** Extra classes for the action buttons (each surface sets its own height). */
  buttonClassName?: string;
  /** Test seam; the app uses the real Cloudinary helpers. */
  dependencies?: Partial<MobileDeliveryDependencies>;
}

/**
 * The shared Cloudinary "send to mobile" delivery UI.
 *
 * Owns the upload state and renders the same link/copy/error presentation in
 * both the visualizer export panel and the TikTok converter. It only ever
 * uploads the Blob it receives — never a re-encode.
 */
export function SendToMobile({
  blob,
  filename,
  label = "Send to phone",
  uploadingLabel = "Uploading…",
  retryLabel,
  buttonClassName = "h-7",
  dependencies,
}: SendToMobileProps) {
  const delivery = useMemo(() => createMobileDelivery(dependencies), [dependencies]);
  const snapshot = useSyncExternalStore(
    delivery.subscribe,
    delivery.getSnapshot,
    delivery.getSnapshot,
  );
  const [copied, setCopied] = useState(false);

  // A new source (fresh export/conversion/file) starts a clean delivery state.
  useEffect(() => {
    delivery.reset();
  }, [delivery, blob, filename]);

  useEffect(() => {
    setCopied(false);
  }, [snapshot.secureUrl]);

  const run = async () => {
    const next = await delivery.send(blob, filename);
    if (next.status === "ready") toast.success("Mobile link ready.");
    else if (next.status === "error") console.error(next.error);
  };

  const copyLink = async () => {
    if (!snapshot.secureUrl) return;
    try {
      await navigator.clipboard.writeText(snapshot.secureUrl);
      setCopied(true);
      toast.success("Link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically — select the link to copy it.");
    }
  };

  const uploading = snapshot.status === "uploading";
  const showRetry = snapshot.status === "error" && retryLabel !== undefined;

  return (
    <>
      {!snapshot.secureUrl && (
        <Button
          size="sm"
          className={`${buttonClassName} gap-1.5 text-xs`}
          onClick={() => void run()}
          disabled={uploading}
        >
          <Smartphone className="size-3.5" />
          {uploading ? uploadingLabel : showRetry ? retryLabel : label}
        </Button>
      )}
      {snapshot.secureUrl && (
        <>
          <span className="text-[11px] text-muted-foreground">Mobile link ready</span>
          <Button
            size="sm"
            className={`${buttonClassName} gap-1.5 text-xs`}
            onClick={() => void copyLink()}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy download link"}
          </Button>
          <a
            href={snapshot.secureUrl}
            target="_blank"
            rel="noreferrer"
            className="max-w-[240px] truncate font-mono text-[10px] text-primary underline"
          >
            {snapshot.secureUrl}
          </a>
        </>
      )}
      {snapshot.error && <span className="text-[10px] text-destructive">{snapshot.error}</span>}
    </>
  );
}
