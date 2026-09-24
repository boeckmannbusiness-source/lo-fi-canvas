import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { frameAt, type AudioAnalysis } from "./analysis";
import { renderScene } from "./scene";
import { clampSeconds, safeAreaFor } from "./format";
import type { LayoutMode, SafeArea, Settings } from "./types";

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** hard cap enforced here, independent of any UI validation */
  maxDuration?: number | null;
  layout?: LayoutMode;
  safe?: SafeArea;
  bitrate?: number;
  settings: Settings;
  image: CanvasImageSource | null;
  imageWidth: number;
  imageHeight: number;
  logo: CanvasImageSource | null;
  logoWidth: number;
  logoHeight: number;
  analysis: AudioAnalysis | null;
  audioBuffer: AudioBuffer | null;
  signal?: AbortSignal;
  onProgress?: (p: number, stage: string) => void;
}

export function isExportSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "VideoEncoder" in window &&
    "AudioEncoder" in window &&
    typeof OffscreenCanvas !== "undefined"
  );
}

/**
 * Conservative H.264 (AVC) codec strings for a 1080×1920 / 30 fps target.
 *
 * Level 4.0 (`0x28`) is the *minimum* level that can carry 1080×1920 @ 30 fps:
 * 8160 macroblocks per frame (max 8192 at L4.0) at 30 fps = 244,800 MB/s
 * (max 245,760 at L4.0). The old Baseline L3.1 fallback tops out at 3600 MB /
 * 108,000 MB/s and cannot represent this frame, so it could never be selected.
 *
 * High → Main → Constrained Baseline keeps the current High-profile quality
 * first, then falls back to progressively more compatible — but still 8-bit
 * 4:2:0 (yuv420p by definition) — H.264 profiles. `muxer` is always `avc`, so
 * an `.mp4` can never end up holding VP9/AV1 video.
 */
const VIDEO_CODECS = [
  "avc1.640028", // H.264 High, Level 4.0
  "avc1.4D4028", // H.264 Main, Level 4.0
  "avc1.42E028", // H.264 Constrained Baseline, Level 4.0
] as const;

/** AAC-LC: the only audio codec platform ingest reliably accepts. No Opus. */
const AUDIO_CODEC = "mp4a.40.2";
/** Platform ingest expects 48 kHz; everything is resampled to this target. */
const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_BITRATE = 192_000;
const AUDIO_CHUNK_FRAMES = 4096;

async function pickVideoCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<{ codec: string; muxer: "avc" } | null> {
  for (const codec of VIDEO_CODECS) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        avc: { format: "avc" },
      });
      if (res.supported) return { codec, muxer: "avc" };
    } catch {
      /* try next */
    }
  }
  return null;
}

async function pickAudioCodec(
  sampleRate: number,
  channels: number,
): Promise<{ codec: string; muxer: "aac" } | null> {
  // isConfigSupported is optimistic in some browsers, so do a real probe.
  try {
    let failed = false;
    let chunks = 0;
    const enc = new AudioEncoder({
      output: () => {
        chunks++;
      },
      error: () => {
        failed = true;
      },
    });
    enc.configure({
      codec: AUDIO_CODEC,
      sampleRate,
      numberOfChannels: channels,
      bitrate: AUDIO_BITRATE,
    });
    // A 1024-frame silent probe makes Chrome's AAC encoder fail spuriously
    // ("Flushing error"), which used to force the Opus fallback. Feed a real
    // signal long enough to cover several AAC frames instead.
    const n = 8192;
    const samples = new Float32Array(n * channels);
    for (let i = 0; i < n; i++) {
      const value = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
      for (let c = 0; c < channels; c++) samples[c * n + i] = value;
    }
    const probe = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: channels,
      timestamp: 0,
      data: samples,
    });
    enc.encode(probe);
    probe.close();
    await enc.flush();
    enc.close();
    if (!failed && chunks > 0) return { codec: AUDIO_CODEC, muxer: "aac" };
  } catch {
    /* unsupported */
  }
  return null;
}

/**
 * Resample decoded audio to the platform target rate (48 kHz) using the
 * browser's own OfflineAudioContext. Falls back to the source rate when the
 * API (or a headless test harness) is unavailable so the export still runs.
 */
async function resampleAudio(
  buffer: AudioBuffer,
  targetRate: number,
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetRate) return buffer;
  if (typeof OfflineAudioContext === "undefined") return buffer;
  try {
    const channels = Math.min(2, buffer.numberOfChannels);
    const length = Math.max(
      1,
      Math.round((buffer.length / buffer.sampleRate) * targetRate),
    );
    const ctx = new OfflineAudioContext(channels, length, targetRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    return await ctx.startRendering();
  } catch {
    return buffer;
  }
}

/** Wait until an encoder's queue drains below `limit`, using dequeue events. */
function waitForQueue(
  enc: {
    encodeQueueSize: number;
    addEventListener: EventTarget["addEventListener"];
    removeEventListener: EventTarget["removeEventListener"];
  },
  limit: number,
): Promise<void> {
  if (enc.encodeQueueSize <= limit) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      enc.removeEventListener("dequeue", onDequeue);
      resolve();
    };
    const onDequeue = () => {
      if (enc.encodeQueueSize <= limit) finish();
    };
    enc.addEventListener("dequeue", onDequeue);
    // Safety net for engines that do not fire `dequeue`.
    const poll = () => {
      if (done) return;
      if (enc.encodeQueueSize <= limit) finish();
      else setTimeout(poll, 8);
    };
    setTimeout(poll, 8);
  });
}

