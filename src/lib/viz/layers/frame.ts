import type { RenderContext } from "../types";
import { frameThicknessPx, resolveFrameColor } from "../identity";
import { GRAIN_VARIANTS, grainTile } from "./grain";

/**
 * BERLIN B TAPES artwork frame.
 *
 * A flat, square-cornered print border around the composition — album
 * packaging rather than a rounded UI card. Thickness is keyed off the shorter
 * canvas edge, so the same settings read correctly in landscape and portrait.
 */
export function drawFrame(r: RenderContext) {
  const frame = r.settings.frame;
  if (!frame.enabled || frame.opacity <= 0) return;

  const { ctx, width: W, height: H } = r;
  const t = frameThicknessPx(frame, W, H);
  if (t <= 0 || W <= t * 2 || H <= t * 2) return;

  const color = resolveFrameColor(frame);
  const alpha = Math.max(0, Math.min(1, frame.opacity));
  const innerX = t;
  const innerY = t;
  const innerW = W - t * 2;
  const innerH = H - t * 2;

  // The band is a single even-odd ring so corners stay crisp and square.
  const ring = () => {
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(innerX, innerY, innerW, innerH);
  };

  ctx.save();
  ctx.globalAlpha = alpha;

  // Border band. With shadow on, the fill casts a soft inner shadow onto the
  // artwork: the outer edge falls off-canvas, so only the inner edge reads.
  ring();
  if (frame.shadow > 0) {
    ctx.shadowColor = `rgba(0,0,0,${(0.5 * frame.shadow).toFixed(3)})`;
    ctx.shadowBlur = t * 1.4 * frame.shadow;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = t * 0.25 * frame.shadow;
  }
  ctx.fillStyle = color;
  ctx.fill("evenodd");
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Hairline separating the print border from the artwork.
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = Math.max(1, t * 0.05);
  ctx.strokeRect(innerX, innerY, innerW, innerH);

  // Subtle screen-print texture, clipped to the border band.
  if (frame.texture > 0) {
    const tile = grainTile(Math.floor(r.time * 24) % GRAIN_VARIANTS);
    const pattern = tile ? ctx.createPattern(tile, "repeat") : null;
    if (pattern) {
      ctx.save();
      ring();
      ctx.clip("evenodd");
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = alpha * Math.min(0.5, frame.texture * 0.4);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  ctx.restore();
}
