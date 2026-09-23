import type { RenderContext } from "../types";
import {
  CTA_PHASES,
  clamp01,
  easeOutCubic,
  frameThicknessPx,
  hexToRgba,
  resolveFrameColor,
  type CtaState,
} from "../identity";
import { resolveFontFamily, resolveWeight } from "../fonts";
import { drawTextWithSpacing } from "./text";
import { GRAIN_VARIANTS, grainTile } from "./grain";

const CARD_BG = "#07070a";
const CARD_CREAM = "#F2E7CE";
const DIM_SCRIM = 0.84;

/**
 * "LIKE & SUBSCRIBE" interlude — a full BERLIN B TAPES title card.
 *
 * Rendered as a compositional scene rather than a DOM overlay: dark ground,
 * the frame colour taking over the border band, condensed cream typography with
 * a small label underneath, plus texture and a faint analog flicker. Every
 * value derives from `state` (itself a pure function of `time`), so preview and
 * export match exactly.
 */
export function drawCtaScene(r: RenderContext, state: CtaState) {
  const c = r.settings.cta;
  if (!state.active || state.alpha <= 0.001) return;

  const { ctx, width: W, height: H, settings } = r;
  const min = Math.min(W, H);
  const accent = c.useFrameColor ? resolveFrameColor(settings.frame) : c.color;
  const base = state.alpha * clamp01(c.opacity);
  const band = frameThicknessPx(settings.frame, W, H) || min * 0.04;

  ctx.save();
  ctx.globalAlpha = base;

  drawBackdrop(r, accent, base, min);
  drawBand(r, accent, band, base);
  drawTypeBlock(r, state, accent, min, base);
  drawTexture(r, base);
  drawVignette(r, base, min);
  drawFlicker(r, state, base);

  ctx.restore();
}

/* ── Backdrop ────────────────────────────────────────────────────────────── */

function drawBackdrop(r: RenderContext, accent: string, base: number, min: number) {
  const { ctx, width: W, height: H } = r;
  const dim = r.settings.cta.backgroundStyle === "dim";

  ctx.save();
  ctx.globalAlpha = base;
  ctx.fillStyle = dim ? `rgba(7,7,10,${DIM_SCRIM})` : CARD_BG;
  ctx.fillRect(0, 0, W, H);

  // A very soft lift behind the type so the card is not a flat black plate.
  const glow = ctx.createRadialGradient(W / 2, H * 0.46, min * 0.05, W / 2, H * 0.46, min * 0.85);
  glow.addColorStop(0, hexToRgba(accent, 0.09));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ── Frame band ──────────────────────────────────────────────────────────── */

function drawBand(r: RenderContext, accent: string, t: number, base: number) {
  const { ctx, width: W, height: H } = r;
  if (t <= 0 || W <= t * 2 || H <= t * 2) return;
  ctx.save();
  ctx.globalAlpha = base;
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(t, t, W - t * 2, H - t * 2);
  ctx.fillStyle = accent;
  ctx.fill("evenodd");
  ctx.restore();
}

/* ── Type block ──────────────────────────────────────────────────────────── */

interface CtaLine {
  text: string;
  size: number;
  color: string;
  opacity: number;
  spacing: number;
}

function drawTypeBlock(
  r: RenderContext,
  state: CtaState,
  accent: string,
  min: number,
  base: number,
) {
  const c = r.settings.cta;
  const { ctx, width: W, height: H } = r;
  const family = resolveFontFamily(c.fontFamily);
  const weight = resolveWeight(c.fontFamily, c.weight);
  const subWeight = resolveWeight(c.fontFamily, 500);

  const parts = splitCtaText(c.text);
  const mainSize = min * 0.155;
  const ampSize = mainSize * 0.72;
  const subSize = min * 0.03;

  const lines: CtaLine[] = [];
  const [first, second, third] = parts;
  if (parts.length === 3 && first && second && third) {
    lines.push({
      text: first,
      size: mainSize,
      color: CARD_CREAM,
      opacity: 0.96,
      spacing: c.letterSpacing,
    });
    lines.push({ text: second, size: ampSize, color: accent, opacity: 0.92, spacing: 0 });
    lines.push({
      text: third,
      size: mainSize,
      color: CARD_CREAM,
      opacity: 0.96,
      spacing: c.letterSpacing,
    });
  } else {
    lines.push({
      text: parts.join(" ") || "LIKE & SUBSCRIBE",
      size: mainSize,
      color: CARD_CREAM,
      opacity: 0.96,
      spacing: c.letterSpacing,
    });
  }

  const hasSub = c.showSubText && c.subText.trim().length > 0;
  const lineHeight = (size: number) => size * 0.98;
  const typeH = lines.reduce((sum, l) => sum + lineHeight(l.size), 0);
  const subGap = hasSub ? mainSize * 0.5 : 0;
  const subH = hasSub ? subSize * 1.1 : 0;
  const footerGap = min * 0.035;
  const footerH = min * 0.03;
  const totalH = typeH + subGap + subH + footerGap + footerH;

  // Deterministic analog life: a few pixels of drift and a breathing scale.
  const driftX = state.driftX * min * 0.004;
  const driftY = state.driftY * min * 0.003;
  const breathe = 1 + state.jitter * 0.0015;
  const scale = (c.animationStyle === "scale" ? 0.94 + 0.06 * state.entrance : 1) * breathe;
  const fade = 1 - state.exit;

  ctx.save();
  ctx.translate(W / 2 + driftX, H / 2 + driftY);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -H / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = mainSize * 0.22;
  ctx.shadowOffsetY = mainSize * 0.04;

  let cursor = H / 2 - totalH / 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const p = lineEntrance(state, i);
    const alpha = (c.animationStyle === "scale" ? state.entrance : p) * fade;
    if (alpha > 0.001) {
      const offsetY = c.animationStyle === "slide-fade" ? (1 - p) * mainSize * 0.45 : 0;
      ctx.globalAlpha = base * alpha * line.opacity;
      ctx.fillStyle = line.color;
      ctx.font = `${weight} ${line.size}px ${family}`;
      ctx.save();
      ctx.translate(0, offsetY);
      drawTextWithSpacing(
        ctx,
        line.text,
        W / 2,
        cursor + line.size * 0.78,
        line.size * line.spacing,
      );
      ctx.restore();
    }
    cursor += lineHeight(line.size);
  }

  if (hasSub) {
    cursor += subGap;
    const alpha = state.entrance * fade * 0.6;
    if (alpha > 0.001) {
      ctx.globalAlpha = base * alpha;
      ctx.fillStyle = accent;
      ctx.shadowColor = "transparent";
      ctx.font = `${subWeight} ${subSize}px ${family}`;
      drawTextWithSpacing(
        ctx,
        c.subText.toUpperCase(),
        W / 2,
        cursor + subSize * 0.85,
        subSize * 0.28,
      );
    }
    cursor += subH;
  }

  // Minimal tape-path motif: two reels joined by a thread.
  cursor += footerGap;
  const reelR = footerH * 0.5;
  const gapX = mainSize * 0.9;
  if (reelR > 1) {
    ctx.globalAlpha = base * state.entrance * fade * 0.45;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, min * 0.0022);
    ctx.beginPath();
    ctx.arc(W / 2 - gapX, cursor + reelR, reelR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2 + gapX, cursor + reelR, reelR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 - gapX + reelR, cursor + reelR);
    ctx.lineTo(W / 2 + gapX - reelR, cursor + reelR);
    ctx.stroke();
  }

  ctx.restore();
}

