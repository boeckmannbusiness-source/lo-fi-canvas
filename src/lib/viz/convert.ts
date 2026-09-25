/**
 * Browser-only "existing video → TikTok-compatible MP4" converter.
 *
 * It reuses the decoded source frames and audio instead of rendering the
 * visualizer:
 *
 *   source file → decode (video element + Web Audio)
 *                → VideoEncoder(H.264) + AudioEncoder(AAC-LC)
 *                → mp4-muxer (avc + aac, fast start)
 *
 * The visualizer export in `export.ts` is intentionally untouched: this module
 * duplicates the tiny amount of encoder plumbing it needs so a regression here
 * can never affect the working export.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import {
  assessCompatibility,
  avcCodecStrings,
  deriveOutputName,
  plannedAudioSampleCount,
  plannedFrameCount,
  plannedFrameTimestamp,
  TIKTOK_AUDIO_BITRATE,
  TIKTOK_AUDIO_CODEC,
  TIKTOK_AUDIO_SAMPLE_RATE,
  type CompatibilityReport,
} from "./compat";
import { inspectMedia, type MediaInfo } from "./mp4-inspect";

export interface ConverterSupport {
  supported: boolean;
  reason: string | null;
}

const DEFAULT_FPS = 30;
const MIN_FPS = 1;
const MAX_FPS = 120;
/** Downscale only if the browser cannot encode the native size. */
const FALLBACK_MAX_DIMENSION = 1920;
const AUDIO_CHUNK_FRAMES = 4096;
const SEEK_TIMEOUT_MS = 20_000;

export function isConverterSupported(): ConverterSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "The converter runs only in the browser." };
  }
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
    return {
      supported: false,
      reason: "This browser has no WebCodecs. Use the latest Chrome or Edge on desktop.",
    };
  }
  if (typeof OffscreenCanvas === "undefined" && typeof document === "undefined") {
    return { supported: false, reason: "This browser cannot decode video frames." };
  }
  if (typeof HTMLVideoElement === "undefined") {
    return { supported: false, reason: "This browser cannot decode video files." };
  }
  return { supported: true, reason: null };
}

export interface AnalyzeResult {
  info: MediaInfo;
  report: CompatibilityReport;
  /** Real display size after any rotation metadata has been applied. */
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  hasAudio: boolean;
  /** From the decoded audio buffer when available, else the parser. */
  audioSampleRate: number | null;
  audioChannels: number | null;
}

/**
 * Inspect a file without converting it: container/codec analysis plus the real
 * display dimensions and duration from the browser's own decoder. The audio is
 * decoded once so `hasAudio` is accurate even for containers the box parser
 * does not understand (e.g. WebM).
 */
export async function analyzeVideoFile(file: File): Promise<AnalyzeResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectMedia(bytes);
  // decodeAudioData detaches the buffer, so inspect before this call.
  const decodedAudio = await decodeSourceAudio(bytes.buffer as ArrayBuffer);

  const meta = await withVideoElement(file, null, (video) => ({
    width: video.videoWidth || info.video?.width || 0,
    height: video.videoHeight || info.video?.height || 0,
    durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
  })).catch(() => null);

  const width = meta?.width && meta.width > 0 ? meta.width : (info.video?.width ?? 0);
  const height = meta?.height && meta.height > 0 ? meta.height : (info.video?.height ?? 0);
  const durationSeconds =
    meta?.durationSeconds && meta.durationSeconds > 0
      ? meta.durationSeconds
      : (info.durationSeconds ?? 0);
  const audioSampleRate = decodedAudio?.sampleRate ?? info.audio?.sampleRate ?? null;
  const audioChannels = decodedAudio?.numberOfChannels ?? info.audio?.channels ?? null;
  const report = assessCompatibility(info, {
    hasAudio: decodedAudio !== null,
    audioSampleRate,
    audioChannels,
  });

  return {
    info,
    report,
    width,
    height,
    durationSeconds,
    fps: normalizeFps(info.video?.fps),
    hasAudio: decodedAudio !== null,
    audioSampleRate,
    audioChannels,
  };
}

