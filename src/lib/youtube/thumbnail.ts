/**
 * Dedicated YouTube thumbnail composition for BERLIN B TAPES.
 *
 * Not a video frame grab: a purpose-built 1280×720 (16:9) card that leads with
 * the location hook, keeps the readable title short, and carries the series
 * branding. It reuses the same identity helpers as the video (frame colour,
 * font stack, letter-spaced text) so it reads as part of the same system.
 *
 * `drawThumbnail` is the pure canvas core (testable against a stub context);
 * `renderThumbnailCanvas` / `thumbnailToJpegBlob` are the thin browser wrappers.
 */
import { resolveFontFamily, resolveWeight } from "../viz/fonts";
import { drawTextWithSpacing } from "../viz/layers/text";
import { thumbnailText, type YouTubeProduction } from "./production";

/** Canvas 2D surface, browser element or offscreen. */
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;
export const THUMBNAIL_JPEG_QUALITY = 0.92;

/** YouTube's own thumbnail size guidance is 1280×720, 16:9. */
export const THUMBNAIL_ASPECT = 16 / 9;

const BG = "#07070a";
const CREAM = "#F2E7CE";
const MUTED = "#C9C0AD";

export interface ThumbnailRenderOptions {
  /** Artwork used as the backdrop, if any. */
  image?: CanvasImageSource | null;
  imageWidth?: number;
  imageHeight?: number;
  /** Frame/accent colour from the active identity. */
  accent?: string;
  /** Draw the analog grain tile (default off for a crisp, readable card). */
  grain?: boolean;
  /** Grain source, injected so the core stays dependency-free/testable. */
  grainSource?: CanvasImageSource | null;
}

