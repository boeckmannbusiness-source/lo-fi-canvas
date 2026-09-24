/**
 * Tiny Cloudinary unsigned-upload helper for the portrait "Send to phone" flow.
 *
 * Only the *already-generated* MP4 Blob is uploaded, and only after the user
 * explicitly clicks "Send to phone". Credentials are never hardcoded: the cloud
 * name and unsigned upload preset come from Vite env vars, and the Cloudinary
 * API secret is intentionally never referenced anywhere in client-side code.
 *
 * The request is deliberately transformation-free. Cloudinary stores an upload
 * as-is unless the call (or the unsigned preset) asks for an incoming or eager
 * transformation, and a synchronous video transformation is exactly what makes
 * Cloudinary reject large files. This module therefore sends only the two
 * fields an unsigned upload requires, and never `format`, `transformation`,
 * `eager` or `eager_async`.
 */
import type { ExportFormatId } from "./viz/format";

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

export type CloudinaryEnv = Record<string, string | undefined>;

/** The only export format the mobile-download action is offered for. */
export function isMobileDownloadSupported(formatId: ExportFormatId): boolean {
  return formatId === "portrait";
}

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Parse + validate Cloudinary config from an env-like object. */
export function parseCloudinaryConfig(env: CloudinaryEnv): CloudinaryConfig | null {
  const cloudName = clean(env["VITE_CLOUDINARY_CLOUD_NAME"]);
  const uploadPreset = clean(env["VITE_CLOUDINARY_UPLOAD_PRESET"]);
  if (!cloudName || !uploadPreset) return null;
  return { cloudName, uploadPreset };
}

/**
 * Read Cloudinary config from Vite env. Static property access so Vite can
 * inline the values into the client bundle at build time.
 */
export function readCloudinaryConfig(): CloudinaryConfig | null {
  return parseCloudinaryConfig({
    VITE_CLOUDINARY_CLOUD_NAME: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
    VITE_CLOUDINARY_UPLOAD_PRESET: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET,
  });
}

/**
 * Cloudinary asset type used for the mobile transfer.
 *
 * It must stay `video`: the export is a playable MP4 and `raw` assets — while
 * stored byte-for-byte without processing — are capped at 10 MB on the Free
 * plan and therefore can't carry a portrait export. `video` also keeps range
 * requests / playback working on phones.
 */
export const CLOUDINARY_VIDEO_RESOURCE_TYPE = "video" as const;

/** Unsigned upload endpoint for a cloud's video resource type. */
export function cloudinaryUploadUrl(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${CLOUDINARY_VIDEO_RESOURCE_TYPE}/upload`;
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
}

export interface UploadOptions {
  config: CloudinaryConfig;
  /** Filename reported to Cloudinary; defaults to a neutral name. */
  filename?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** Cloudinary's synchronous video transformation limit on the Free plan (MB). */
export const CLOUDINARY_SYNC_PROCESSING_LIMIT_MB = 40;

const TOO_LARGE_PATTERN = /too large to process synchronously/i;

interface CloudinaryErrorEnvelope {
  error?: { message?: string };
}

/** Pull the server's own message out of a response body (JSON or plain text). */
function readServerDetail(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as CloudinaryErrorEnvelope;
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {
    /* not JSON — fall through to the raw text */
  }
  return trimmed;
}

/**
 * Map a Cloudinary failure to a clear, human-readable message.
 *
 * Cloudinary's raw JSON envelope is never surfaced. The well-known
 * synchronous-processing rejection is translated into its concrete cause and
 * the exact config fix, because that error means a transformation is being
 * applied to the upload (which a transform-free request cannot produce on its
 * own).
 */
export function cloudinaryErrorMessage(status: number, body: string): string {
  const detail = readServerDetail(body);
  if (TOO_LARGE_PATTERN.test(detail)) {
    return (
      `Cloudinary upload failed (${status}): this video is above the plan's ` +
      `${CLOUDINARY_SYNC_PROCESSING_LIMIT_MB} MB synchronous video-processing limit, ` +
      `so the upload is applying an incoming or eager transformation. ` +
      `Remove the transformation from the Cloudinary upload preset and try again.`
    );
  }
  return `Cloudinary upload failed (${status})${detail ? `: ${detail}` : ""}`;
}

/**
 * Upload a video Blob to Cloudinary with an unsigned upload preset and return
 * its `secure_url`. The Blob is sent untouched and no transformation is
 * requested, so Cloudinary only stores and serves the original MP4.
 */
export async function uploadVideoToCloudinary(
  blob: Blob,
  options: UploadOptions,
): Promise<CloudinaryUploadResult> {
  const { config, filename = "visualizer.mp4", fetchImpl = fetch } = options;

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("upload_preset", config.uploadPreset);

  const response = await fetchImpl(cloudinaryUploadUrl(config.cloudName), {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    let body = "";
    try {
      body = (await response.text()).slice(0, 500);
    } catch {
      /* response body unavailable */
    }
    throw new Error(cloudinaryErrorMessage(response.status, body));
  }

  const data = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
  };
  if (!data.secure_url) {
    throw new Error("Cloudinary response did not include a secure_url.");
  }
  return { secureUrl: data.secure_url, publicId: data.public_id ?? "" };
}
