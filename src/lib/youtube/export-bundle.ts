/**
 * YouTube export bundle helpers.
 *
 * No ZIP dependency is introduced: a "bundle" is the four files named with the
 * same `B-005_Checkpoint_Charlie` base, each individually downloadable (and
 * offered together via "Download all"). The bytes always come from the shared
 * render/thumbnail pipeline — these helpers only name and save them.
 */
import {
  buildDescriptionText,
  buildMetadataJson,
  youtubeFilenames,
  type YouTubeMetadata,
  type YouTubeProduction,
} from "./production";
import {
  renderThumbnailCanvas,
  thumbnailToJpegBlob,
  type ThumbnailRenderOptions,
} from "./thumbnail";

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Trigger a browser download for plain text. */
export function downloadText(text: string, filename: string, mime = "text/plain"): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** Render + encode the dedicated thumbnail and download it as a JPEG. */
export async function downloadThumbnailJpeg(
  production: YouTubeProduction,
  options: ThumbnailRenderOptions = {},
): Promise<Blob> {
  const canvas = renderThumbnailCanvas(production, options);
  const blob = await thumbnailToJpegBlob(canvas);
  downloadBlob(blob, youtubeFilenames(production).thumbnail);
  return blob;
}

export function downloadDescription(production: YouTubeProduction, metadata: YouTubeMetadata): void {
  downloadText(buildDescriptionText(metadata), youtubeFilenames(production).description);
}

export function downloadMetadataJson(production: YouTubeProduction, metadata: YouTubeMetadata): void {
  downloadText(buildMetadataJson(production, metadata), youtubeFilenames(production).metadata, "application/json");
}
