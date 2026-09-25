/**
 * Pure decision logic for the "Existing Video → TikTok" converter.
 *
 * Everything here is deterministic and browser-free so the policy (is the file
 * already compatible? which tracks must be encoded? which H.264 level fits?)
 * can be unit-tested without WebCodecs or a real file.
 */
import type { AudioTrackInfo, MediaInfo, VideoTrackInfo } from "./mp4-inspect";

/** Platform target that the working visualizer export already produces. */
export const TIKTOK_AUDIO_SAMPLE_RATE = 48_000;
export const TIKTOK_AUDIO_CODEC = "mp4a.40.2";
export const TIKTOK_AUDIO_BITRATE = 192_000;
export const TIKTOK_MAX_AUDIO_CHANNELS = 2;

/** H.264 profiles tried in order: quality first, then compatibility. */
export const AVC_PROFILES = [
  { name: "High", profile: 0x64, constraint: 0x00 },
  { name: "Main", profile: 0x4d, constraint: 0x40 },
  { name: "Constrained Baseline", profile: 0x42, constraint: 0xe0 },
] as const;

interface H264Level {
  /** e.g. 4.0 */
  level: number;
  /** Max frame size in macroblocks. */
  maxFrameMacroblocks: number;
  /** Max macroblocks per second. */
  maxMacroblocksPerSecond: number;
}

/**
 * H.264 level limits (Table A-1, frame size / macroblock rate columns). The
 * level code in a codec string is `round(level * 10)` in hex.
 */
const H264_LEVELS: H264Level[] = [
  { level: 1.0, maxFrameMacroblocks: 99, maxMacroblocksPerSecond: 1_485 },
  { level: 1.1, maxFrameMacroblocks: 396, maxMacroblocksPerSecond: 3_000 },
  { level: 1.2, maxFrameMacroblocks: 396, maxMacroblocksPerSecond: 6_000 },
  { level: 1.3, maxFrameMacroblocks: 396, maxMacroblocksPerSecond: 11_880 },
  { level: 2.0, maxFrameMacroblocks: 396, maxMacroblocksPerSecond: 11_880 },
  { level: 2.1, maxFrameMacroblocks: 792, maxMacroblocksPerSecond: 19_800 },
  { level: 2.2, maxFrameMacroblocks: 1_620, maxMacroblocksPerSecond: 20_250 },
  { level: 3.0, maxFrameMacroblocks: 1_620, maxMacroblocksPerSecond: 40_500 },
  { level: 3.1, maxFrameMacroblocks: 3_600, maxMacroblocksPerSecond: 108_000 },
  { level: 3.2, maxFrameMacroblocks: 5_120, maxMacroblocksPerSecond: 216_000 },
  { level: 4.0, maxFrameMacroblocks: 8_192, maxMacroblocksPerSecond: 245_760 },
  { level: 4.1, maxFrameMacroblocks: 8_192, maxMacroblocksPerSecond: 245_760 },
  { level: 4.2, maxFrameMacroblocks: 8_704, maxMacroblocksPerSecond: 522_240 },
  { level: 5.0, maxFrameMacroblocks: 22_080, maxMacroblocksPerSecond: 589_824 },
  { level: 5.1, maxFrameMacroblocks: 36_864, maxMacroblocksPerSecond: 983_040 },
  { level: 5.2, maxFrameMacroblocks: 36_864, maxMacroblocksPerSecond: 2_073_600 },
  { level: 6.0, maxFrameMacroblocks: 139_264, maxMacroblocksPerSecond: 4_177_920 },
  { level: 6.1, maxFrameMacroblocks: 139_264, maxMacroblocksPerSecond: 8_355_840 },
  { level: 6.2, maxFrameMacroblocks: 139_264, maxMacroblocksPerSecond: 16_711_680 },
];

/** Smallest H.264 level (as a codec-string level byte, e.g. 0x28 = 4.0) that
 * can carry `width × height @ fps`. Falls back to the highest known level. */
