/**
 * Tiny Cloudinary unsigned-upload helper for the portrait "Send to phone" flow.
 *
 * Only the *already-generated* MP4 Blob is uploaded, and only after the user
 * explicitly clicks "Send to phone". Credentials are never hardcoded: the cloud
 * name and unsigned upload preset come from Vite env vars, and the API secret
 * is intentionally never referenced anywhere in client-side code.
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

/** Unsigned upload endpoint for a cloud's video resource type. */
export function cloudinaryUploadUrl(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`;
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

/**
 * Upload a video Blob to Cloudinary with an unsigned upload preset and return
 * its `secure_url`. Throws with the server's response excerpt on failure.
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
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      /* response body unavailable */
    }
    throw new Error(`Cloudinary upload failed (${response.status})${detail ? `: ${detail}` : ""}`);
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
