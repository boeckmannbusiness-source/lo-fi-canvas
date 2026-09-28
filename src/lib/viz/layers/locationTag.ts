import type { RenderContext } from "../types";
import { hexToRgba, locationTagLayout, locationTagState } from "../identity";
import { resolveFontFamily, resolveWeight } from "../fonts";
import { drawTextWithSpacing } from "./text";

/** Identity cream used across the frame / now-playing / CTA elements. */
const TAG_CREAM = "#F2E7CE";
const LABEL_TRACKING = 0.2;

/**
 * Subtle opening-seconds location tag.
 *
 * Prints `EPISODE / LOCATION / BERLIN` in the bottom-left of the artwork
 * opening for the first few seconds of the video, then fades out — enough to
 * communicate place and identity immediately without becoming a permanent
 * lower-third. Reuses the shared identity helpers (frame geometry, font stack,
 * letter-spaced text) so it matches the existing visual language.
 *
 * Rendered from `renderScene` only when a `locationTag` is supplied, so the
 * normal preview / export and the locked landscape fixture are unaffected.
 */
export function drawLocationTag(r: RenderContext) {
  const tag = r.locationTag;
  if (!tag || !tag.enabled) return;

  const state = locationTagState(tag, r.time);
  if (!state.active || state.alpha <= 0.001) return;

  const location = tag.location.trim();
  if (!location) return;

  const { ctx, width: W, height: H } = r;
  const short = Math.min(W, H);
  const layout = locationTagLayout(r.settings.frame, W, H);
  const family = resolveFontFamily("IBM Plex Mono");
  const displayFamily = resolveFontFamily("Oswald");
  const episodeWeight = resolveWeight("IBM Plex Mono", 500);
  const displayWeight = resolveWeight("Oswald", 500);

  const episodeSize = Math.max(10, short * 0.017);
  const locationSize = Math.max(16, short * 0.04);
  const citySize = Math.max(9, short * 0.014);
  const gap = short * 0.014;
  const ruleH = Math.max(1, short * 0.0016);

  const episode = tag.episode.trim().toUpperCase();
  const city = tag.city.trim().toUpperCase();

  const blockH =
    (episode ? episodeSize * 1.15 + gap : 0) +
    ruleH +
    gap +
    locationSize * 1.1 +
    (city ? gap * 0.6 + citySize * 1.15 : 0);
  const top = layout.y - blockH;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = locationSize * 0.3;
  ctx.shadowOffsetY = locationSize * 0.05;

  let y = top;
  if (episode) {
    ctx.globalAlpha = state.alpha * 0.6;
    ctx.font = `${episodeWeight} ${episodeSize}px ${family}`;
    ctx.fillStyle = TAG_CREAM;
    drawTextWithSpacing(ctx, episode, layout.x, y + episodeSize, episodeSize * LABEL_TRACKING);
    y += episodeSize * 1.15 + gap;
  }

  ctx.globalAlpha = state.alpha * 0.45;
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = TAG_CREAM;
  ctx.lineWidth = ruleH;
  const ruleW = Math.min(layout.content.width * 0.6, locationSize * 7);
  ctx.beginPath();
  ctx.moveTo(layout.x, y + ruleH / 2);
  ctx.lineTo(layout.x + ruleW, y + ruleH / 2);
  ctx.stroke();
  y += ruleH + gap;

  ctx.globalAlpha = state.alpha * 0.92;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.font = `${displayWeight} ${locationSize}px ${displayFamily}`;
  ctx.fillStyle = TAG_CREAM;
  drawTextWithSpacing(ctx, location, layout.x, y + locationSize, locationSize * 0.04);
  y += locationSize * 1.1;

  if (city) {
    ctx.globalAlpha = state.alpha * 0.6;
    ctx.shadowColor = "transparent";
    ctx.font = `${episodeWeight} ${citySize}px ${family}`;
    ctx.fillStyle = TAG_CREAM;
    drawTextWithSpacing(ctx, city, layout.x, y + gap * 0.6 + citySize, citySize * LABEL_TRACKING);
  }

  ctx.restore();
}
