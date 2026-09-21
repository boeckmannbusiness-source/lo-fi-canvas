export type BackgroundFit = "cover" | "contain" | "fill";
export type VinylPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "custom";
export type TapePosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "custom";
export type VisualizerType = "waveform" | "spectrum" | "bars" | "stereo";
export type VisualizerPosition = "bottom-center" | "bottom-left" | "bottom-right";
export type VisualizerOrientation = "horizontal" | "vertical";
export type TextPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "custom";
export type TextHAlign = "left" | "center" | "right";
export type TextVAlign = "top" | "center" | "bottom";
export type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CameraMove = "zoom-in" | "zoom-out" | "none";

/** Font family options for the typography system. */
export type FontFamily =
  | "System Sans"
  | "Inter"
  | "Space Grotesk"
  | "Oswald"
  | "IBM Plex Mono"
  | "Playfair Display"
  | "Bebas Neue"
  | "System Serif"
  | "System Mono";

export interface FontFamilyOption {
  value: FontFamily;
  label: string;
  category: string;
}

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  { value: "System Sans", label: "System Sans", category: "Sans / System" },
  { value: "Inter", label: "Inter", category: "Sans / Modern" },
  { value: "Space Grotesk", label: "Space Grotesk", category: "Sans / Modern" },
  { value: "Oswald", label: "Oswald", category: "Condensed" },
  { value: "Bebas Neue", label: "Bebas Neue", category: "Display / Editorial" },
  { value: "System Serif", label: "System Serif", category: "Serif / System" },
  { value: "Playfair Display", label: "Playfair Display", category: "Serif / Editorial" },
  { value: "System Mono", label: "System Mono", category: "Monospace / System" },
  { value: "IBM Plex Mono", label: "IBM Plex Mono", category: "Monospace" },
];

export const FONT_WEIGHT_OPTIONS = [
  { value: 100, label: "Thin" },
  { value: 200, label: "Extra Light" },
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra Bold" },
  { value: 900, label: "Black" },
];

export interface Settings {
  camera: {
    move: CameraMove;
    /** extra scale over 5 minutes, e.g. 0.03 = 100% -> 103% */
    amount: number;
    driftX: number;
    driftY: number;
  };
  background: {
    fit: BackgroundFit;
    vignette: number;
    warmth: number;
  };
  vinyl: {
    enabled: boolean;
    position: VinylPosition;
    x: number;
    y: number;
    size: number;
    opacity: number;
    rpm: number;
    audioReactive: boolean;
    labelDarkness: number;
  };
  tape: {
    enabled: boolean;
    position: TapePosition;
    x: number;
    y: number;
    size: number;
    opacity: number;
    motion: number;
    audioReactive: boolean;
    printArtwork: boolean;
    labelDarkness: number;
  };
  grain: { enabled: boolean; intensity: number };
  dust: { enabled: boolean; density: number; speed: number; opacity: number };
  rain: { enabled: boolean; density: number; speed: number; opacity: number };
  flicker: { enabled: boolean; intensity: number; speed: number };
  visualizer: {
    enabled: boolean;
    type: VisualizerType;
    position: VisualizerPosition;
    opacity: number;
    size: number;
    sensitivity: number;
    orientation: VisualizerOrientation;
  };
  text: {
    enabled: boolean;
    title: string;
    subtitle: string;
    showSubtitle: boolean;
    fontFamily: FontFamily;
    titleWeight: number;
    subtitleWeight: number;
    fontSize: number;
    opacity: number;
    titleColor: string;
    titleOpacity: number;
    titleLetterSpacing: number;
    subtitleSize: number;
    subtitleColor: string;
    subtitleOpacity: number;
    subtitleLetterSpacing: number;
    lineHeight: number;
    position: TextPosition;
    positionH: TextHAlign;
    positionV: TextVAlign;
    customX: number;
    customY: number;
    textAlignment: TextHAlign;
    shadowEnabled: boolean;
    shadowColor: string;
    shadowOpacity: number;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    strokeEnabled: boolean;
    strokeColor: string;
    strokeWidth: number;
  };
  logo: {
    enabled: boolean;
    position: LogoPosition;
    size: number;
    opacity: number;
    margin: number;
  };
}

/** Smoothed per-frame audio features. */
export interface AudioFrame {
  rms: number;
  bass: number;
  mid: number;
  treble: number;
  spectrum: Float32Array; // 64 normalized bins
  waveform: Float32Array; // 256 samples, -1..1
  levelLeft: number;
  levelRight: number;
  peakLeft: number;
  peakRight: number;
}

export const SILENT_FRAME: AudioFrame = {
  rms: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  spectrum: new Float32Array(64),
  waveform: new Float32Array(256),
  levelLeft: 0,
  levelRight: 0,
  peakLeft: 0,
  peakRight: 0,
};

