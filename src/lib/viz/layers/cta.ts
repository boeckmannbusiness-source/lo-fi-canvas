import type { RenderContext } from "../types";
import {
  CTA_PHASES,
  clamp01,
  clampRange,
  ctaLayout,
  easeOutCubic,
  hexToRgba,
  resolveFrameColor,
  type CtaLayout,
  type CtaState,
  type Rect,
} from "../identity";
import { resolveFontFamily, resolveWeight } from "../fonts";
import { drawTextWithSpacing } from "./text";
import { GRAIN_VARIANTS, grainTile } from "./grain";

const PANEL_BG = "#07070a";
const PANEL_CREAM = "#F2E7CE";

/** Simple canvas-drawn glyphs — no external icon dependency. */
export type CtaIconKind = "thumb" | "bell";

export interface CtaRow {
  label: string;
  icon: CtaIconKind;
}

/**
 * Rows for the compact overlay. "LIKE & SUBSCRIBE" becomes a thumbs-up row and
 * a bell row; any other headline stays a single thumbs-up row.
 */
export function ctaRows(cta: { text: string }): CtaRow[] {
  const words = splitCtaText(cta.text).filter((p) => p !== "&");
  if (words.length >= 2) {
    return [
      { label: words[0]!.toUpperCase(), icon: "thumb" },
      { label: words[1]!.toUpperCase(), icon: "bell" },
    ];
  }
  const single = words[0]?.toUpperCase();
  return single ? [{ label: single, icon: "thumb" }] : [];
}

/**
 * "LIKE & SUBSCRIBE" call to action, recomposited as a compact overlay card on
 * top of the artwork. It reuses the existing CTA timeline (`state` is a pure
 * function of `time`) so preview and export stay identical, but never replaces
 * the scene: the artwork is always rendered underneath by `renderScene`.
 */
export function drawCtaScene(r: RenderContext, state: CtaState) {
  const c = r.settings.cta;
  if (!state.active || state.alpha <= 0.001) return;

  const { width: W, height: H, settings } = r;
  const min = Math.min(W, H);
  const accent = c.useFrameColor ? resolveFrameColor(settings.frame) : c.color;
  const base = state.alpha * clamp01(c.opacity);
  const layout = ctaLayout(c, settings.frame, W, H, r.safe);

  if (c.backgroundStyle === "dim") drawScrim(r, base);
  drawPanel(r, state, layout, accent, min, base);
}

/* ── Backdrop (dim style only) ───────────────────────────────────────────── */

function drawScrim(r: RenderContext, base: number) {
  const { ctx, width: W, height: H } = r;
  const g = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.1,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.75,
  );
  g.addColorStop(0, "rgba(7,7,10,0.16)");
  g.addColorStop(1, "rgba(7,7,10,0.6)");
  ctx.save();
  ctx.globalAlpha = base;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ── Overlay card ────────────────────────────────────────────────────────── */

