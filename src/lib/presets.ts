/**
 * User-saved presets for the BERLIN B TAPES visualizer.
 *
 * A deliberately self-contained persistence module: it knows how to capture
 * the *creative* configuration (the renderer `Settings` tree plus the export
 * format / duration that live in the studio state), validate it when read back,
 * and read/write the whole thing through a tiny pluggable storage interface.
 *
 * It never touches the renderer, the engine or `defaultSettings`, and it is
 * pure enough to run headlessly in the test scripts (pass a fake storage).
 */
import {
  FRAME_PRESETS,
  FONT_FAMILY_OPTIONS,
  VISUALIZER_COLOR_PRESETS,
  defaultSettings,
  type Settings,
} from "./viz/types";
import type { ExportFormatId } from "./viz/format";

/** Namespaced localStorage key that holds every saved preset. */
export const PRESETS_STORAGE_KEY = "berlin-b-tapes-presets";

/** Schema version written into every preset. Bump when the shape changes. */
export const PRESET_VERSION = 1;

/** Duration used when a legacy / malformed preset has no portrait duration. */
export const DEFAULT_PORTRAIT_DURATION = 30;

/**
 * The stable, versionable slice of user configuration a preset restores.
 *
 * `settings` is the full creative/render tree; `formatId` + `portraitDuration`
 * live in the studio UI state but materially change the rendered video, so they
 * travel with the preset. Nothing runtime (audio buffers, canvas, playback,
 * export progress, preview quality) is ever captured here.
 */
export interface PresetSettings {
  version: number;
  settings: Settings;
  formatId: ExportFormatId;
  portraitDuration: number;
}

/** A saved preset as persisted and listed in the UI. */
export interface StoredPreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: PresetSettings;
}

/** Minimal storage surface — `window.localStorage` satisfies it. */
export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/* ── Storage access ──────────────────────────────────────────────────────── */

/**
 * The browser storage engine, or null when it is unavailable (SSR, private
 * mode, disabled cookies, quota probes throwing). Callers must handle null
 * instead of letting a preset crash the app.
 */
