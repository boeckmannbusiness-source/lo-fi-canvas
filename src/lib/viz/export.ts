import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { frameAt, type AudioAnalysis } from "./analysis";
import { renderScene } from "./scene";
import type { Settings } from "./types";

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  settings: Settings;
  image: CanvasImageSource | null;
  imageWidth: number;
  imageHeight: number;
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
    fastStart: "in-memory",
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

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false })!;

  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) throw encoderError;
    if (signal?.aborted) {
      videoEncoder.close();
      throw new DOMException("Export cancelled", "AbortError");
    }
    const time = i / fps;
    renderScene({
      ctx,
      width,
      height,
      time,
      duration,
      audio: frameAt(opts.analysis, time),
      settings: opts.settings,
      image: opts.image,
      imageWidth: opts.imageWidth,
      imageHeight: opts.imageHeight,
      scale: height / 1080,
    });
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    if (videoEncoder.encodeQueueSize > 8) {
      await new Promise<void>((resolve) => {
        const check = () =>
          videoEncoder.encodeQueueSize > 4
            ? setTimeout(check, 4)
            : resolve();
        check();
      });
    }
    if (i % 5 === 0) {
      opts.onProgress?.((i / totalFrames) * 0.92, "Rendering video");
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await videoEncoder.flush();
  videoEncoder.close();

  if (hasAudio) {
    opts.onProgress?.(0.94, "Encoding audio");
    await encodeAudio(muxer, opts.audioBuffer!, duration, signal);
  }

  opts.onProgress?.(0.99, "Finalizing MP4");
  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

async function encodeAudio(
  muxer: Muxer<ArrayBufferTarget>,
  buffer: AudioBuffer,
  duration: number,
  signal?: AbortSignal,
) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels: channels,
    bitrate: 192_000,
  });

  const total = Math.min(buffer.length, Math.ceil(duration * sampleRate));
  const chunkFrames = 4096;
  const data = new Float32Array(chunkFrames * channels);
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));

  for (let offset = 0; offset < total; offset += chunkFrames) {
    if (signal?.aborted) {
      encoder.close();
      throw new DOMException("Export cancelled", "AbortError");
    }
    const n = Math.min(chunkFrames, total - offset);
    for (let c = 0; c < channels; c++) {
      data.set(chans[c]!.subarray(offset, offset + n), c * n);
    }
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: channels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: data.slice(0, n * channels),
    });
    encoder.encode(audioData);
    audioData.close();
    if (encoder.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 4));
  }
  await encoder.flush();
  encoder.close();
}