export interface RenderContext {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  width: number;
  height: number;
  /** playback time in seconds */
  time: number;
  /** total duration in seconds (fallback 300) */
  duration: number;
  audio: AudioFrame;
  settings: Settings;
  image: CanvasImageSource | null;
  imageWidth: number;
  imageHeight: number;
  logo: CanvasImageSource | null;
  logoWidth: number;
  logoHeight: number;
  /** scale factor relative to 1920x1080 reference */
  scale: number;
}

export const defaultSettings = (): Settings => ({
  camera: { move: "zoom-in", amount: 0.03, driftX: 0.2, driftY: 0.1 },
  background: { fit: "cover", vignette: 0.35, warmth: 0.12 },
  vinyl: {
    enabled: true,
    position: "bottom-right",
    x: 0.82,
    y: 0.74,
    size: 0.3,
    opacity: 0.9,
    rpm: 33.3,
    audioReactive: true,
    labelDarkness: 0.42,
  },
  tape: {
    enabled: false,
    position: "bottom-left",
    x: 0.18,
    y: 0.78,
    size: 0.28,
    opacity: 0.88,
    motion: 0.45,
    audioReactive: true,
    printArtwork: true,
    labelDarkness: 0.42,
  },
  grain: { enabled: true, intensity: 0.07 },
  dust: { enabled: true, density: 0.4, speed: 0.3, opacity: 0.25 },
  rain: { enabled: false, density: 0.4, speed: 0.5, opacity: 0.18 },
  flicker: { enabled: true, intensity: 0.05, speed: 0.4 },
  visualizer: {
    enabled: false,
    type: "waveform",
    position: "bottom-center",
    opacity: 0.35,
    size: 0.5,
    sensitivity: 1,
    orientation: "vertical",
  },
  text: {
    enabled: false,
    title: "MIDNIGHT TOKYO",
    subtitle: "lo-fi beats for late nights",
    showSubtitle: true,
    fontFamily: "Inter",
    titleWeight: 700,
    subtitleWeight: 400,
    fontSize: 6,
    opacity: 0.85,
    titleColor: "#F5E6C8",
    titleOpacity: 0.9,
    titleLetterSpacing: 0,
    subtitleSize: 2.2,
    subtitleColor: "#F5E6C8",
    subtitleOpacity: 0.65,
    subtitleLetterSpacing: 0.02,
    lineHeight: 1.3,
    position: "center",
    positionH: "center",
    positionV: "center",
    customX: 0.5,
    customY: 0.5,
    textAlignment: "center",
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.55,
    shadowBlur: 0.3,
    shadowOffsetX: 0,
    shadowOffsetY: 0.05,
    strokeEnabled: false,
    strokeColor: "#000000",
    strokeWidth: 0.05,
  },
  logo: {
    enabled: false,
    position: "top-right",
    size: 0.14,
    opacity: 0.8,
    margin: 0.04,
  },
});

export interface Preset {
  id: string;
  name: string;
  description: string;
  apply: (s: Settings) => Settings;
}

const clone = (s: Settings): Settings => JSON.parse(JSON.stringify(s)) as Settings;

export const presets: Preset[] = [
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "Rainy neon window, vinyl spinning",
    apply: (base) => {
      const s = clone(base);
      s.vinyl.enabled = true;
      s.rain = { enabled: true, density: 0.45, speed: 0.55, opacity: 0.2 };
      s.dust = { enabled: true, density: 0.35, speed: 0.25, opacity: 0.22 };
      s.grain = { enabled: true, intensity: 0.08 };
      s.flicker = { enabled: true, intensity: 0.06, speed: 0.5 };
      s.visualizer.enabled = false;
      s.camera = { move: "zoom-in", amount: 0.03, driftX: 0.2, driftY: 0.1 };
      return s;
    },
  },
  {
    id: "coffee-shop",
    name: "Coffee Shop",
    description: "Warm, still, gently alive",
    apply: (base) => {
      const s = clone(base);
      s.vinyl.enabled = true;
      s.rain.enabled = false;
      s.dust = { enabled: true, density: 0.5, speed: 0.22, opacity: 0.3 };
      s.grain = { enabled: true, intensity: 0.06 };
      s.flicker = { enabled: true, intensity: 0.04, speed: 0.3 };
      s.visualizer.enabled = false;
      s.background.warmth = 0.2;
      s.camera = { move: "zoom-in", amount: 0.025, driftX: 0.15, driftY: 0.05 };
      return s;
    },
  },
  {
    id: "late-night-coding",
    name: "Late Night Coding",
    description: "Rain, dust and an understated waveform",
    apply: (base) => {
      const s = clone(base);
      s.vinyl.enabled = true;
      s.rain = { enabled: true, density: 0.35, speed: 0.5, opacity: 0.16 };
      s.dust = { enabled: true, density: 0.3, speed: 0.3, opacity: 0.2 };
      s.grain = { enabled: true, intensity: 0.07 };
      s.flicker = { enabled: true, intensity: 0.03, speed: 0.35 };
      s.visualizer = {
        enabled: true,
        type: "waveform",
        position: "bottom-center",
        opacity: 0.3,
        size: 0.5,
        sensitivity: 1,
        orientation: "vertical",
      };
      s.camera = { move: "zoom-out", amount: 0.03, driftX: 0.1, driftY: 0.1 };
      return s;
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Artwork first, almost nothing else",
    apply: (base) => {
      const s = clone(base);
      s.vinyl.enabled = true;
      s.rain.enabled = false;
      s.dust.enabled = false;
      s.grain = { enabled: true, intensity: 0.04 };
      s.flicker = { enabled: false, intensity: 0.02, speed: 0.3 };
      s.visualizer.enabled = false;
      s.background.vignette = 0.25;
      s.camera = { move: "zoom-in", amount: 0.02, driftX: 0, driftY: 0 };
      return s;
    },
  },
];

