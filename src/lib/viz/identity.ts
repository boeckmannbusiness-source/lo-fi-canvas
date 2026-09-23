/**
 * BERLIN B TAPES — video identity geometry & timeline.
 *
 * A deliberately dependency-free module: no canvas, no DOM, no imports at
 * runtime. Everything here is a pure function of settings + time, which is what
 * lets the frame, the "now playing" label and the CTA card render identically
 * in the live preview and in the offline export.
 */

/* ── Frame ───────────────────────────────────────────────────────────────── */

export type FramePreset = "cream" | "warm-white" | "amber" | "muted-red" | "concrete" | "custom";

export interface FramePresetOption {
  id: FramePreset;
  name: string;
  color: string;
}

/** Single source of truth for the frame palette. */
export const FRAME_PRESETS: FramePresetOption[] = [
  { id: "cream", name: "Cream", color: "#EFE4CB" },
  { id: "warm-white", name: "Warm White", color: "#F7F2E8" },
  { id: "amber", name: "Amber", color: "#C98A2E" },
  { id: "muted-red", name: "Muted Red", color: "#8E3B34" },
  { id: "concrete", name: "Concrete", color: "#7A7A73" },
  { id: "custom", name: "Custom", color: "#EFE4CB" },
];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameLike {
  enabled: boolean;
  /** border thickness as a fraction of the shorter canvas edge */
  thickness: number;
  preset: string;
  color: string;
}

/** Margin used for layout when the frame is disabled. */
export const FALLBACK_CONTENT_MARGIN = 0.05;

/** Resolve the active frame colour, honouring the preset palette. */
export function resolveFrameColor(frame: { preset: string; color: string }): string {
  if (frame.preset === "custom") return frame.color;
  const match = FRAME_PRESETS.find((p) => p.id === frame.preset);
  return match ? match.color : frame.color;
}

/**
 * Frame border thickness in pixels. Keyed off the shorter canvas edge so the
 * same settings read with equal weight in landscape (16:9) and portrait (9:16)
 * instead of assuming a 1920×1080 stage.
 */
export function frameThicknessPx(frame: FrameLike, width: number, height: number): number {
  if (!frame.enabled || frame.thickness <= 0) return 0;
  return Math.min(width, height) * frame.thickness;
}

/**
 * The rectangle the artwork "sits inside" — the frame opening, or a safe
 * margin when the frame is disabled. The new identity elements are anchored to
 * this rect so they never fight the border at any aspect ratio.
 */
export function contentRect(frame: FrameLike, width: number, height: number): Rect {
  const t = frameThicknessPx(frame, width, height);
  if (t > 0) {
    return {
      x: t,
      y: t,
      width: Math.max(0, width - t * 2),
      height: Math.max(0, height - t * 2),
    };
  }
  const m = Math.min(width, height) * FALLBACK_CONTENT_MARGIN;
  return {
    x: m,
    y: m,
    width: Math.max(0, width - m * 2),
    height: Math.max(0, height - m * 2),
  };
}

/**
 * The four bands that make up the frame ring, derived from the same thickness
 * as the printed border. They let identity elements (the visualizer today,
 * metadata tomorrow) live intentionally on the frame instead of only inside
 * the artwork opening. Returns null when there is no frame to write on.
 */
export type FrameBandName = "top" | "bottom" | "left" | "right";

export interface FrameBands {
  thickness: number;
  content: Rect;
  top: Rect;
  bottom: Rect;
  left: Rect;
  right: Rect;
}

export function frameBands(
  frame: FrameLike,
  width: number,
  height: number,
): FrameBands | null {
  const t = frameThicknessPx(frame, width, height);
  if (t <= 0 || width <= t * 2 || height <= t * 2) return null;
  return {
    thickness: t,
    content: contentRect(frame, width, height),
    top: { x: 0, y: 0, width, height: t },
    bottom: { x: 0, y: height - t, width, height: t },
    left: { x: 0, y: 0, width: t, height },
    right: { x: width - t, y: 0, width: t, height },
  };
}

/* ── Visualizer colour ───────────────────────────────────────────────────── */

export type VisualizerColorPreset =
  | "white"
  | "black"
  | "red"
  | "dark-red"
  | "gray"
  | "custom";

export interface VisualizerColorPresetOption {
  id: VisualizerColorPreset;
  name: string;
  color: string;
}

/** Single source of truth for the visualizer palette. */
export const VISUALIZER_COLOR_PRESETS: VisualizerColorPresetOption[] = [
  { id: "white", name: "White", color: "#FFFFFF" },
  { id: "black", name: "Black", color: "#0A0A0A" },
  { id: "red", name: "Red", color: "#D5342B" },
  { id: "dark-red", name: "Dark Red", color: "#7A1F1A" },
  { id: "gray", name: "Gray", color: "#9A9A94" },
  { id: "custom", name: "Custom", color: "#FFFFFF" },
];

/**
 * Resolve the active visualizer colour. Defaults to white when the setting is
 * absent, so projects created before the colour system keep rendering exactly
 * as they did.
 */
export function resolveVisualizerColor(v: { colorPreset?: string; color?: string }): string {
  const preset = v.colorPreset ?? "white";
  if (preset === "custom") return v.color ?? "#FFFFFF";
  const match = VISUALIZER_COLOR_PRESETS.find((p) => p.id === preset);
  return match ? match.color : (v.color ?? "#FFFFFF");
}

/* ── Now playing ─────────────────────────────────────────────────────────── */

export type NowPlayingPosition =
  "top-right" | "top-left" | "bottom-right" | "bottom-left" | "custom";

export type HorizontalAlign = "left" | "center" | "right";

