import {
  clampRange,
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
  /** Frame placement only: the printed band the readout is composed into. */
  band?: Rect;
  /** Frame placement only: peak half-height the readout may occupy. */
  amplitude?: number;
}

/**
 * Frame-placement design system.
 *
 * The frame readout is *designed for the border*, not the artwork renderer
 * squeezed into it. Every value is a fraction of the frame thickness (the band
 * depth), so the composition responds to the actual printed border instead of
 * portrait pixel constants. These are design-system values, deliberately not
 * user settings.
 */
export const FRAME_VISUALIZER = {
  /** horizontal inset from the canvas edge, so the strip never kisses the trim */
  padX: 0.6,
  /** waveform peak half-height, relative to the band depth */
  waveformAmplitude: 0.3,
  /** bars / spectrum peak half-height, relative to the band depth */
  bandAmplitude: 0.28,
  /** stereo meter peak half-height, relative to the band depth */
  stereoAmplitude: 0.24,
  /** stroke weight, relative to the band depth */
  lineWeight: 0.05,
  /** points the frame waveform is resampled to (fewer = calmer, more graphic) */
  waveformPoints: 96,
  /** bar pitch as a multiple of the band depth, so density tracks thickness */
  barPitch: 1.4,
} as const;

/**
 * Pure geometry for the readout. Artwork placement reproduces the historic
 * landscape/portrait sizing; frame placement composes a dedicated strip inside
 * a frame band, derived from the frame thickness rather than hardcoded pixels.
 */
export function visualizerGeometry(r: RenderContext): VisualizerGeometry {
  const v = r.settings.visualizer;
  if (v.placement === "frame") {
    const framed = frameVisualizerGeometry(r);
    if (framed) return framed;
  }
  return artworkVisualizerGeometry(r);
}

/** Historic artwork geometry — unchanged, so the artwork readout never drifts. */
function artworkVisualizerGeometry(r: RenderContext): VisualizerGeometry {
  const v = r.settings.visualizer;
  const { width: W } = r;
  // Amplitude is sized off the short edge so the readout stays understated on
  // a tall canvas; width stays proportional to the frame.
  const w = W * (isPortrait(r) ? 0.4 + v.size * 0.45 : 0.25 + v.size * 0.45);
  const h = shortEdge(r) * (0.04 + v.size * 0.08);
  let cx = W / 2;
  if (v.position === "bottom-left") cx = W * 0.05 + w / 2;
  if (v.position === "bottom-right") cx = W * 0.95 - w / 2;
  return { cx, cy: visualizerBaseline(r), w, h, clip: null };
}

/**
 * Dedicated frame-band geometry.
 *
 * The band is treated as a printed strip: a horizontally stretched, vertically
 * restrained readout centred in the band, with breathing room above and below
 * and a small margin off the canvas trim. Amplitude is a fraction of the band
 * depth, so a thin frame yields a thin waveform and a thick frame a slightly
 * larger one — but never one that overflows the border or touches the artwork.
 */
export function frameVisualizerGeometry(r: RenderContext): VisualizerGeometry | null {
  const v = r.settings.visualizer;
  const { width: W, height: H } = r;
  const bands = frameBands(r.settings.frame, W, H);
  if (!bands) return null;

  const band = v.frameBand === "top" ? bands.top : bands.bottom;
  const t = bands.thickness;
  const padX = t * FRAME_VISUALIZER.padX;
  const left = band.x + padX;
  const right = band.x + band.width - padX;
  const span = Math.max(0, right - left);

  // Horizontal length uses the available band effectively; side positions take
  // a restrained share so they read as a deliberate left/right mark.
  const centered = v.position === "bottom-center";
  const w = span * (centered ? 1 : 0.5);

  const amplitudeRatio =
    v.type === "waveform"
      ? FRAME_VISUALIZER.waveformAmplitude
      : v.type === "stereo"
        ? FRAME_VISUALIZER.stereoAmplitude
        : FRAME_VISUALIZER.bandAmplitude;
  const amplitude = t * amplitudeRatio;

  const cy = band.y + band.height / 2;
  let cx = (left + right) / 2;
  if (v.position === "bottom-left") cx = left + w / 2;
  if (v.position === "bottom-right") cx = right - w / 2;

  // `h` stays the full peak-to-peak height so the shared geometry contract
  // (amplitude === h / 2) holds for tests and callers.
  return { cx, cy, w, h: amplitude * 2, clip: band, band, amplitude };
}

