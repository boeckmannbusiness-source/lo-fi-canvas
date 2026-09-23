import type { RenderContext, Settings } from "../types";
import { resolveFontFamily, resolveWeight } from "../fonts";
import { isPortrait } from "../layout";

/**
 * Type sizing basis. Landscape keeps "% of canvas width" exactly as before.
 * Portrait uses a widened basis so a 7% title stays physically large on a
 * 1080-wide frame instead of shrinking with the narrower canvas.
 */
function typeBase(r: RenderContext): number {
  return isPortrait(r) ? r.width * 1.45 : r.width;
}

/**
 * Premium typography layer for BERLIN B TAPES.
 *
 * Renders title and subtitle as independent typography elements with full
 * control over font, weight, size, spacing, positioning, shadow, and stroke.
 *
 * Uses percentage-of-canvas-width sizing so preview and 1920×1080 export
 * produce identical compositions.
 */
export function drawText(r: RenderContext) {
  const t = r.settings.text;
  if (!t.enabled) return;
  if (!t.title && !(t.showSubtitle && t.subtitle)) return;

  const { ctx, width: W, height: H } = r;

  // ── Compute positions ───────────────────────────────────────────────────
  const safeL = W * r.safe.left;
  const safeR = W * (1 - r.safe.right);
  const safeT = H * r.safe.top;
  const safeB = H * (1 - r.safe.bottom);

  const { x: baseX, y: baseY, align } = computePosition(t, W, H, safeL, safeR, safeT, safeB);

  // ── Resolve fonts ───────────────────────────────────────────────────────
  const titleFontFamily = resolveFontFamily(t.fontFamily);
  const titleFontWeight = resolveWeight(t.fontFamily, t.titleWeight);
  const subtitleFontWeight = resolveWeight(t.fontFamily, t.subtitleWeight);

  // ── Resolve legacy fontSize (0–1 range) to percentage ────────────────────
  const titleSizePx = resolveFontSize(t.fontSize, W);
  const subtitleSizePx = resolveFontSize(t.subtitleSize, W);

  ctx.save();

  // ── Title ───────────────────────────────────────────────────────────────
  if (t.title) {
    drawTextLine(ctx, {
      text: t.title,
      x: baseX,
      y: baseY,
      align,
      fontFamily: titleFontFamily,
      fontWeight: titleFontWeight,
      fontSizePx: titleSizePx,
      color: t.titleColor,
      opacity: t.titleOpacity * t.opacity,
      letterSpacing: t.titleLetterSpacing,
      shadow: t.shadowEnabled
        ? {
            color: t.shadowColor,
            opacity: t.shadowOpacity,
            blur: t.shadowBlur * titleSizePx,
            offsetX: t.shadowOffsetX * titleSizePx,
            offsetY: t.shadowOffsetY * titleSizePx,
          }
        : undefined,
      stroke: t.strokeEnabled
        ? { color: t.strokeColor, width: t.strokeWidth * titleSizePx }
        : undefined,
    });
  }

  // ── Subtitle ────────────────────────────────────────────────────────────
  if (t.showSubtitle && t.subtitle) {
    const subtitleY = baseY + titleSizePx * t.lineHeight * 0.85;
    drawTextLine(ctx, {
      text: t.subtitle,
      x: baseX,
      y: subtitleY,
      align,
      fontFamily: titleFontFamily,
      fontWeight: subtitleFontWeight,
      fontSizePx: subtitleSizePx,
      color: t.subtitleColor,
      opacity: t.subtitleOpacity * t.opacity,
      letterSpacing: t.subtitleLetterSpacing,
      shadow: t.shadowEnabled
        ? {
            color: t.shadowColor,
            opacity: t.shadowOpacity * 0.7,
            blur: t.shadowBlur * subtitleSizePx,
            offsetX: t.shadowOffsetX * subtitleSizePx,
            offsetY: t.shadowOffsetY * subtitleSizePx,
          }
        : undefined,
      stroke: t.strokeEnabled
        ? {
            color: t.strokeColor,
            width: t.strokeWidth * subtitleSizePx * 0.8,
          }
        : undefined,
    });
  }

  ctx.restore();
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

interface Position {
  x: number;
  y: number;
  align: CanvasTextAlign;
}

function computePosition(
  t: Settings["text"],
  W: number,
  H: number,
  safeL: number,
  safeR: number,
  safeT: number,
  safeB: number,
): Position {
  // Horizontal
  let x: number;
  let align: CanvasTextAlign;
  switch (t.positionH) {
    case "left":
      x = safeL;
      align = "left";
      break;
    case "right":
      x = safeR;
      align = "right";
      break;
    case "center":
    default:
      x = W / 2;
      align = "center";
      break;
  }

  // Vertical
  let y: number;
  switch (t.positionV) {
    case "top":
      y = safeT + H * 0.08;
      break;
    case "bottom":
      y = safeB - H * 0.04;
      break;
    case "center":
    default:
      y = H / 2;
      break;
  }

  // Override for preset positions
  switch (t.position) {
    case "top-left":
      x = safeL;
      y = safeT + H * 0.08;
      align = "left";
      break;
    case "top-center":
      x = W / 2;
      y = safeT + H * 0.08;
      align = "center";
      break;
    case "top-right":
      x = safeR;
      y = safeT + H * 0.08;
      align = "right";
      break;
    case "bottom-left":
      x = safeL;
      y = safeB - H * 0.04;
      align = "left";
      break;
    case "bottom-center":
      x = W / 2;
      y = safeB - H * 0.04;
      align = "center";
      break;
    case "bottom-right":
      x = safeR;
      y = safeB - H * 0.04;
      align = "right";
      break;
    case "center":
      x = W / 2;
      y = H / 2;
      align = "center";
      break;
    case "custom":
      x = safeL + t.customX * (safeR - safeL);
      y = safeT + t.customY * (safeB - safeT);
      align = t.textAlignment;
      break;
  }

  return { x, y, align };
}

/**
 * Resolve font size from percentage-of-canvas-width value.
 * Handles legacy 0–1 range from old presets gracefully.
 */
function resolveFontSize(value: number, canvasWidth: number): number {
  // Legacy presets used values in 0–1 range (e.g. 0.5)
  if (value <= 1) {
    // Map 0–1 to a reasonable range on canvas
    return canvasWidth * value * 0.08;
  }
  // New system: value is percentage of canvas width
  return canvasWidth * (value / 100);
}

interface ShadowOpts {
  color: string;
  opacity: number;
  blur: number;
  offsetX: number;
  offsetY: number;
}

interface StrokeOpts {
  color: string;
  width: number;
}

interface TextLineOpts {
  text: string;
  x: number;
  y: number;
  align: CanvasTextAlign;
  fontFamily: string;
  fontWeight: number;
  fontSizePx: number;
  color: string;
  opacity: number;
  letterSpacing: number;
  shadow: ShadowOpts | undefined;
  stroke: StrokeOpts | undefined;
}

function drawTextLine(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  opts: TextLineOpts,
) {
  ctx.globalAlpha = opts.opacity;
  ctx.textAlign = opts.align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `${opts.fontWeight} ${opts.fontSizePx}px ${opts.fontFamily}`;

  // Shadow
  if (opts.shadow) {
    ctx.shadowColor = hexToRgba(opts.shadow.color, opts.shadow.opacity);
    ctx.shadowBlur = opts.shadow.blur;
    ctx.shadowOffsetX = opts.shadow.offsetX;
    ctx.shadowOffsetY = opts.shadow.offsetY;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillStyle = opts.color;

  if (opts.letterSpacing !== 0) {
    drawTextWithSpacing(ctx, opts.text, opts.x, opts.y, opts.letterSpacing * opts.fontSizePx);
  } else {
    ctx.fillText(opts.text, opts.x, opts.y);
  }

  // Stroke (drawn after fill so it sits on top as an outline)
  if (opts.stroke) {
    ctx.strokeStyle = hexToRgba(opts.stroke.color, opts.opacity);
    ctx.lineWidth = opts.stroke.width;
    ctx.lineJoin = "round";
    if (opts.letterSpacing !== 0) {
      drawTextStrokeWithSpacing(
        ctx,
        opts.text,
        opts.x,
        opts.y,
        opts.letterSpacing * opts.fontSizePx,
      );
    } else {
      ctx.strokeText(opts.text, opts.x, opts.y);
    }
  }
}

/** Draw text with per-character letter spacing. */
function drawTextWithSpacing(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  const chars = [...text];
  if (chars.length === 0) return;

  // Measure total width to maintain alignment
  const totalWidth = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, -spacing);

  let cursor: number;
  if (ctx.textAlign === "center") {
    cursor = x - totalWidth / 2;
  } else if (ctx.textAlign === "right") {
    cursor = x - totalWidth;
  } else {
    cursor = x;
  }

  const savedAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (const ch of chars) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = savedAlign;
}

/** Stroke text with per-character letter spacing. */
function drawTextStrokeWithSpacing(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  const chars = [...text];
  if (chars.length === 0) return;

  const totalWidth = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, -spacing);

  let cursor: number;
  if (ctx.textAlign === "center") {
    cursor = x - totalWidth / 2;
  } else if (ctx.textAlign === "right") {
    cursor = x - totalWidth;
  } else {
    cursor = x;
  }

  const savedAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (const ch of chars) {
    ctx.strokeText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = savedAlign;
}

/** Convert hex color to rgba string. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
