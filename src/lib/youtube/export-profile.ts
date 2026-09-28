/**
 * The YouTube export profile.
 *
 * Kept separate from the visualizer's `EXPORT_FORMATS` (landscape 30 fps /
 * portrait 9:16) so the existing Visualizer and TikTok exports are untouched:
 * the YouTube Production flow chooses this profile explicitly.
 *
 * YouTube: 16:9 · 1920×1080 · 60 fps. The renderer derives the correct H.264
 * level from these dimensions (1080p60 → High L4.2), so no second encoder is
 * needed — this is the same `renderVideo` pipeline.
 */
import { CONTENT_SAFE_AREAS } from "../viz/format";
import type { LayoutMode, SafeArea } from "../viz/types";

export interface YouTubeExportProfile {
  id: "youtube-16x9";
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  layout: LayoutMode;
  safe: SafeArea;
  maxDuration: number | null;
}

export const YOUTUBE_EXPORT: YouTubeExportProfile = {
  id: "youtube-16x9",
  width: 1920,
  height: 1080,
  fps: 60,
  bitrate: 12_000_000,
  layout: "landscape",
  safe: CONTENT_SAFE_AREAS.landscape,
  maxDuration: null,
};