/** Artwork readout. Frame placement is drawn later, on top of the printed band. */
export function drawVisualizer(r: RenderContext) {
  const v = r.settings.visualizer;
  if (!v.enabled || v.opacity <= 0) return;
  if (v.placement === "frame") return; // handled by drawFrameVisualizer

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
 * Frame-band readout, drawn *after* the printed border so the band cannot paint
 * over it. Each mode gets a restrained, graphic treatment sized to the band
 * rather than a clipped copy of the artwork renderer.
 */
export function drawFrameVisualizer(r: RenderContext) {
  const v = r.settings.visualizer;
  if (!v.enabled || v.opacity <= 0 || v.placement !== "frame") return;

  const geo = frameVisualizerGeometry(r);
  if (!geo || !geo.band) return;

  const { ctx } = r;
  const color = resolveVisualizerColor(v);
  const gain = v.sensitivity;
  const bandDepth = geo.band.height;

  ctx.save();
  ctx.beginPath();
  ctx.rect(geo.band.x, geo.band.y, geo.band.width, geo.band.height);
  ctx.clip();

  ctx.globalAlpha = v.opacity;
  ctx.strokeStyle = hexToRgba(color, 0.9);
  ctx.fillStyle = hexToRgba(color, 0.85);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, bandDepth * FRAME_VISUALIZER.lineWeight);
  // Ink-on-paper separation: a faint dark offset keeps a light readout legible
  // on a light print band (and costs nothing on a dark one). Not a glow.
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.shadowBlur = Math.max(1, bandDepth * 0.1);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(1, bandDepth * 0.05);

  switch (v.type) {
    case "waveform":
      drawFrameWaveform(r, geo, gain);
      break;
    case "spectrum":
      drawFrameSpectrum(r, geo, gain);
      break;
    case "stereo":
      drawFrameStereo(r, geo, gain, color);
      break;
    default:
      drawFrameBars(r, geo, gain);
      break;
  }
  ctx.restore();
}

/**
 * Frame waveform: the primary frame readout.
 *
 * The raw 256-sample oscilloscope trace is resampled to a small, gently
 * smoothed polyline so it reads as one graphic line printed across the strip
 * rather than a dense scribble. Amplitude is the band-derived envelope, and
 * every sample is clamped to it so the line can never flat-top or overflow.
 */
function drawFrameWaveform(r: RenderContext, geo: VisualizerGeometry, gain: number) {
  const { ctx } = r;
  const amp = geo.amplitude ?? 0;
  if (amp <= 0 || geo.w <= 0) return;

  const samples = frameWaveformSamples(r.audio.waveform, FRAME_VISUALIZER.waveformPoints);
  const n = samples.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = geo.cx - geo.w / 2 + (i / (n - 1)) * geo.w;
    const v = clampRange(samples[i]! * gain, -1, 1);
    const y = geo.cy + v * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * Resample a raw waveform to `points` averaged values and smooth once with a
 * 3-tap binomial kernel. Pure and deterministic, so preview === export.
 */
export function frameWaveformSamples(data: Float32Array, points: number): Float32Array {
  const n = Math.max(2, Math.floor(points));
  const averaged = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i / n) * data.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / n) * data.length));
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j] ?? 0;
    averaged[i] = sum / (end - start);
  }
  const smoothed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const prev = averaged[i === 0 ? 0 : i - 1]!;
    const next = averaged[i === n - 1 ? n - 1 : i + 1]!;
    smoothed[i] = (prev + 2 * averaged[i]! + next) / 4;
  }
  return smoothed;
}