/** Per-line entrance, staggered slightly so lines cascade in. */
function lineEntrance(state: CtaState, index: number): number {
  const span = CTA_PHASES.textIn - CTA_PHASES.cardIn;
  const start = CTA_PHASES.cardIn + index * 0.035;
  return easeOutCubic(clamp01((state.progress - start) / span));
}

/**
 * Split the CTA headline on "&" so a two-part title becomes three stacked
 * lines (LIKE / & / SUBSCRIBE). Titles without "&" stay on one line.
 */
export function splitCtaText(text: string): string[] {
  const parts = text
    .split("&")
    .map((p) => p.trim())
    .filter(Boolean);
  const [a, b] = parts;
  if (parts.length === 2 && a && b) return [a, "&", b];
  const single = text.trim();
  return single ? [single] : [];
}

/* ── Texture, vignette, flicker ──────────────────────────────────────────── */

function drawTexture(r: RenderContext, base: number) {
  const { ctx, width: W, height: H } = r;
  const intensity = Math.max(0.04, r.settings.grain.intensity);
  const tile = grainTile(Math.floor(r.time * 24) % GRAIN_VARIANTS);
  const pattern = tile ? ctx.createPattern(tile, "repeat") : null;
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = base * Math.min(0.25, intensity * 2.2);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawVignette(r: RenderContext, base: number, min: number) {
  const { ctx, width: W, height: H } = r;
  const g = ctx.createRadialGradient(W / 2, H / 2, min * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.save();
  ctx.globalAlpha = base;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawFlicker(r: RenderContext, state: CtaState, base: number) {
  const delta = state.jitter * 0.035 * state.entrance;
  if (Math.abs(delta) < 0.0005) return;
  const { ctx, width: W, height: H } = r;
  ctx.save();
  ctx.globalAlpha = base;
  if (delta > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,240,220,${Math.min(0.2, delta).toFixed(4)})`;
  } else {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgba(230,225,235,${Math.min(0.2, -delta).toFixed(4)})`;
  }
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
