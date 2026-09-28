/**
 * LocalStorage persistence for the YouTube production metadata.
 *
 * Reuses the app's existing storage resolver (`resolvePresetStorage`), so the
 * production draft lives in the same namespaced `window.localStorage` as the
 * user presets — no new persistence layer, no backend. Reads never throw; a
 * malformed or missing value falls back to the canonical defaults.
 */
import { resolvePresetStorage, type PresetStorage } from "../presets";
import {
  DEFAULT_YOUTUBE_PRODUCTION,
  sanitizeYouTubeProduction,
  type YouTubeProduction,
} from "./production";

export const YOUTUBE_STORAGE_KEY = "berlin-b-tapes-youtube-production";

/** Parse arbitrary stored text into a valid production; never throws. */
export function parseYouTubeProduction(raw: string | null | undefined): YouTubeProduction {
  if (!raw) return sanitizeYouTubeProduction(DEFAULT_YOUTUBE_PRODUCTION);
  try {
    return sanitizeYouTubeProduction(JSON.parse(raw));
  } catch {
    return sanitizeYouTubeProduction(DEFAULT_YOUTUBE_PRODUCTION);
  }
}

export function serializeYouTubeProduction(production: YouTubeProduction): string {
  return JSON.stringify(sanitizeYouTubeProduction(production));
}

/** Read the saved production. Always returns a complete, valid object. */
export function loadYouTubeProduction(
  storage: PresetStorage | null = resolvePresetStorage(),
): YouTubeProduction {
  if (!storage) return sanitizeYouTubeProduction(DEFAULT_YOUTUBE_PRODUCTION);
  try {
    return parseYouTubeProduction(storage.getItem(YOUTUBE_STORAGE_KEY));
  } catch {
    return sanitizeYouTubeProduction(DEFAULT_YOUTUBE_PRODUCTION);
  }
}

/** Persist the production. Returns false when storage is unavailable/full. */
export function persistYouTubeProduction(
  production: YouTubeProduction,
  storage: PresetStorage | null = resolvePresetStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(YOUTUBE_STORAGE_KEY, serializeYouTubeProduction(production));
    return true;
  } catch {
    return false;
  }
}