export interface NowPlayingLike {
  position: string;
  customX: number;
  customY: number;
  align: string;
}

export interface NowPlayingLayout {
  x: number;
  y: number;
  align: HorizontalAlign;
  anchorBottom: boolean;
  content: Rect;
  portrait: boolean;
}

/**
 * Anchor point for the "now playing" block, inside the frame opening.
 *
 * In portrait the right/bottom padding grows so the label clears the TikTok
 * action rail and caption area. No pixel positions are hardcoded to 16:9.
 */
export function nowPlayingLayout(
  np: NowPlayingLike,
  frame: FrameLike,
  width: number,
  height: number,
): NowPlayingLayout {
  const content = contentRect(frame, width, height);
  const portrait = height > width;
  const basePad = Math.min(content.width, content.height) * 0.07;
  const padLeft = basePad;
  const padRight = portrait ? width * 0.13 : basePad;
  const padTop = portrait ? height * 0.06 : basePad;
  const padBottom = portrait ? height * 0.11 : basePad;

  const left = content.x + padLeft;
  const right = content.x + content.width - padRight;
  const top = content.y + padTop;
  const bottom = content.y + content.height - padBottom;

  switch (np.position) {
    case "top-left":
      return { x: left, y: top, align: "left", anchorBottom: false, content, portrait };
    case "bottom-right":
      return { x: right, y: bottom, align: "right", anchorBottom: true, content, portrait };
    case "bottom-left":
      return { x: left, y: bottom, align: "left", anchorBottom: true, content, portrait };
    case "custom": {
      const align: HorizontalAlign =
        np.align === "left" || np.align === "center" ? np.align : "right";
      return {
        x: content.x + clamp01(np.customX) * content.width,
        y: content.y + clamp01(np.customY) * content.height,
        align,
        anchorBottom: false,
        content,
        portrait,
      };
    }
    case "top-right":
    default:
      return { x: right, y: top, align: "right", anchorBottom: false, content, portrait };
  }
}

/* ── Call to action ──────────────────────────────────────────────────────── */

export type CtaAnimationStyle = "slide-fade" | "fade" | "scale";
export type CtaBackgroundStyle = "title-card" | "dim";

export interface CtaLike {
  enabled: boolean;
  /** seconds into the timeline */
  startTime: number;
  /** visible duration in seconds */
  duration: number;
  backgroundStyle: string;
}

export interface CtaState {
  active: boolean;
  /** seconds since the card appeared */
  local: number;
  /** 0..1 through the card's duration */
  progress: number;
  /** overall crossfade against the normal scene */
  alpha: number;
  /** 0..1 text entrance */
  entrance: number;
  /** 0..1 exit ramp */
  exit: number;
  /** true when the artwork has to stay rendered underneath ("dim" style) */
  requiresBackdrop: boolean;
  /** normalized analog drift, scaled by the layer */
  driftX: number;
  driftY: number;
  /** normalized analog jitter for subtle flicker / breathing */
  jitter: number;
}

/**
 * Phase boundaries expressed as a fraction of the card duration. They mirror
 * the suggested 0.0–0.5s / 0.5–1.2s / 1.2–3.0s / 3.0–3.5s rhythm for a 3.5s
 * card but stay proportional, so a custom duration keeps the same cadence.
 */
export const CTA_PHASES = {
  cardIn: 0.5 / 3.5,
  textIn: 1.2 / 3.5,
  outStart: 3.0 / 3.5,
} as const;

const INACTIVE_CTA: CtaState = {
  active: false,
  local: 0,
  progress: 0,
  alpha: 0,
  entrance: 0,
  exit: 0,
  requiresBackdrop: false,
  driftX: 0,
  driftY: 0,
  jitter: 0,
};

/**
 * Deterministic CTA timeline state. Pure `time` in, state out — no rAF timers,
 * no accumulated state, so `preview(t) === export(t)`.
 */
export function ctaState(cta: CtaLike, time: number): CtaState {
  const requiresBackdrop = cta.backgroundStyle === "dim";
  if (!cta.enabled) return INACTIVE_CTA;

  const duration = Math.max(0.1, cta.duration);
  const local = time - cta.startTime;
  if (!Number.isFinite(local) || local < 0 || local >= duration) return INACTIVE_CTA;

  const progress = clamp01(local / duration);
  const inP = easeOutCubic(progress / CTA_PHASES.cardIn);
  const outP = easeInCubic((progress - CTA_PHASES.outStart) / (1 - CTA_PHASES.outStart));
  const entrance = easeOutCubic(
    (progress - CTA_PHASES.cardIn) / (CTA_PHASES.textIn - CTA_PHASES.cardIn),
  );
  const alpha = inP * (1 - outP);

  // Analog life: pure sines of local time, never random.
  const t = local;
  const driftX = Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9 + 1.1) * 0.4;
  const driftY = Math.cos(t * 0.9 + 0.4) * 0.6 + Math.cos(t * 2.3) * 0.4;
  const jitter =
    Math.sin(t * 11.3) * 0.5 + Math.sin(t * 7.1 + 2) * 0.3 + Math.sin(t * 23.7 + 1) * 0.2;

  return {
    active: true,
    local,
    progress,
    alpha,
    entrance,
    exit: outP,
    requiresBackdrop,
    driftX,
    driftY,
    jitter,
  };
}

/* ── Shared math / colour helpers ────────────────────────────────────────── */

export function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

export function easeOutCubic(t: number): number {
  const p = 1 - clamp01(t);
  return 1 - p * p * p;
}

export function easeInCubic(t: number): number {
  const p = clamp01(t);
  return p * p * p;
}

export function easeInOutCubic(t: number): number {
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** Hex (#rgb / #rrggbb) to an rgba() string with a clamped alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}
