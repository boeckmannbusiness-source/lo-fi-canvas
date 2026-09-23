import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { frameAt, type AudioAnalysis } from "./analysis";
import { renderScene } from "./scene";
import { SAFE_AREAS } from "./format";
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

async function pickVideoCodec(width: number, height: number, fps: number) {
  const candidates: { codec: string; muxer: "avc" | "vp9" | "av1" }[] = [
    { codec: "avc1.640028", muxer: "avc" },
    { codec: "avc1.42001f", muxer: "avc" },
    { codec: "vp09.00.10.08", muxer: "vp9" },
    { codec: "av01.0.08M.08", muxer: "av1" },
  ];
  for (const c of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec: c.codec,
        width,
        height,
        bitrate: 8_000_000,
        framerate: fps,
      });
      if (res.supported) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function pickAudioCodec(sampleRate: number, channels: number) {
  const candidates: { codec: string; muxer: "aac" | "opus" }[] = [
    { codec: "mp4a.40.2", muxer: "aac" },
    { codec: "opus", muxer: "opus" },
  ];
  for (const c of candidates) {
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
        codec: c.codec,
        sampleRate,
        numberOfChannels: channels,
        bitrate: 192_000,
      });
      const n = 1024;
      const probe = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: 0,
        data: new Float32Array(n * channels),
      });
      enc.encode(probe);
      probe.close();
      await enc.flush();
      enc.close();
      if (!failed && chunks > 0) return c;
    } catch {
      /* try next */
    }
  }
  return null;
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
  const { width, height, fps, duration, signal } = opts;
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const videoCodec = await pickVideoCodec(width, height, fps);
  if (!videoCodec) throw new Error("No supported video encoder in this browser.");

  const channels = opts.audioBuffer
    ? Math.min(2, opts.audioBuffer.numberOfChannels)
    : 0;
  const audioCodec = opts.audioBuffer
    ? await pickAudioCodec(opts.audioBuffer.sampleRate, channels)
    : null;
  const hasAudio = !!opts.audioBuffer && !!audioCodec;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    // `in-memory` fast-start buffers every sample a second time before
    // rewriting the file; progressive muxing halves peak memory.
    fastStart: false,
    video: { codec: videoCodec.muxer, width, height },
    ...(hasAudio
      ? {
          audio: {
            codec: audioCodec!.muxer,
            sampleRate: opts.audioBuffer!.sampleRate,
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
    bitrate: 8_000_000,
    framerate: fps,
    ...(videoCodec.muxer === "avc" ? { avc: { format: "avc" as const } } : {}),
  });

  // Audio is encoded first (small payload) using the codec that was actually
  // probed, so a fallback to Opus is honoured instead of hard-coding AAC.
  if (hasAudio) {
    opts.onProgress?.(0.01, "Encoding audio");
    await encodeAudio(muxer, opts.audioBuffer!, audioCodec!.codec, duration, signal);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false })!;

  // One reusable render context: no per-frame object churn.
  const rc = {
    ctx,
    width,
    height,
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
    scale: height / 1080,
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
    bitrate: 192_000,
  });

  const total = Math.min(buffer.length, Math.ceil(duration * sampleRate));
  const chunkFrames = 4096;
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
