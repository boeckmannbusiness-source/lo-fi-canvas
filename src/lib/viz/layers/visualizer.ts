import {
  contentRect,
  frameBands,
  hexToRgba,
  resolveVisualizerColor,
  type Rect,
} from "../identity";
import { isPortrait, safeRect, shortEdge } from "../layout";
import type { RenderContext } from "../types";

/** Resolved placement of the readout, shared by drawing and geometry tests. */
export interface VisualizerGeometry {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** When set the readout is clipped to this rect (frame placement). */
  clip: Rect | null;
}

/**
 * Pure geometry for the readout. Artwork placement reproduces the historic
 * landscape/portrait sizing; frame placement fits the readout inside a frame
 * band, derived from the frame thickness rather than hardcoded coordinates.
 */
export function visualizerGeometry(r: RenderContext): VisualizerGeometry {
  const v = r.settings.visualizer;
  const { width: W } = r;
  if (v.placement === "frame") {
    const framed = frameVisualizerGeometry(r);
    if (framed) return framed;
  }
  // Amplitude is sized off the short edge so the readout stays understated on
  // a tall canvas; width stays proportional to the frame.
  const w = W * (isPortrait(r) ? 0.4 + v.size * 0.45 : 0.25 + v.size * 0.45);
  const h = shortEdge(r) * (0.04 + v.size * 0.08);
  let cx = W / 2;
  if (v.position === "bottom-left") cx = W * 0.05 + w / 2;
  if (v.position === "bottom-right") cx = W * 0.95 - w / 2;
  return { cx, cy: visualizerBaseline(r), w, h, clip: null };
}

/** Readout fitted into a frame band, padded off the canvas edge and artwork. */
function frameVisualizerGeometry(r: RenderContext): VisualizerGeometry | null {
  const v = r.settings.visualizer;
  const { width: W, height: H } = r;
  const bands = frameBands(r.settings.frame, W, H);
  if (!bands) return null;
  const band = v.frameBand === "top" ? bands.top : bands.bottom;
  const pad = bands.thickness * 0.15;
  const left = band.x + pad;
  const right = band.x + band.width - pad;
  const top = band.y + pad;
  const bottom = band.y + band.height - pad;
  const span = Math.max(0, right - left);
  const availH = Math.max(0, bottom - top);
  const w = span * (v.position === "bottom-center" ? 0.72 : 0.42);
  const hFactor =
    v.type === "spectrum"
      ? 0.44
      : v.type === "stereo"
        ? v.orientation === "horizontal"
          ? 0.42
          : 0.26
        : 0.68;
  const h = availH * hFactor;
  let cx = (left + right) / 2;
  if (v.position === "bottom-left") cx = left + w / 2;
  if (v.position === "bottom-right") cx = right - w / 2;
  return { cx, cy: (top + bottom) / 2, w, h, clip: band };
}