export function resolvePresetStorage(): PresetStorage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const probe = `${PRESETS_STORAGE_KEY}:probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/* ── Pure shaping / validation ───────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CAMERA_MOVES = ["zoom-in", "zoom-out", "none"] as const;
const BACKGROUND_FITS = ["cover", "contain", "fill"] as const;
const VINYL_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "custom"] as const;
const TAPE_STYLES = ["industrial-black", "faded-archive", "bone-label"] as const;
const TAPE_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "center",
  "custom",
] as const;
const VISUALIZER_TYPES = ["waveform", "spectrum", "bars", "stereo"] as const;
const VISUALIZER_POSITIONS = ["bottom-center", "bottom-left", "bottom-right"] as const;
const VISUALIZER_ORIENTATIONS = ["horizontal", "vertical"] as const;
const VISUALIZER_PLACEMENTS = ["artwork", "frame"] as const;
const FRAME_BANDS = ["top", "bottom"] as const;
const TEXT_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "custom",
] as const;
const H_ALIGNS = ["left", "center", "right"] as const;
const V_ALIGNS = ["top", "center", "bottom"] as const;
const LOGO_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const NOW_PLAYING_POSITIONS = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
  "custom",
] as const;
const CTA_ANIMATIONS = ["slide-fade", "fade", "scale"] as const;
const CTA_BACKGROUNDS = ["title-card", "dim"] as const;
const CTA_POSITIONS = [
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "center",
  "top-center",
] as const;

const FONT_FAMILIES = FONT_FAMILY_OPTIONS.map((f) => f.value);
const FRAME_PRESET_IDS = FRAME_PRESETS.map((p) => p.id);
const VISUALIZER_COLOR_IDS = VISUALIZER_COLOR_PRESETS.map((p) => p.id);

/**
 * Allowed values for the closed string unions in `Settings`, keyed by
 * `section.field`. Anything else falls back to the current default, so a
 * hand-edited preset can never feed the renderer an impossible value.
 */
const ENUM_FIELDS: Record<string, readonly string[]> = {
  "camera.move": CAMERA_MOVES,
  "background.fit": BACKGROUND_FITS,
  "vinyl.position": VINYL_POSITIONS,
  "tape.style": TAPE_STYLES,
  "tape.position": TAPE_POSITIONS,
  "visualizer.type": VISUALIZER_TYPES,
  "visualizer.position": VISUALIZER_POSITIONS,
  "visualizer.orientation": VISUALIZER_ORIENTATIONS,
  "visualizer.colorPreset": VISUALIZER_COLOR_IDS,
  "visualizer.placement": VISUALIZER_PLACEMENTS,
  "visualizer.frameBand": FRAME_BANDS,
  "text.fontFamily": FONT_FAMILIES,
  "text.position": TEXT_POSITIONS,
  "text.positionH": H_ALIGNS,
  "text.positionV": V_ALIGNS,
  "text.textAlignment": H_ALIGNS,
  "logo.position": LOGO_POSITIONS,
  "frame.preset": FRAME_PRESET_IDS,
  "nowPlaying.position": NOW_PLAYING_POSITIONS,
  "nowPlaying.align": H_ALIGNS,
  "nowPlaying.fontFamily": FONT_FAMILIES,
  "cta.animationStyle": CTA_ANIMATIONS,
  "cta.backgroundStyle": CTA_BACKGROUNDS,
  "cta.position": CTA_POSITIONS,
  "cta.fontFamily": FONT_FAMILIES,
};

/** String fields that must be a hex colour, keyed by `section.field`. */
const COLOR_FIELDS = new Set([
  "visualizer.color",
  "text.titleColor",
  "text.subtitleColor",
  "text.shadowColor",
  "text.strokeColor",
  "frame.color",
  "nowPlaying.color",
  "cta.color",
]);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function sanitizeHex(value: string): string | null {
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed.toUpperCase() : null;
}

/**
 * Deep-merge untrusted input over a fresh set of defaults, one leaf at a time.
 *
 * The default value decides the type: numbers must be finite, booleans must be
 * booleans, closed-union strings must be in their allowlist and colours must be
 * valid hex. Unknown keys are dropped. This is what makes an old preset keep
 * working after a new setting is added: the new field simply takes its default.
 */
function mergeValue(defaultValue: unknown, input: unknown, path: string): unknown {
  if (isRecord(defaultValue)) {
    const source = isRecord(input) ? input : {};
    const merged: Record<string, unknown> = {};
    for (const key of Object.keys(defaultValue)) {
      merged[key] = mergeValue(defaultValue[key], source[key], path ? `${path}.${key}` : key);
    }
    return merged;
  }

  switch (typeof defaultValue) {
    case "number":
      return typeof input === "number" && Number.isFinite(input) ? input : defaultValue;
    case "boolean":
      return typeof input === "boolean" ? input : defaultValue;
    case "string": {
      if (typeof input !== "string") return defaultValue;
      const allowed = ENUM_FIELDS[path];
      if (allowed) return allowed.includes(input) ? input : defaultValue;
      if (COLOR_FIELDS.has(path)) return sanitizeHex(input) ?? defaultValue;
      return input;
    }
    default:
      return defaultValue;
  }
}

function sanitizeFormatId(input: unknown): ExportFormatId {
  return input === "portrait" || input === "landscape" ? input : "landscape";
}

function sanitizePortraitDuration(input: unknown): number {
  return typeof input === "number" && Number.isFinite(input) && input > 0
    ? input
    : DEFAULT_PORTRAIT_DURATION;
}

/**
 * Coerce any input into a complete, valid `PresetSettings`. Missing fields take
 * the current default; malformed values fall back too. Never mutates
 * `defaultSettings` (it builds an entirely new tree).
 */
export function sanitizePresetSettings(input: unknown): PresetSettings {
  const record = isRecord(input) ? input : {};
  return {
    version: PRESET_VERSION,
    settings: mergeValue(defaultSettings(), record["settings"], "") as Settings,
    formatId: sanitizeFormatId(record["formatId"]),
    portraitDuration: sanitizePortraitDuration(record["portraitDuration"]),
  };
}

/**
 * Snapshot the current studio configuration into a preset payload. Validation
 * doubles as the deep clone, so the result never aliases live React state.
 */
export function capturePresetSettings(
  settings: Settings,
  formatId: ExportFormatId,
  portraitDuration: number,
): PresetSettings {
  return sanitizePresetSettings({
    version: PRESET_VERSION,
    settings,
    formatId,
    portraitDuration,
  });
}

/* ── Preset record helpers (pure) ────────────────────────────────────────── */

function createPresetId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    try {
      return cryptoApi.randomUUID();
    } catch {
      /* fall through to the timestamp-based id */
    }
  }
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeStoredPreset(input: unknown): StoredPreset | null {
  if (!isRecord(input)) return null;
  const id = typeof input["id"] === "string" ? input["id"].trim() : "";
  const name = typeof input["name"] === "string" ? input["name"].trim() : "";
  if (!id || !name) return null;

  const createdAt = typeof input["createdAt"] === "string" ? input["createdAt"] : "";
  const updatedAt = typeof input["updatedAt"] === "string" ? input["updatedAt"] : createdAt;
  return {
    id,
    name,
    createdAt,
    updatedAt,
    settings: sanitizePresetSettings(input["settings"]),
  };
}

/** Build a new stored preset from a name + captured settings. */
export function makeStoredPreset(
  name: string,
  settings: PresetSettings,
  now: Date = new Date(),
): StoredPreset {
  const timestamp = now.toISOString();
  return {
    id: createPresetId(),
    name: name.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: sanitizePresetSettings(settings),
  };
}

/** Insert or replace a preset by id, returning a new list. */
export function upsertStoredPreset(
  presets: readonly StoredPreset[],
  preset: StoredPreset,
): StoredPreset[] {
  const index = presets.findIndex((p) => p.id === preset.id);
  if (index === -1) return [...presets, preset];
  const next = [...presets];
  next[index] = preset;
  return next;
}

/** Remove a preset by id, returning a new list. */
export function removeStoredPreset(presets: readonly StoredPreset[], id: string): StoredPreset[] {
  return presets.filter((p) => p.id !== id);
}

/* ── Serialization ───────────────────────────────────────────────────────── */

/** Parse arbitrary stored text into a list of valid presets; never throws. */
export function parseStoredPresets(raw: string | null | undefined): StoredPreset[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data["presets"])
      ? (data["presets"] as unknown[])
      : null;
  if (!list) return [];

  const presets: StoredPreset[] = [];
  for (const item of list) {
    const preset = sanitizeStoredPreset(item);
    if (preset) presets.push(preset);
  }
  return presets;
}

export function serializeStoredPresets(presets: readonly StoredPreset[]): string {
  return JSON.stringify(presets);
}

/* ── Storage-backed API ──────────────────────────────────────────────────── */

/** Read every valid saved preset. Returns [] when storage is unavailable. */
export function loadPresets(
  storage: PresetStorage | null = resolvePresetStorage(),
): StoredPreset[] {
  if (!storage) return [];
  try {
    return parseStoredPresets(storage.getItem(PRESETS_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Persist the whole list. Returns false when storage is unavailable/full. */
export function persistPresets(
  presets: readonly StoredPreset[],
  storage: PresetStorage | null = resolvePresetStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PRESETS_STORAGE_KEY, serializeStoredPresets(presets));
    return true;
  } catch {
    return false;
  }
}

/**
 * Save a named preset. Returns the created preset and the updated list, or
 * null when the name is blank or the browser refuses to persist.
 */
export function savePreset(
  name: string,
  settings: PresetSettings,
  storage: PresetStorage | null = resolvePresetStorage(),
): { preset: StoredPreset; presets: StoredPreset[] } | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const preset = makeStoredPreset(trimmed, settings);
  const presets = upsertStoredPreset(loadPresets(storage), preset);
  if (!persistPresets(presets, storage)) return null;
  return { preset, presets };
}

/**
 * Delete a preset by id, returning the updated list. A missing id is a no-op.
 * Returns null only when storage is unavailable so the caller can surface it.
 */
export function deletePreset(
  id: string,
  storage: PresetStorage | null = resolvePresetStorage(),
): StoredPreset[] | null {
  const existing = loadPresets(storage);
  const next = removeStoredPreset(existing, id);
  if (!persistPresets(next, storage)) return null;
  return next;
}

/** Whether presets can be persisted at all (used to disable the save action). */
export function isPresetStorageAvailable(): boolean {
  return resolvePresetStorage() !== null;
}
