import type { RenderContext } from "../types";
import { hexToRgba, nowPlayingLayout } from "../identity";
import { resolveFontFamily, resolveWeight } from "../fonts";
import { drawTextWithSpacing } from "./text";

/** Tracking multiplier applied to the small "NOW PLAYING" label. */
const LABEL_TRACKING = 0.22;

/**
 * Small editorial "NOW PLAYING" information element.
 *
 * Deliberately quiet: a letter-spaced label, a hairline rule and — optionally —
 * a track title and artist. Anchored inside the frame opening, with portrait
 * padding so it never collides with the portrait content-safe band. Uses the existing
 * canvas font stack, so preview and export share identical text metrics.
 */
export function drawNowPlaying(r: RenderContext) {
  const np = r.settings.nowPlaying;
  if (!np.enabled || np.opacity <= 0) return;

  const hasLabel = np.showLabel && np.label.trim().length > 0;
  const hasTitle = np.showTitle && np.title.trim().length > 0;
  const hasArtist = np.showArtist && np.artist.trim().length > 0;
  if (!hasLabel && !hasTitle && !hasArtist) return;

  const { ctx, width: W, height: H } = r;
  const layout = nowPlayingLayout(np, r.settings.frame, W, H);
  const family = resolveFontFamily(np.fontFamily);
  const titleWeight = resolveWeight(np.fontFamily, np.weight);
  const accentWeight = resolveWeight(np.fontFamily, 400);

  const maxWidth = Math.max(
    0,
    layout.content.width - Math.min(layout.content.width, layout.content.height) * 0.14,
  );
  const titleSize = Math.max(
    9,
    fitToWidth(ctx, np.title, titleWeight, family, (W * np.size) / 100, maxWidth, np.letterSpacing),
  );
  const artistSize = Math.max(
    8,
    fitToWidth(ctx, np.artist, accentWeight, family, titleSize * 0.5, maxWidth, np.letterSpacing),
  );
  const labelSize = Math.max(8, titleSize * 0.36);

  const labelGap = titleSize * 0.46;
  const ruleH = Math.max(1, titleSize * 0.05);
  const showRule = np.showRule && hasLabel && (hasTitle || hasArtist);

  const blockH =
    (hasLabel ? labelSize * 1.15 : 0) +
    (showRule ? labelGap + ruleH : 0) +
    (hasTitle ? titleSize * 1.06 : 0) +
    (hasArtist ? artistSize * 1.3 : 0);

  const x = layout.x;
  let y = layout.anchorBottom ? layout.y - blockH : layout.y;

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = layout.align;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = titleSize * 0.35;
  ctx.shadowOffsetY = titleSize * 0.06;

  if (hasLabel) {
    ctx.font = `${accentWeight} ${labelSize}px ${family}`;
    ctx.fillStyle = hexToRgba(np.color, np.opacity * 0.62);
    drawTextWithSpacing(ctx, np.label.toUpperCase(), x, y + labelSize, labelSize * LABEL_TRACKING);
    y += labelSize * 1.15;
  }

  if (showRule) {
    y += labelGap;
    const ruleW = Math.min(maxWidth, titleSize * 3.8);
    const rx = layout.align === "right" ? x - ruleW : layout.align === "center" ? x - ruleW / 2 : x;
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = hexToRgba(np.color, np.opacity * 0.4);
    ctx.lineWidth = ruleH;
    ctx.beginPath();
    ctx.moveTo(rx, y + ruleH / 2);
    ctx.lineTo(rx + ruleW, y + ruleH / 2);
    ctx.stroke();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    y += ruleH;
  }

  if (hasTitle) {
    ctx.font = `${titleWeight} ${titleSize}px ${family}`;
    ctx.fillStyle = hexToRgba(np.color, np.opacity * 0.92);
    drawTextWithSpacing(ctx, np.title, x, y + titleSize * 0.92, titleSize * np.letterSpacing);
    y += titleSize * 1.06;
  }

  if (hasArtist) {
    ctx.font = `${accentWeight} ${artistSize}px ${family}`;
    ctx.fillStyle = hexToRgba(np.color, np.opacity * 0.6);
    drawTextWithSpacing(ctx, np.artist, x, y + artistSize * 0.92, artistSize * np.letterSpacing);
  }

  ctx.restore();
}

/** Shrink a font size until the text (with tracking) fits the available width. */
function fitToWidth(
  ctx: RenderContext["ctx"],
  text: string,
  weight: number,
  family: string,
  size: number,
  maxWidth: number,
  spacingEm: number,
): number {
  if (!text || maxWidth <= 0 || size <= 0) return size;
  ctx.font = `${weight} ${size}px ${family}`;
  const spacing = size * spacingEm;
  const width = ctx.measureText(text).width + spacing * Math.max(0, text.length - 1);
  if (width <= maxWidth) return size;
  return Math.max(8, size * (maxWidth / width));
}