/** Understated waveform / spectrum / bars / stereo level meter readout. */
export function drawVisualizer(r: RenderContext) {
  const v = r.settings.visualizer;
  if (!v.enabled || v.opacity <= 0) return;
  const { ctx } = r;
  const { cx, cy, w, h, clip } = visualizerGeometry(r);
  const gain = v.sensitivity;
  // One resolved colour for every mode — no per-mode hardcoded white.
  const color = resolveVisualizerColor(v);

  ctx.save();
  if (clip) {
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
    ctx.clip();
  }
  ctx.globalAlpha = v.opacity;
  ctx.strokeStyle = hexToRgba(color, 0.85);
  ctx.fillStyle = hexToRgba(color, 0.8);
  ctx.lineWidth = Math.max(1, 1.6 * r.scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (v.type === "waveform") {
    const data = r.audio.waveform;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = cx - w / 2 + (i / (data.length - 1)) * w;
      const y = cy + data[i]! * h * 0.5 * gain;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (v.type === "spectrum") {
    const data = r.audio.spectrum;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy);
    for (let i = 0; i < data.length; i++) {
      const x = cx - w / 2 + (i / (data.length - 1)) * w;
      const y = cy - Math.min(1, data[i]! * gain) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx + w / 2, cy);
    ctx.globalAlpha = v.opacity * 0.35;
    ctx.fill();
    ctx.globalAlpha = v.opacity;
    ctx.stroke();
  } else if (v.type === "stereo") {
    drawStereoMeter(r, cx, cy, w, h, gain, color);
  } else {
    // "bars" — minimal bars with improved perceptual normalization
    const data = r.audio.spectrum;
    const bars = 32;
    const gap = w / bars;
    const bw = Math.max(1, gap * 0.35);
    for (let i = 0; i < bars; i++) {
      // Use the existing log-spaced spectrum but apply perceptual lifting
      // to higher-frequency bins so they have visible but subtle movement.
      // The raw spectrum is already log-spaced, but high bins are naturally
      // quieter. Apply a frequency-dependent gain that boosts upper bins
      // gently without clipping.
      const rawVal = data[Math.floor((i / bars) * data.length)]!;
      // Perceptual curve: higher bins get a gentle lift, capped at 1
      const freqRatio = i / (bars - 1); // 0..1 across the bars
      // Subtle lift: 1.0 at low end, up to ~1.7x at the top
      const perceptualBoost = 1.0 + freqRatio * 0.7;
      const val = Math.min(1, rawVal * gain * perceptualBoost);
      const bh = Math.max(1, val * h);
      const x = cx - w / 2 + i * gap + gap / 2 - bw / 2;
      ctx.fillRect(x, cy - bh / 2, bw, bh);
    }
  }
  ctx.restore();
}

/**
 * Vertical centre of the readout, derived from the actual constraints rather
 * than a magic fraction.
 *
 * - Landscape keeps the historic 0.88H baseline, lifted only when the artwork
 *   frame opening would otherwise clip the readout.
 * - Portrait must clear *both* the frame opening and the content-safe bottom
 *   band reserved for platform captions / controls.
 */
export function visualizerBaseline(r: RenderContext): number {
  const v = r.settings.visualizer;
  const { width: W, height: H } = r;
  const h = shortEdge(r) * (0.04 + v.size * 0.08);
  // How far the readout extends either side of its centre.
  const labelSize = Math.max(8, Math.round(10 * r.scale));
  const half =
    v.type === "stereo" && v.orientation !== "horizontal"
      ? h * 1.75 + labelSize * 1.5
      : v.type === "stereo"
        ? Math.max(3, 4 * r.scale) + Math.max(6, 10 * r.scale) / 2
        : h * 0.5;
  const pad = Math.min(W, H) * 0.02;
  if (isPortrait(r)) {
    const content = contentRect(r.settings.frame, W, H);
    const limit = Math.min(content.y + content.height, safeRect(r).bottom);
    return limit - half - pad;
  }
  let cy = H * 0.88;
  if (r.settings.frame.enabled) {
    const content = contentRect(r.settings.frame, W, H);
    cy = Math.min(cy, content.y + content.height - half - pad);
  }
  return cy;
}

/**
 * Stereo L/R Level Meter — vertical bars with subtle peak hold.
 * Vintage studio hardware aesthetic: thin bars, small L/R labels,
 * minimal glow, smooth attack/release already baked into the analysis data.
 */
function drawStereoMeter(
  r: RenderContext,
  cx: number,
  cy: number,
  w: number,
  h: number,
  gain: number,
  color: string,
) {
  const { ctx, scale } = r;
  const levelL = Math.min(1, r.audio.levelLeft * gain);
  const levelR = Math.min(1, r.audio.levelRight * gain);
  const peakL = Math.min(1, r.audio.peakLeft * gain);
  const peakR = Math.min(1, r.audio.peakRight * gain);

  const isVertical = r.settings.visualizer.orientation !== "horizontal";

  // Vintage studio hardware, tinted by the resolved visualizer colour.
  const barColor = hexToRgba(color, 0.88);
  const peakColor = hexToRgba(color, 0.95);
  const peakHoldColor = hexToRgba(color, 0.8);
  const labelColor = hexToRgba(color, 0.6);
  const trackBg = hexToRgba(color, 0.06);

  const fontSize = Math.max(8, Math.round(10 * scale));
  ctx.font = `500 ${fontSize}px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  if (isVertical) {
    // Vertical orientation: two side-by-side vertical bars
    const barHeight = h * 3.5;
    const barWidth = Math.max(3, Math.round(4 * scale));
    const gap = Math.max(6, Math.round(10 * scale));
    const totalW = barWidth * 2 + gap;
    const startX = cx - totalW / 2;
    const barTop = cy - barHeight / 2;

    // Track backgrounds
    ctx.fillStyle = trackBg;
    ctx.fillRect(startX, barTop, barWidth, barHeight);
    ctx.fillRect(startX + barWidth + gap, barTop, barWidth, barHeight);

    // L bar
    const lH = levelL * barHeight;
    ctx.fillStyle = barColor;
    ctx.fillRect(startX, barTop + barHeight - lH, barWidth, lH);

    // R bar
    const rH = levelR * barHeight;
    ctx.fillStyle = barColor;
    ctx.fillRect(startX + barWidth + gap, barTop + barHeight - rH, barWidth, rH);

    // Peak hold indicators — small bright line that decays slowly
    const peakTickH = Math.max(1, 2 * scale);
    if (peakL > 0.02) {
      const peakLY = barTop + barHeight - peakL * barHeight;
      ctx.fillStyle = peakL > levelL + 0.01 ? peakHoldColor : peakColor;
      ctx.fillRect(startX, peakLY - peakTickH / 2, barWidth, peakTickH);
    }
    if (peakR > 0.02) {
      const peakRY = barTop + barHeight - peakR * barHeight;
      ctx.fillStyle = peakR > levelR + 0.01 ? peakHoldColor : peakColor;
      ctx.fillRect(startX + barWidth + gap, peakRY - peakTickH / 2, barWidth, peakTickH);
    }

    // L / R labels below the bars
    ctx.fillStyle = labelColor;
    ctx.fillText("L", startX + barWidth / 2, barTop + barHeight + fontSize * 0.9);
    ctx.fillText("R", startX + barWidth + gap + barWidth / 2, barTop + barHeight + fontSize * 0.9);
  } else {
    // Horizontal orientation: two stacked horizontal bars
    const barLength = w * 1.2;
    const barThickness = Math.max(3, Math.round(4 * scale));
    const gap = Math.max(6, Math.round(10 * scale));
    const totalH = barThickness * 2 + gap;
    const barLeft = cx - barLength / 2;
    const startY = cy - totalH / 2;

    // Track backgrounds
    ctx.fillStyle = trackBg;
    ctx.fillRect(barLeft, startY, barLength, barThickness);
    ctx.fillRect(barLeft, startY + barThickness + gap, barLength, barThickness);

    // L bar (top)
    const lW = levelL * barLength;
    ctx.fillStyle = barColor;
    ctx.fillRect(barLeft, startY, lW, barThickness);

    // R bar (bottom)
    const rW = levelR * barLength;
    ctx.fillStyle = barColor;
    ctx.fillRect(barLeft, startY + barThickness + gap, rW, barThickness);

    // Peak hold indicators
    const peakTickW = Math.max(1, 2 * scale);
    if (peakL > 0.02) {
      const peakLX = barLeft + peakL * barLength;
      ctx.fillStyle = peakL > levelL + 0.01 ? peakHoldColor : peakColor;
      ctx.fillRect(peakLX - peakTickW / 2, startY, peakTickW, barThickness);
    }
    if (peakR > 0.02) {
      const peakRX = barLeft + peakR * barLength;
      ctx.fillStyle = peakR > levelR + 0.01 ? peakHoldColor : peakColor;
      ctx.fillRect(peakRX - peakTickW / 2, startY + barThickness + gap, peakTickW, barThickness);
    }

    // L / R labels to the left
    ctx.fillStyle = labelColor;
    ctx.textAlign = "right";
    const labelX = barLeft - Math.round(6 * scale);
    ctx.fillText("L", labelX, startY + barThickness / 2);
    ctx.fillText("R", labelX, startY + barThickness + gap + barThickness / 2);
  }
}