/* ── Typography presets ───────────────────────────────────────────────────── */

export interface TypographyPreset {
  id: string;
  name: string;
  description: string;
  apply: (s: Settings) => Settings;
}

export const typographyPresets: TypographyPreset[] = [
  {
    id: "berlin-editorial",
    name: "Berlin Editorial",
    description: "Large, centered, bold, tight tracking",
    apply: (base) => {
      const s = clone(base);
      s.text = {
        ...s.text,
        enabled: true,
        fontFamily: "Space Grotesk",
        titleWeight: 700,
        subtitleWeight: 400,
        fontSize: 7,
        titleLetterSpacing: -0.01,
        subtitleSize: 2,
        subtitleLetterSpacing: 0.02,
        positionH: "center",
        positionV: "center",
        textAlignment: "center",
        lineHeight: 1.2,
        titleColor: "#F5E6C8",
        titleOpacity: 0.92,
        subtitleColor: "#F5E6C8",
        subtitleOpacity: 0.6,
        shadowEnabled: true,
        shadowOpacity: 0.4,
        shadowBlur: 0.25,
        shadowOffsetX: 0,
        shadowOffsetY: 0.03,
        strokeEnabled: false,
      };
      return s;
    },
  },
  {
    id: "underground-tape",
    name: "Underground Tape",
    description: "Bold condensed, analog label aesthetic",
    apply: (base) => {
      const s = clone(base);
      s.text = {
        ...s.text,
        enabled: true,
        fontFamily: "Oswald",
        titleWeight: 700,
        subtitleWeight: 400,
        fontSize: 7.5,
        titleLetterSpacing: 0.04,
        subtitleSize: 2,
        subtitleLetterSpacing: 0.06,
        positionH: "center",
        positionV: "center",
        textAlignment: "center",
        lineHeight: 1.25,
        titleColor: "#F0E8D0",
        titleOpacity: 0.92,
        subtitleColor: "#F0E8D0",
        subtitleOpacity: 0.55,
        shadowEnabled: true,
        shadowOpacity: 0.5,
        shadowBlur: 0.2,
        shadowOffsetX: 0,
        shadowOffsetY: 0.04,
        strokeEnabled: false,
      };
      return s;
    },
  },
  {
    id: "minimal-studio",
    name: "Minimal Studio",
    description: "Clean, medium weight, understated",
    apply: (base) => {
      const s = clone(base);
      s.text = {
        ...s.text,
        enabled: true,
        fontFamily: "Inter",
        titleWeight: 500,
        subtitleWeight: 300,
        fontSize: 4.5,
        titleLetterSpacing: 0.02,
        subtitleSize: 1.8,
        subtitleLetterSpacing: 0.03,
        positionH: "center",
        positionV: "center",
        textAlignment: "center",
        lineHeight: 1.35,
        titleColor: "#FFFFFF",
        titleOpacity: 0.85,
        subtitleColor: "#FFFFFF",
        subtitleOpacity: 0.5,
        shadowEnabled: false,
        shadowOpacity: 0,
        shadowBlur: 0,
        strokeEnabled: false,
      };
      return s;
    },
  },
  {
    id: "b-tapes-hero",
    name: "B Tapes Hero",
    description: "Very large centered, extra bold, strong presence",
    apply: (base) => {
      const s = clone(base);
      s.text = {
        ...s.text,
        enabled: true,
        title: "BERLIN B TAPES",
        subtitle: "Late Night in Berlin",
        showSubtitle: true,
        fontFamily: "Bebas Neue",
        titleWeight: 400,
        subtitleWeight: 300,
        fontSize: 10,
        titleLetterSpacing: 0.06,
        subtitleSize: 2.5,
        subtitleLetterSpacing: 0.08,
        positionH: "center",
        positionV: "center",
        textAlignment: "center",
        lineHeight: 1.2,
        titleColor: "#F5E6C8",
        titleOpacity: 0.95,
        subtitleColor: "#F5E6C8",
        subtitleOpacity: 0.6,
        shadowEnabled: true,
        shadowOpacity: 0.5,
        shadowBlur: 0.3,
        shadowOffsetX: 0,
        shadowOffsetY: 0.04,
        strokeEnabled: false,
      };
      return s;
    },
  },
];