/** Cover-fit `image` into the frame, then darken so the type always reads. */
function drawBackdrop(ctx: Canvas2D, width: number, height: number, options: ThumbnailRenderOptions) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  const image = options.image ?? null;
  const iw = options.imageWidth ?? 0;
  const ih = options.imageHeight ?? 0;
  if (image && iw > 0 && ih > 0) {
    const scale = Math.max(width / iw, height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
  } else {
    // No artwork: a quiet Berlin-night gradient keeps the card intentional.
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, "#141418");
    g.addColorStop(1, BG);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  if (options.grain && options.grainSource) {
    const pattern = ctx.createPattern(options.grainSource, "repeat");
    if (pattern) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  // Bottom-weighted scrim: dark enough for the type, light enough to see art.
  const scrim = ctx.createLinearGradient(0, height * 0.15, 0, height);
  scrim.addColorStop(0, "rgba(7,7,10,0)");
  scrim.addColorStop(0.55, "rgba(7,7,10,0.45)");
  scrim.addColorStop(1, "rgba(7,7,10,0.92)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  // A top scrim keeps the kicker legible over bright artwork.
  const top = ctx.createLinearGradient(0, 0, 0, height * 0.4);
  top.addColorStop(0, "rgba(7,7,10,0.75)");
  top.addColorStop(1, "rgba(7,7,10,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, height * 0.4);
}

/** Break `text` into at most `maxLines` lines that fit `maxWidth`. */
export function wrapThumbnailLines(
  ctx: Canvas2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

/**
 * Draw the complete thumbnail into `ctx`. Deterministic: same production +
 * options always produce the same canvas ops.
 */
export function drawThumbnail(
  ctx: Canvas2D,
  width: number,
  height: number,
  production: YouTubeProduction,
  options: ThumbnailRenderOptions = {},
): void {
  const text = thumbnailText(production);
  const accent = options.accent && options.accent.trim() ? options.accent : CREAM;

  drawBackdrop(ctx, width, height, options);

  const pad = width * 0.058;
  const short = height;

  ctx.save();
  ctx.textBaseline = "alphabetic";

  const kickerSize = short * 0.055;
  const titleSize = short * 0.145;
  const metaSize = short * 0.05;
  const brandSize = short * 0.045;
  const episodeSize = short * 0.042;

  const mono = resolveFontFamily("IBM Plex Mono");
  const display = resolveFontFamily("Oswald");
  const monoWeight = resolveWeight("IBM Plex Mono", 500);
  const displayWeight = resolveWeight("Oswald", 600);

  // Left accent bar — a printed-identity cue, not a UI chrome.
  const barW = Math.max(6, width * 0.011);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, barW, height);
  ctx.globalAlpha = 1;

  // Kicker: the series.
  const kickerY = pad + kickerSize;
  ctx.font = `${monoWeight} ${kickerSize}px ${mono}`;
  ctx.fillStyle = CREAM;
  ctx.globalAlpha = 0.85;
  ctx.textAlign = "left";
  drawTextWithSpacing(ctx, text.subtitle, pad, kickerY, kickerSize * 0.18);

  // Episode badge, top-right.
  if (text.episode) {
    ctx.font = `${monoWeight} ${episodeSize}px ${mono}`;
    const badgeTextW = ctx.measureText(text.episode).width + episodeSize * 0.28 * Math.max(0, text.episode.length - 1);
    const badgePadX = episodeSize * 0.7;
    const badgePadY = episodeSize * 0.55;
    const badgeW = badgeTextW + badgePadX * 2;
    const badgeH = episodeSize + badgePadY * 2;
    const bx = width - pad - badgeW;
    const by = pad;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, short * 0.004);
    ctx.strokeRect(bx, by, badgeW, badgeH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = CREAM;
    ctx.textAlign = "left";
    drawTextWithSpacing(ctx, text.episode, bx + badgePadX, by + badgePadY + episodeSize * 0.82, episodeSize * 0.12);
  }

  // Dominant line: the location / visual hook.
  const maxTitleWidth = width - pad * 2;
  const titleLines = wrapThumbnailLines(ctx, text.title, maxTitleWidth, 2);
  ctx.font = `${displayWeight} ${titleSize}px ${display}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = titleSize * 0.25;
  ctx.shadowOffsetY = titleSize * 0.04;
  let ty = height - pad - brandSize * 2.4 - metaSize * 2.1 - (titleLines.length - 1) * titleSize * 0.95;
  for (const line of titleLines) {
    drawTextWithSpacing(ctx, line, pad, ty, titleSize * 0.005);
    ty += titleSize * 0.95;
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Meta: genre · mood.
  if (text.meta) {
    ctx.font = `${monoWeight} ${metaSize}px ${mono}`;
    ctx.fillStyle = MUTED;
    ctx.globalAlpha = 0.9;
    drawTextWithSpacing(ctx, text.meta, pad, height - pad - brandSize * 2.1, metaSize * 0.14);
    ctx.globalAlpha = 1;
  }

  // Brand footer.
  ctx.font = `${monoWeight} ${brandSize}px ${mono}`;
  ctx.fillStyle = CREAM;
  ctx.globalAlpha = 0.92;
  drawTextWithSpacing(ctx, text.brand, pad, height - pad, brandSize * 0.22);
  ctx.globalAlpha = 1;

  ctx.restore();
}

/** Browser wrapper: allocate a 1280×720 canvas and draw the thumbnail. */
export function renderThumbnailCanvas(
  production: YouTubeProduction,
  options: ThumbnailRenderOptions = {},
): HTMLCanvasElement | OffscreenCanvas {
  const width = THUMBNAIL_WIDTH;
  const height = THUMBNAIL_HEIGHT;
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height);
  } else if (typeof document !== "undefined") {
    const element = document.createElement("canvas");
    element.width = width;
    element.height = height;
    canvas = element;
  } else {
    throw new Error("No canvas implementation available.");
  }
  const ctx = canvas.getContext("2d") as Canvas2D | null;
  if (!ctx) throw new Error("This browser could not create a drawing surface.");
  drawThumbnail(ctx, width, height, production, options);
  return canvas;
}

/** Encode the thumbnail as a YouTube-compatible JPEG blob. */
export async function thumbnailToJpegBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality = THUMBNAIL_JPEG_QUALITY,
): Promise<Blob> {
  const offscreen = canvas as OffscreenCanvas;
  if (typeof offscreen.convertToBlob === "function") {
    return offscreen.convertToBlob({ type: "image/jpeg", quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the thumbnail."))),
      "image/jpeg",
      quality,
    );
  });
}