function drawPanel(
  r: RenderContext,
  state: CtaState,
  layout: CtaLayout,
  accent: string,
  min: number,
  base: number,
) {
  const c = r.settings.cta;
  const { ctx } = r;
  const panel = layout.panel;
  const radius = Math.min(panel.width, panel.height) * 0.16;

  // Deterministic analog life: a few pixels of drift and a breathing scale.
  const driftX = state.driftX * min * 0.003;
  const driftY = state.driftY * min * 0.0022;
  const breathe = 1 + state.jitter * 0.0012;
  const scale = (c.animationStyle === "scale" ? 0.92 + 0.08 * state.entrance : 1) * breathe;
  const slide = c.animationStyle === "slide-fade" ? (1 - state.entrance) * panel.height * 0.5 : 0;

  ctx.save();
  ctx.translate(panel.x + panel.width / 2 + driftX, panel.y + panel.height / 2 + driftY + slide);
  ctx.scale(scale, scale);
  ctx.translate(-(panel.x + panel.width / 2), -(panel.y + panel.height / 2));

  // Plate: translucent dark card so the artwork still reads through it.
  ctx.globalAlpha = base;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = panel.height * 0.4;
  ctx.shadowOffsetY = panel.height * 0.12;
  roundRect(ctx, panel.x, panel.y, panel.width, panel.height, radius);
  ctx.fillStyle = hexToRgba(PANEL_BG, 0.82);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Accent edge and a fine inner keyline — printed social card, not a HUD.
  ctx.strokeStyle = hexToRgba(accent, 0.8);
  ctx.lineWidth = Math.max(1, min * 0.0016);
  roundRect(ctx, panel.x, panel.y, panel.width, panel.height, radius);
  ctx.stroke();

  const inset = Math.max(2, min * 0.004);
  ctx.strokeStyle = hexToRgba(accent, 0.24);
  ctx.lineWidth = Math.max(1, min * 0.001);
  roundRect(
    ctx,
    panel.x + inset,
    panel.y + inset,
    panel.width - inset * 2,
    panel.height - inset * 2,
    Math.max(0, radius - inset),
  );
  ctx.stroke();

  drawPanelTexture(r, panel, radius, base);
  drawRows(r, state, panel, accent, base);

  ctx.restore();

  // Small caption below the card, like a printed sub-label.
  if (c.showSubText && c.subText.trim().length > 0) {
    const subSize = Math.max(8, min * 0.024);
    const subY = panel.y + panel.height + min * 0.028;
    ctx.save();
    ctx.globalAlpha = base * state.entrance;
    ctx.fillStyle = hexToRgba(accent, 0.85);
    ctx.font = `${resolveWeight(c.fontFamily, 500)} ${subSize}px ${resolveFontFamily(c.fontFamily)}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    drawTextWithSpacing(
      ctx,
      c.subText.toUpperCase(),
      panel.x + panel.width / 2,
      subY,
      subSize * 0.28,
    );
    ctx.restore();
  }
}

function drawRows(
  r: RenderContext,
  state: CtaState,
  panel: Rect,
  accent: string,
  base: number,
) {
  const c = r.settings.cta;
  const { ctx } = r;
  const rows = ctaRows(c);
  if (rows.length === 0) return;

  const pad = panel.height * 0.16;
  const rowH = (panel.height - pad * 2) / rows.length;
  const family = resolveFontFamily(c.fontFamily);
  const weight = resolveWeight(c.fontFamily, c.weight);
  const fontSize = rowH * 0.44;
  const iconSize = Math.min(rowH * 0.6, panel.height * 0.26);
  const spacing = fontSize * c.letterSpacing;

  // Centre the icon+label block and left-align rows inside it so the icons
  // line up like a small printed list.
  let maxGroup = 0;
  for (const row of rows) {
    ctx.font = `${weight} ${fontSize}px ${family}`;
    maxGroup = Math.max(maxGroup, iconSize * 1.5 + measureSpaced(ctx, row.label, spacing));
  }
  const innerLeft = panel.x + pad;
  const innerRight = panel.x + panel.width - pad;
  const blockX = clampRange(
    panel.x + (panel.width - maxGroup) / 2,
    innerLeft,
    Math.max(innerLeft, innerRight - maxGroup),
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const p = lineEntrance(state, i);
    const cyRow = panel.y + pad + rowH * (i + 0.5);
    const iconX = blockX + iconSize * 0.5;
    const textX = blockX + iconSize * 1.5;

    ctx.globalAlpha = base * p;
    drawIcon(ctx, row.icon, iconX, cyRow, iconSize, accent);

    ctx.fillStyle = PANEL_CREAM;
    ctx.font = `${weight} ${fontSize}px ${family}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = fontSize * 0.3;
    ctx.shadowOffsetY = fontSize * 0.06;
    drawTextWithSpacing(ctx, row.label, textX, cyRow, spacing);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}

function drawPanelTexture(r: RenderContext, panel: Rect, radius: number, base: number) {
  const intensity = Math.max(0.04, r.settings.grain.intensity);
  const tile = grainTile(Math.floor(r.time * 24) % GRAIN_VARIANTS);
  if (!tile) return;
  const { ctx } = r;
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  ctx.save();
  roundRect(ctx, panel.x, panel.y, panel.width, panel.height, radius);
  ctx.clip();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = base * Math.min(0.22, intensity * 2.0);
  ctx.fillStyle = pattern;
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
  ctx.restore();
}

/* ── Icons ───────────────────────────────────────────────────────────────── */

function drawIcon(
  ctx: RenderContext["ctx"],
  kind: CtaIconKind,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const s = size;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = hexToRgba(color, 0.95);
  ctx.fillStyle = hexToRgba(color, 0.95);
  ctx.lineWidth = Math.max(1, s * 0.11);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (kind === "bell") {
    ctx.beginPath();
    ctx.moveTo(-s * 0.36, s * 0.16);
    ctx.quadraticCurveTo(-s * 0.36, -s * 0.42, 0, -s * 0.42);
    ctx.quadraticCurveTo(s * 0.36, -s * 0.42, s * 0.36, s * 0.16);
    ctx.lineTo(s * 0.44, s * 0.26);
    ctx.lineTo(-s * 0.44, s * 0.26);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, s * 0.44, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -s * 0.5, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Stylised thumbs-up: a small fist with a raised thumb.
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, s * 0.44);
    ctx.lineTo(-s * 0.42, s * 0.02);
    ctx.quadraticCurveTo(-s * 0.42, -s * 0.08, -s * 0.3, -s * 0.08);
    ctx.lineTo(-s * 0.12, -s * 0.08);
    ctx.lineTo(-s * 0.12, -s * 0.2);
    ctx.quadraticCurveTo(-s * 0.1, -s * 0.48, s * 0.02, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.12, -s * 0.5, s * 0.1, -s * 0.3);
    ctx.lineTo(s * 0.08, -s * 0.08);
    ctx.lineTo(s * 0.34, -s * 0.08);
    ctx.quadraticCurveTo(s * 0.48, -s * 0.08, s * 0.44, s * 0.08);
    ctx.lineTo(s * 0.32, s * 0.4);
    ctx.quadraticCurveTo(s * 0.29, s * 0.48, s * 0.2, s * 0.48);
    ctx.lineTo(-s * 0.3, s * 0.48);
    ctx.quadraticCurveTo(-s * 0.42, s * 0.48, -s * 0.42, s * 0.44);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function roundRect(
  ctx: RenderContext["ctx"],
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, Math.max(0, radius));
  } else {
    ctx.rect(x, y, width, height);
  }
}

function measureSpaced(
  ctx: RenderContext["ctx"],
  text: string,
  spacing: number,
): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  return chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, -spacing);
}

/** Per-line entrance, staggered slightly so rows cascade in. */
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
