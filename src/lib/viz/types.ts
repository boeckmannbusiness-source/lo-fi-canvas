export type BackgroundFit = "cover" | "contain" | "fill";
export type VinylPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "custom";
export type TapePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
export type VisualizerType = "waveform" | "spectrum" | "bars";
export type VisualizerPosition = "bottom-center" | "bottom-left" | "bottom-right";
export type TextPosition = "top-left" | "top-center" | "bottom-left" | "center";
export type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CameraMove = "zoom-in" | "zoom-out" | "none";

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
    size: number;
    opacity: number;
    motion: number;
    audioReactive: boolean;
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
  };
  text: {
    enabled: boolean;
    title: string;
    subtitle: string;
    position: TextPosition;
    fontSize: number;
    opacity: number;
    color: string;
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
}

export const SILENT_FRAME: AudioFrame = {
  rms: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  spectrum: new Float32Array(64),
  waveform: new Float32Array(256),
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
    size: 0.28,
    opacity: 0.88,
    motion: 0.45,
    audioReactive: true,
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
  },
  text: {
    enabled: false,
    title: "MIDNIGHT TOKYO",
    subtitle: "lo-fi beats for late nights",
    position: "top-left",
    fontSize: 0.5,
    opacity: 0.85,
    color: "#F5E6C8",
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
