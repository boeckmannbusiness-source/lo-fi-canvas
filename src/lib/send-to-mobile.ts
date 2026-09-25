/**
 * Shared "send to mobile" delivery state for the Cloudinary upload flow.
 *
 * This module is deliberately framework-agnostic: it wraps the existing
 * {@link uploadVideoToCloudinary} helper behind a tiny observable store, so the
 * same implementation can be driven both by the React UI (via
 * `useSyncExternalStore`) and by headless tests (Bun, no DOM).
 *
 * It only ever uploads the Blob it is given. It never renders, re-encodes or
 * transforms: callers pass the already-produced MP4 (a portrait export, a
 * converted TikTok file, or an already-compatible original).
 *
 * The upload promise is guarded so a second `send()` while one is in flight
 * returns the same promise instead of starting a parallel upload.
 */
import {
  CLOUDINARY_NOT_CONFIGURED_MESSAGE,
  readCloudinaryConfig,
  uploadVideoToCloudinary,
  type CloudinaryConfig,
  type CloudinaryUploadResult,
} from "./cloudinary";

export type MobileDeliveryStatus = "idle" | "uploading" | "ready" | "error";

export interface MobileDeliverySnapshot {
  status: MobileDeliveryStatus;
  secureUrl: string | null;
  error: string | null;
}

export interface MobileUploadSource {
  blob: Blob;
  filename: string;
}

/** Injectable seam used by tests; the app uses the real Cloudinary helpers. */
export interface MobileDeliveryDependencies {
  readConfig: () => CloudinaryConfig | null;
  upload: (
    blob: Blob,
    options: { config: CloudinaryConfig; filename?: string },
  ) => Promise<CloudinaryUploadResult>;
}

/** Fallback shown when the upload fails without a usable message. */
export const SEND_TO_MOBILE_FALLBACK_ERROR = "Could not send video to mobile. Please try again.";

const IDLE: MobileDeliverySnapshot = { status: "idle", secureUrl: null, error: null };

export interface MobileDelivery {
  getSnapshot(): MobileDeliverySnapshot;
  subscribe(listener: () => void): () => void;
  /** Upload `blob` at most once per in-flight call; never rejects. */
  send(blob: Blob, filename: string): Promise<MobileDeliverySnapshot>;
  /** Return to idle and ignore any still-running result. */
  reset(): void;
}

/**
 * Decide which bytes the mobile flow must upload.
 *
 * - A finished conversion wins: its Blob is the TikTok-compatible result.
 * - Otherwise an already-compatible source is uploaded unchanged (no
 *   re-encoding), keeping the original filename.
 * - No usable source yet → `null` (the action is hidden/disabled).
 */
export function pickMobileUpload(input: {
  converted: MobileUploadSource | null;
  original: File | null;
  alreadyCompatible: boolean;
}): MobileUploadSource | null {
  const { converted, original, alreadyCompatible } = input;
  if (converted) return { blob: converted.blob, filename: converted.filename };
  if (alreadyCompatible && original) return { blob: original, filename: original.name };
  return null;
}

function sameSnapshot(a: MobileDeliverySnapshot, b: MobileDeliverySnapshot): boolean {
  return a.status === b.status && a.secureUrl === b.secureUrl && a.error === b.error;
}

export function createMobileDelivery(
  dependencies: Partial<MobileDeliveryDependencies> = {},
): MobileDelivery {
  const deps: MobileDeliveryDependencies = {
    readConfig: readCloudinaryConfig,
    upload: uploadVideoToCloudinary,
    ...dependencies,
  };

  let snapshot: MobileDeliverySnapshot = IDLE;
  let inFlight: Promise<MobileDeliverySnapshot> | null = null;
  // Bumped by reset() so a late result from a previous upload is discarded.
  let generation = 0;
  const listeners = new Set<() => void>();

  const emit = (next: MobileDeliverySnapshot) => {
    if (sameSnapshot(snapshot, next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    reset() {
      generation += 1;
      inFlight = null;
      emit(IDLE);
    },

    send(blob, filename) {
      // Double-click guard: one upload at a time, everyone shares the result.
      if (inFlight) return inFlight;

      const config = deps.readConfig();
      if (!config) {
        const next: MobileDeliverySnapshot = {
          status: "error",
          secureUrl: null,
          error: CLOUDINARY_NOT_CONFIGURED_MESSAGE,
        };
        emit(next);
        return Promise.resolve(next);
      }

      const startedAt = generation;
      emit({ status: "uploading", secureUrl: null, error: null });

      const task = Promise.resolve()
        .then(() => deps.upload(blob, { config, filename }))
        .then(
          (result): MobileDeliverySnapshot => {
            const next: MobileDeliverySnapshot = {
              status: "ready",
              secureUrl: result.secureUrl,
              error: null,
            };
            if (generation === startedAt) emit(next);
            return next;
          },
          (error: unknown): MobileDeliverySnapshot => {
            const detail = (error as Error)?.message?.trim();
            const next: MobileDeliverySnapshot = {
              status: "error",
              secureUrl: null,
              error: detail || SEND_TO_MOBILE_FALLBACK_ERROR,
            };
            if (generation === startedAt) emit(next);
            return next;
          },
        );

      const tracked = task.finally(() => {
        if (inFlight === tracked) inFlight = null;
      });
      inFlight = tracked;
      return tracked;
    },
  };
}