/** Frame-by-frame offline render to an MP4 (H.264 + AAC when available). */
export async function renderVideo(opts: ExportOptions): Promise<Blob> {
  const { width, height, fps, signal } = opts;
  const layout: LayoutMode = opts.layout ?? (height > width ? "portrait" : "landscape");
  const safe = opts.safe ?? safeAreaFor(layout);
  const cap = opts.maxDuration ?? null;
  const duration = clampSeconds(opts.duration, cap);
  const bitrate = opts.bitrate ?? 8_000_000;
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const videoCodec = await pickVideoCodec(width, height, fps, bitrate);
  if (!videoCodec) {
    throw new Error(
      "This browser cannot encode H.264 video, which is required for a TikTok-compatible MP4. Use the latest Chrome or Edge on desktop.",
    );
  }

  const audioBuffer = opts.audioBuffer
    ? await resampleAudio(opts.audioBuffer, AUDIO_SAMPLE_RATE)
    : null;
  const channels = audioBuffer ? Math.min(2, audioBuffer.numberOfChannels) : 0;
  const audioCodec = audioBuffer
    ? await pickAudioCodec(audioBuffer.sampleRate, channels)
    : null;
  if (audioBuffer && !audioCodec) {
    throw new Error(
      "This browser cannot encode AAC audio, which is required for a TikTok-compatible MP4. Use the latest Chrome or Edge on desktop.",
    );
  }
  const hasAudio = !!audioBuffer && !!audioCodec;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    // Reserve space for the metadata up front so the `moov` atom lands before
    // `mdat` ("fast start") without the `in-memory` mode that buffers every
    // sample a second time. Overestimating is safe: the muxer pads the spare
    // bytes with a `free` atom. Video emits exactly one chunk per frame, while
    // AAC emits roughly one chunk per 1024 samples, so bound each track
    // separately (with a little margin) instead of guessing from frames.
    fastStart: {
      expectedVideoChunks: totalFrames,
      expectedAudioChunks: hasAudio
        ? Math.ceil(
            Math.min(
              audioBuffer!.length,
              Math.ceil(duration * audioBuffer!.sampleRate),
            ) / 960,
          ) + 8
        : 0,
    },
    video: { codec: videoCodec.muxer, width, height },
    ...(hasAudio
      ? {
          audio: {
            codec: audioCodec!.muxer,
            sampleRate: audioBuffer!.sampleRate,
            numberOfChannels: channels,
          },
        }
      : {}),
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e as Error;
    },
  });
  videoEncoder.configure({
    codec: videoCodec.codec,
    width,
    height,
    bitrate,
    framerate: fps,
    ...(videoCodec.muxer === "avc" ? { avc: { format: "avc" as const } } : {}),
  });

  // Audio is encoded first (small payload) using the codec that was actually
  // probed, so a fallback to Opus is honoured instead of hard-coding AAC.
  if (hasAudio) {
    opts.onProgress?.(0.01, "Encoding audio");
    await encodeAudio(muxer, audioBuffer!, audioCodec!.codec, duration, signal);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false })!;

  // One reusable render context: no per-frame object churn.
  const rc = {
    ctx,
    width,
    height,
    layout,
    safe,
    time: 0,
    duration,
    audio: frameAt(opts.analysis, 0),
    settings: opts.settings,
    image: opts.image,
    imageWidth: opts.imageWidth,
    imageHeight: opts.imageHeight,
    logo: opts.logo,
    logoWidth: opts.logoWidth,
    logoHeight: opts.logoHeight,
    scale: Math.min(width, height) / 1080,
  };

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (encoderError) throw encoderError;
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");

      const time = i / fps;
      rc.time = time;
      rc.audio = frameAt(opts.analysis, time);
      renderScene(rc);

      // Keep at most a couple of frames in flight: each 1080p frame is ~3 MB
      // of raw planar data, so an unbounded queue is what blows up memory.
      await waitForQueue(videoEncoder, 2);
      if (encoderError) throw encoderError;

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1_000_000) / fps),
        duration: Math.round(1_000_000 / fps),
      });
      try {
        videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      } finally {
        frame.close();
      }

      if (i % 3 === 0) {
        opts.onProgress?.(0.02 + (i / totalFrames) * 0.95, "Rendering video");
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    await videoEncoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    if (videoEncoder.state !== "closed") videoEncoder.close();
  }

  opts.onProgress?.(0.99, "Finalizing MP4");
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  // Drop the muxer's copy so only the Blob retains the payload.
  (target as unknown as { buffer: ArrayBuffer | null }).buffer = null;
  return blob;
}

async function encodeAudio(
  muxer: Muxer<ArrayBufferTarget>,
  buffer: AudioBuffer,
  codec: string,
  duration: number,
  signal?: AbortSignal,
) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  let audioError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      audioError = e as Error;
    },
  });
  encoder.configure({
    codec,
    sampleRate,
    numberOfChannels: channels,
    bitrate: AUDIO_BITRATE,
  });

  const total = Math.min(buffer.length, Math.ceil(duration * sampleRate));
  const chunkFrames = AUDIO_CHUNK_FRAMES;
  const scratch = new Float32Array(chunkFrames * channels);
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));

  try {
    for (let offset = 0; offset < total; offset += chunkFrames) {
      if (audioError) throw audioError;
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      const n = Math.min(chunkFrames, total - offset);
      for (let c = 0; c < channels; c++) {
        scratch.set(chans[c]!.subarray(offset, offset + n), c * n);
      }
      // AudioData copies the data, so a reused scratch view is safe here.
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: scratch.subarray(0, n * channels),
      });
      try {
        encoder.encode(audioData);
      } finally {
        audioData.close();
      }
      await waitForQueue(encoder, 8);
    }
    await encoder.flush();
    if (audioError) throw audioError;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}