export interface ConvertOptions {
  onProgress?: (progress: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface ConvertResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  hasAudio: boolean;
  /** Set if the source had audio that could not be decoded. */
  audioWarning: string | null;
  /** True when the native resolution had to be reduced to stay encodable. */
  scaled: boolean;
  videoCodec: string;
}

function normalizeFps(value: number | null | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_FPS;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(value * 1000) / 1000));
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/** Wait for an element event, resolving early if it already happened. */
function waitForEvent(target: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
      clearTimeout(timer);
    };
    const onEvent = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("The video could not be decoded by this browser."));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out waiting for the video (${event}).`));
    }, timeoutMs);
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

/**
 * Load a file into a detached `<video>` and hand it to `run`, always releasing
 * the element and object URL afterwards.
 */
async function withVideoElement<T>(
  file: File,
  signal: AbortSignal | null | undefined,
  run: (video: HTMLVideoElement) => Promise<T> | T,
): Promise<T> {
  if (signal?.aborted) throw new DOMException("Conversion cancelled", "AbortError");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = url;
  try {
    await waitForEvent(video, "loadedmetadata", SEEK_TIMEOUT_MS);
    return await run(video);
  } finally {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (video.readyState < 2) await waitForEvent(video, "loadeddata", SEEK_TIMEOUT_MS);
  const target = Math.max(0, time);
  if (Math.abs(video.currentTime - target) <= 1e-3 && video.readyState >= 2) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      clearTimeout(timer);
    };
    const onSeeked = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("The video could not be decoded while seeking."));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Timed out while seeking the video."));
    }, SEEK_TIMEOUT_MS);
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try {
      video.currentTime = target;
    } catch {
      onError();
    }
  });
}

/** `VideoEncoder.isConfigSupported` probe across the profile/level list. */
async function pickVideoCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<{ codec: string; muxer: "avc" } | null> {
  for (const codec of avcCodecStrings(width, height, fps)) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        avc: { format: "avc" },
      });
      if (result.supported) return { codec, muxer: "avc" };
    } catch {
      /* try the next profile */
    }
  }
  return null;
}

/** Real AAC-LC probe — `isConfigSupported` is optimistic in some browsers. */
async function probeAac(sampleRate: number, channels: number): Promise<boolean> {
  try {
    let failed = false;
    let chunks = 0;
    const encoder = new AudioEncoder({
      output: () => {
        chunks++;
      },
      error: () => {
        failed = true;
      },
    });
    encoder.configure({
      codec: TIKTOK_AUDIO_CODEC,
      sampleRate,
      numberOfChannels: channels,
      bitrate: TIKTOK_AUDIO_BITRATE,
    });
    const n = 8192;
    const samples = new Float32Array(n * channels);
    for (let i = 0; i < n; i++) {
      const value = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
      for (let c = 0; c < channels; c++) samples[c * n + i] = value;
    }
    const data = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: channels,
      timestamp: 0,
      data: samples,
    });
    encoder.encode(data);
    data.close();
    await encoder.flush();
    encoder.close();
    return !failed && chunks > 0;
  } catch {
    return false;
  }
}

async function decodeSourceAudio(buffer: ArrayBuffer): Promise<AudioBuffer | null> {
  try {
    const context = new AudioContext();
    try {
      return await context.decodeAudioData(buffer);
    } finally {
      await context.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

/**
 * Resample to 48 kHz and mix down to at most two channels using the browser's
 * own resampler. Falls back to the source buffer when the API is unavailable.
 */
async function toTargetAudio(buffer: AudioBuffer): Promise<AudioBuffer> {
  const channels = Math.min(2, buffer.numberOfChannels);
  if (buffer.sampleRate === TIKTOK_AUDIO_SAMPLE_RATE && buffer.numberOfChannels <= 2) {
    return buffer;
  }
  if (typeof OfflineAudioContext === "undefined") return buffer;
  try {
    const length = Math.max(1, Math.round(buffer.duration * TIKTOK_AUDIO_SAMPLE_RATE));
    const context = new OfflineAudioContext(channels, length, TIKTOK_AUDIO_SAMPLE_RATE);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
    return await context.startRendering();
  } catch {
    return buffer;
  }
}

/** Wait until an encoder's queue drains below `limit`, using dequeue events. */
function waitForQueue(
  encoder: {
    encodeQueueSize: number;
    addEventListener: EventTarget["addEventListener"];
    removeEventListener: EventTarget["removeEventListener"];
  },
  limit: number,
): Promise<void> {
  if (encoder.encodeQueueSize <= limit) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      encoder.removeEventListener("dequeue", onDequeue);
      resolve();
    };
    const onDequeue = () => {
      if (encoder.encodeQueueSize <= limit) finish();
    };
    encoder.addEventListener("dequeue", onDequeue);
    const poll = () => {
      if (done) return;
      if (encoder.encodeQueueSize <= limit) finish();
      else setTimeout(poll, 8);
    };
    setTimeout(poll, 8);
  });
}

/**
 * Convert a video file into the same technical target as the working export.
 * The frames and audio come from the source; nothing is re-composed.
 */
export async function convertVideoToTikTok(
  file: File,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const { onProgress, signal } = options;
  const support = isConverterSupported();
  if (!support.supported) throw new Error(support.reason ?? "Conversion is not supported.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectMedia(bytes);

  onProgress?.(0.01, "Reading source");

  // Always try to decode audio: the box parser cannot read WebM audio tracks.
  // decodeAudioData detaches the buffer, so this must run after inspection.
  const decodedAudio = await decodeSourceAudio(bytes.buffer as ArrayBuffer);
  const audioWarning =
    info.audio && !decodedAudio
      ? "The source audio could not be decoded by this browser; the MP4 will be video-only."
      : null;

  return withVideoElement(file, signal, async (video) => {
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("This file has no decodable video track.");
    }
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) throw new Error("This video reports no usable duration.");

    const fps = normalizeFps(info.video?.fps);
    const totalFrames = plannedFrameCount(duration, fps);

    // Native output size first; only scale down if the browser cannot encode it.
    let width = even(video.videoWidth);
    let height = even(video.videoHeight);
    let bitrate = Math.round(
      Math.min(20_000_000, Math.max(4_000_000, width * height * fps * 0.12)),
    );
    let videoCodec = await pickVideoCodec(width, height, fps, bitrate);
    let scaled = false;
    if (!videoCodec) {
      const scale = Math.min(1, FALLBACK_MAX_DIMENSION / Math.max(width, height));
      if (scale < 1) {
        width = even(width * scale);
        height = even(height * scale);
        bitrate = Math.round(
          Math.min(20_000_000, Math.max(4_000_000, width * height * fps * 0.12)),
        );
        videoCodec = await pickVideoCodec(width, height, fps, bitrate);
        scaled = true;
      }
    }
    if (!videoCodec) {
      throw new Error(
        "This browser cannot encode H.264 video, which is required for a TikTok-compatible MP4. Use the latest Chrome or Edge on desktop.",
      );
    }

    let surface: OffscreenCanvas | HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    if (typeof OffscreenCanvas !== "undefined") {
      const offscreen = new OffscreenCanvas(width, height);
      surface = offscreen;
      ctx = offscreen.getContext("2d", { alpha: false }) as CanvasRenderingContext2D | null;
    } else {
      const element = document.createElement("canvas");
      element.width = width;
      element.height = height;
      surface = element;
      ctx = element.getContext("2d", { alpha: false });
    }
    if (!ctx) throw new Error("This browser could not create a drawing surface.");

    const targetAudio = decodedAudio ? await toTargetAudio(decodedAudio) : null;
    const channels = targetAudio ? Math.min(2, targetAudio.numberOfChannels) : 0;
    const hasAudio = targetAudio !== null && (await probeAac(targetAudio.sampleRate, channels));
    if (targetAudio && !hasAudio) {
      throw new Error(
        "This browser cannot encode AAC audio, which is required for a TikTok-compatible MP4. Use the latest Chrome or Edge on desktop.",
      );
    }

    onProgress?.(0.04, "Preparing encoders");

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      firstTimestampBehavior: "cross-track-offset",
      fastStart: {
        expectedVideoChunks: totalFrames,
        expectedAudioChunks: hasAudio
          ? Math.ceil(
              Math.min(targetAudio!.length, Math.ceil(duration * targetAudio!.sampleRate)) / 960,
            ) + 8
          : 0,
      },
      video: { codec: videoCodec.muxer, width, height },
      ...(hasAudio
        ? {
            audio: {
              codec: "aac" as const,
              sampleRate: targetAudio!.sampleRate,
              numberOfChannels: channels,
            },
          }
        : {}),
    });

    let encoderError: Error | null = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        encoderError = error as Error;
      },
    });
    videoEncoder.configure({
      codec: videoCodec.codec,
      width,
      height,
      bitrate,
      framerate: fps,
      avc: { format: "avc" },
    });

    // Audio first (small payload), matching the working export's ordering.
    if (hasAudio) {
      onProgress?.(0.06, "Encoding audio");
      await encodeAudioTrack(muxer, targetAudio!, duration, signal);
    }

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (encoderError) throw encoderError;
        if (signal?.aborted) throw new DOMException("Conversion cancelled", "AbortError");

        const time = i / fps;
        // Keep the sample on the last decodable frame even for odd durations.
        await seekTo(video, Math.min(time, Math.max(0, duration - 1 / (fps * 2))));
        ctx.drawImage(video, 0, 0, width, height);

        await waitForQueue(videoEncoder, 2);
        if (encoderError) throw encoderError;

        const frame = new VideoFrame(surface, {
          timestamp: plannedFrameTimestamp(i, fps),
          duration: Math.round(1_000_000 / fps),
        });
        try {
          videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        } finally {
          frame.close();
        }

        if (i % 3 === 0) {
          onProgress?.(0.08 + (i / totalFrames) * 0.88, "Encoding video");
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      await videoEncoder.flush();
      if (encoderError) throw encoderError;
    } finally {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    }

    onProgress?.(0.985, "Finalizing MP4");
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: "video/mp4" });
    (target as unknown as { buffer: ArrayBuffer | null }).buffer = null;
    onProgress?.(1, "Done");

    return {
      blob,
      filename: deriveOutputName(file.name),
      width,
      height,
      fps,
      durationSeconds: duration,
      hasAudio,
      audioWarning,
      scaled,
      videoCodec: videoCodec.codec,
    };
  });
}

async function encodeAudioTrack(
  muxer: Muxer<ArrayBufferTarget>,
  buffer: AudioBuffer,
  duration: number,
  signal?: AbortSignal,
): Promise<void> {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  let audioError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (error) => {
      audioError = error as Error;
    },
  });
  encoder.configure({
    codec: TIKTOK_AUDIO_CODEC,
    sampleRate,
    numberOfChannels: channels,
    bitrate: TIKTOK_AUDIO_BITRATE,
  });

  const total = Math.min(buffer.length, plannedAudioSampleCount(duration, sampleRate));
  const scratch = new Float32Array(AUDIO_CHUNK_FRAMES * channels);
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

  try {
    for (let offset = 0; offset < total; offset += AUDIO_CHUNK_FRAMES) {
      if (audioError) throw audioError;
      if (signal?.aborted) throw new DOMException("Conversion cancelled", "AbortError");
      const n = Math.min(AUDIO_CHUNK_FRAMES, total - offset);
      for (let c = 0; c < channels; c++) {
        scratch.set(channelData[c]!.subarray(offset, offset + n), c * n);
      }
      const data = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: scratch.subarray(0, n * channels),
      });
      try {
        encoder.encode(data);
      } finally {
        data.close();
      }
      await waitForQueue(encoder, 8);
    }
    await encoder.flush();
    if (audioError) throw audioError;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}