/** Frame bars: a restrained vertical-tick equalizer centred on the strip. */
function drawFrameBars(r: RenderContext, geo: VisualizerGeometry, gain: number) {
  const { ctx } = r;
  const amp = geo.amplitude ?? 0;
  if (amp <= 0 || geo.w <= 0) return;

  const depth = geo.band!.height;
  const bars = Math.round(clampRange(geo.w / (depth * FRAME_VISUALIZER.barPitch), 12, 56));
  const pitch = geo.w / bars;
  const bw = Math.max(1, pitch * 0.22);
  const data = r.audio.spectrum;
  for (let i = 0; i < bars; i++) {
    const raw = data[Math.floor((i / bars) * data.length)] ?? 0;
    const val = clampRange(raw * gain, 0, 1);
    const bh = Math.max(1, val * amp * 2);
    const x = geo.cx - geo.w / 2 + i * pitch + pitch / 2 - bw / 2;
    ctx.fillRect(x, geo.cy - bh / 2, bw, bh);
  }
}

/**
 * Frame spectrum: a mirrored, filled ribbon around the strip centreline. A
 * conventional upward spectrum is too tall and lopsided for a narrow border,
 * so the silhouette is reflected to stay graphic and symmetrical.
 */
function drawFrameSpectrum(r: RenderContext, geo: VisualizerGeometry, gain: number) {
  const { ctx } = r;
  const amp = geo.amplitude ?? 0;
  const data = r.audio.spectrum;
  const n = data.length;
  if (amp <= 0 || geo.w <= 0 || n < 2) return;

  const left = geo.cx - geo.w / 2;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  ctx.beginPath();
  ctx.moveTo(left, geo.cy);
  for (let i = 0; i < n; i++) {
    const x = left + (i / (n - 1)) * geo.w;
    const val = clampRange(data[i]! * gain, 0, 1);
    const y = geo.cy - val * amp;
    xs[i] = x;
    ys[i] = y;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(geo.cx + geo.w / 2, geo.cy);
  for (let i = n - 1; i >= 0; i--) {
    ctx.lineTo(xs[i]!, geo.cy + (geo.cy - ys[i]!));
  }
  ctx.closePath();

  const base = r.settings.visualizer.opacity;
  // Fill without the drop shadow so the silhouette stays flat and printed.
  ctx.shadowColor = "transparent";
  ctx.globalAlpha = base * 0.32;
  ctx.fill();
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.globalAlpha = base;
  ctx.stroke();
}

/** Frame stereo: two compact, symmetrical horizontal level bars. */
function drawFrameStereo(r: RenderContext, geo: VisualizerGeometry, gain: number, color: string) {
  const { ctx } = r;
  const amp = geo.amplitude ?? 0;
  if (amp <= 0 || geo.w <= 0) return;

  const levelL = clampRange(r.audio.levelLeft * gain, 0, 1);
  const levelR = clampRange(r.audio.levelRight * gain, 0, 1);
  const peakL = clampRange(r.audio.peakLeft * gain, 0, 1);
  const peakR = clampRange(r.audio.peakRight * gain, 0, 1);

  const thickness = Math.max(1, amp * 0.28);
  const gap = thickness * 1.6;
  const totalH = thickness * 2 + gap;
  const left = geo.cx - geo.w / 2;
  const top = geo.cy - totalH / 2;

  ctx.fillStyle = hexToRgba(color, 0.12);
  ctx.fillRect(left, top, geo.w, thickness);
  ctx.fillRect(left, top + thickness + gap, geo.w, thickness);

  ctx.fillStyle = hexToRgba(color, 0.9);
  ctx.fillRect(left, top, geo.w * levelL, thickness);
  ctx.fillRect(left, top + thickness + gap, geo.w * levelR, thickness);

  const tickW = Math.max(1, thickness * 0.6);
  ctx.fillStyle = hexToRgba(color, 0.95);
  if (peakL > 0.02) ctx.fillRect(left + geo.w * peakL - tickW / 2, top, tickW, thickness);
  if (peakR > 0.02) {
    ctx.fillRect(left + geo.w * peakR - tickW / 2, top + thickness + gap, tickW, thickness);
  }
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