export function avcLevelFor(width: number, height: number, fps: number): number {
  const macroblocks = Math.ceil(Math.max(1, width) / 16) * Math.ceil(Math.max(1, height) / 16);
  const rate = macroblocks * Math.max(1, fps);
  for (const entry of H264_LEVELS) {
    if (entry.maxFrameMacroblocks >= macroblocks && entry.maxMacroblocksPerSecond >= rate) {
      return Math.round(entry.level * 10);
    }
  }
  const top = H264_LEVELS[H264_LEVELS.length - 1]!;
  return Math.round(top.level * 10);
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

/** The `avc1.*` codec strings to try, best profile first, for a given size/fps. */
export function avcCodecStrings(width: number, height: number, fps: number): string[] {
  const level = hex2(avcLevelFor(width, height, fps));
  return AVC_PROFILES.map((p) => `avc1.${hex2(p.profile)}${hex2(p.constraint)}${level}`);
}

export interface ConverterActions {
  video: "keep" | "encode";
  audio: "keep" | "encode" | "none";
}

export interface CompatibilityReport {
  compatible: boolean;
  actions: ConverterActions;
  /** Short "before → after" description for the UI. */
  summary: string;
  /** Human-readable mismatches that force a conversion. */
  reasons: string[];
  /** Things already inside the target (shown as affirmations). */
  affirmations: string[];
  /** Extra honesty about what the conversion does to an H.264 source. */
  videoNote: string | null;
}

export function videoCodecLabel(codec: VideoTrackInfo["codec"] | undefined): string {
  switch (codec) {
    case "h264":
      return "H.264";
    case "hevc":
      return "HEVC/H.265";
    case "vp9":
      return "VP9";
    case "av1":
      return "AV1";
    case "mpeg4":
      return "MPEG-4";
    default:
      return "Unknown";
  }
}

export function audioCodecLabel(codec: AudioTrackInfo["codec"] | undefined): string {
  switch (codec) {
    case "aac":
      return "AAC";
    case "opus":
      return "Opus";
    case "mp3":
      return "MP3";
    case "ac3":
      return "AC-3";
    case "eac3":
      return "E-AC-3";
    case "flac":
      return "FLAC";
    case "pcm":
      return "PCM";
    default:
      return "Unknown";
  }
}

/**
 * Extra facts the box parser cannot supply for a container it does not read
 * (e.g. a WebM audio track). Only used to fill gaps — parsed data wins.
 */
export interface CompatibilityHints {
  hasAudio?: boolean;
  audioSampleRate?: number | null;
  audioChannels?: number | null;
}

/**
 * Decide whether a file is already inside the TikTok target and, if not,
 * which tracks must be re-encoded. An "already compatible" verdict requires
 * every target property to hold, including fast start.
 */
export function assessCompatibility(
  info: MediaInfo,
  hints: CompatibilityHints = {},
): CompatibilityReport {
  const reasons: string[] = [];
  const affirmations: string[] = [];

  const video = info.video;
  const audio: AudioTrackInfo | null =
    info.audio ??
    (hints.hasAudio
      ? {
          codec: "unknown",
          fourcc: "",
          sampleRate: hints.audioSampleRate ?? null,
          channels: hints.audioChannels ?? null,
        }
      : null);

  if (info.container === "mp4") {
    affirmations.push("MP4 container");
  } else if (info.container === "webm") {
    reasons.push("Container is WebM, not MP4");
  } else {
    reasons.push("Container could not be identified as MP4");
  }

  if (info.fastStart) {
    affirmations.push("Fast start (moov before mdat)");
  } else {
    reasons.push("Not fast start (moov atom after mdat)");
  }

  let videoOk = false;
  if (video) {
    const is8Bit = video.bitDepth === null || video.bitDepth === 8;
    if (video.codec === "h264" && is8Bit) {
      videoOk = true;
      affirmations.push("H.264 8-bit video");
    } else if (video.codec === "h264") {
      reasons.push("H.264 is 10-bit / high-chroma, re-encoding to 8-bit 4:2:0");
    } else {
      reasons.push(`Video is ${videoCodecLabel(video.codec)}, re-encoding to H.264`);
    }
  } else if (info.container === "webm") {
    reasons.push("WebM video, re-encoding to H.264");
  } else {
    reasons.push("No video track detected, assuming H.264 re-encode");
  }

  let audioOk = true;
  const hasAudio = audio !== null;
  if (audio) {
    const rateOk = audio.sampleRate === null || audio.sampleRate === TIKTOK_AUDIO_SAMPLE_RATE;
    const channelsOk = audio.channels === null || audio.channels <= TIKTOK_MAX_AUDIO_CHANNELS;
    if (audio.codec === "aac" && rateOk && channelsOk) {
      affirmations.push("AAC-LC audio at 48 kHz");
    } else {
      audioOk = false;
      if (audio.codec !== "aac") {
        reasons.push(
          audio.codec === "unknown"
            ? "Audio codec is not AAC, re-encoding to AAC-LC"
            : `Audio is ${audioCodecLabel(audio.codec)}, re-encoding to AAC-LC`,
        );
      }
      if (!rateOk && audio.sampleRate !== null) {
        reasons.push(`Audio is ${audio.sampleRate} Hz, resampling to 48000 Hz`);
      }
      if (!channelsOk && audio.channels !== null) {
        reasons.push(`Audio has ${audio.channels} channels, downmixing to stereo`);
      }
    }
  } else {
    affirmations.push("No audio track");
  }

  const compatible = info.container === "mp4" && info.fastStart && videoOk && audioOk;

  const videoLabel = video
    ? videoCodecLabel(video.codec)
    : info.container === "webm"
      ? "WebM"
      : "No video";
  const audioLabel = audio
    ? audio.codec === "unknown"
      ? "audio"
      : audioCodecLabel(audio.codec)
    : "No audio";
  const summary = compatible
    ? `${videoLabel} + ${audioLabel} is already within the TikTok target`
    : `${videoLabel} + ${audioLabel} → H.264 + AAC`;

  return {
    compatible,
    // The converter always re-encodes video when a conversion runs: true
    // stream copy would need an MP4 demuxer (see module docs).
    actions: {
      video: compatible ? "keep" : "encode",
      audio: compatible ? "keep" : hasAudio ? "encode" : "none",
    },
    summary,
    reasons,
    affirmations,
    videoNote:
      !compatible && videoOk
        ? "Video is already H.264; it is re-encoded at high quality because in-browser stream copy requires a demuxer."
        : null,
  };
}

/**
 * `my video.mp4` → `my video-tiktok.mp4`; never empty.
 */
export function deriveOutputName(name: string): string {
  const trimmed = (name || "").trim();
  const base = trimmed.replace(/\.[^./\\]+$/, "").trim() || "video";
  return `${base}-tiktok.mp4`;
}

/* ── Deterministic timeline planning (unit-testable A/V sync contract) ────── */

/** Number of video frames for a duration at a frame rate (at least one). */
export function plannedFrameCount(durationSeconds: number, fps: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;
  if (!Number.isFinite(fps) || fps <= 0) return 1;
  return Math.max(1, Math.round(durationSeconds * fps));
}

/** Presentation timestamp of frame `index` in microseconds. */
export function plannedFrameTimestamp(index: number, fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  return Math.round((index * 1_000_000) / fps);
}

/** Number of audio samples to encode for a duration at a sample rate. */
export function plannedAudioSampleCount(durationSeconds: number, sampleRate: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return 0;
  return Math.ceil(durationSeconds * sampleRate);
}
