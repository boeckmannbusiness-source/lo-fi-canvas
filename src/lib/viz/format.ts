import type { LayoutMode, SafeArea } from "./types";

export type ExportFormatId = "landscape" | "portrait";

export interface ExportFormat {
  id: ExportFormatId;
  label: string;
  short: string;
  layout: LayoutMode;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  /**
   * Content-safe insets as fractions of the canvas. This is composition data,
   * not platform UI: the renderer only knows "keep content inside these
   * margins" so it can stay generic across vertical video surfaces.
   */
  safe: SafeArea;
  /** null = use the full track duration */
  maxDuration: number | null;
  durationPresets: number[];
}

/**
 * Content-safe insets per composition mode.
 *
 * Landscape keeps the historic 4% margin on every edge. Portrait reserves a
 * generic vertical-video content band — extra room at the top for platform
 * chrome and at the bottom for captions / action controls — without hardcoding
 * any specific platform's UI dimensions.
 */
export const CONTENT_SAFE_AREAS: Record<LayoutMode, SafeArea> = {
  landscape: { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 },
  portrait: { top: 0.12, bottom: 0.2, left: 0.06, right: 0.06 },
};

export const EXPORT_FORMATS: Record<ExportFormatId, ExportFormat> = {
  landscape: {
    id: "landscape",
    label: "Landscape 16:9",
    short: "1920×1080",
    layout: "landscape",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 8_000_000,
    safe: CONTENT_SAFE_AREAS.landscape,
    maxDuration: null,
    durationPresets: [],
  },
  portrait: {
    id: "portrait",
    label: "Portrait 9:16",
    short: "1080×1920",
    layout: "portrait",
    width: 1080,
    height: 1920,
    fps: 30,
    bitrate: 6_000_000,
    safe: CONTENT_SAFE_AREAS.portrait,
    maxDuration: 60,
    durationPresets: [15, 30, 60],
  },
};

export const exportFormatList: ExportFormat[] = [
  EXPORT_FORMATS.landscape,
  EXPORT_FORMATS.portrait,
];

/** Content-safe insets for a composition mode (used when no format is given). */
export function safeAreaFor(layout: LayoutMode): SafeArea {
  return CONTENT_SAFE_AREAS[layout];
}

/** Hard duration clamp — applied in the UI and again inside renderVideo. */
export function clampDuration(format: ExportFormat, seconds: number): number {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
  return format.maxDuration === null ? s : Math.min(s, format.maxDuration);
}

/** Rough encoded size in MB for the export estimate. */
export function estimateSizeMb(format: ExportFormat, seconds: number): number {
  return ((format.bitrate + 192_000) * seconds) / 8 / 1_000_000;
}
