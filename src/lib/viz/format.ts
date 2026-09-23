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
  /** null = use the full track duration */
  maxDuration: number | null;
  durationPresets: number[];
}

export const SAFE_AREAS: Record<LayoutMode, SafeArea> = {
  landscape: { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 },
  // TikTok / Reels / Shorts UI: header on top, caption + action rail at the bottom.
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
    maxDuration: 60,
    durationPresets: [15, 30, 60],
  },
};

export const exportFormatList: ExportFormat[] = [
  EXPORT_FORMATS.landscape,
  EXPORT_FORMATS.portrait,
];

/** Hard duration clamp — applied in the UI and again inside renderVideo. */
export function clampDuration(format: ExportFormat, seconds: number): number {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
  return format.maxDuration === null ? s : Math.min(s, format.maxDuration);
}

/** Rough encoded size in MB for the export estimate. */
export function estimateSizeMb(format: ExportFormat, seconds: number): number {
  return ((format.bitrate + 192_000) * seconds) / 8 / 1_000_000;
}
