/**
 * Browser harness for a *real* existing-video → TikTok conversion.
 *
 * Loaded by `scripts/real-convert-check.mjs` inside headless Chrome, it:
 *   1. builds real source fixtures with WebCodecs + mp4-muxer / MediaRecorder
 *      (H.264+Opus MP4, VP9+Opus WebM, H.264+AAC MP4),
 *   2. runs `analyzeVideoFile` to prove the compatibility decision,
 *   3. runs `convertVideoToTikTok` on the incompatible fixtures,
 *   4. decode-checks every output in the browser,
 *   5. POSTs the files + metadata back to the runner for ffprobe/ffmpeg.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { analyzeVideoFile, convertVideoToTikTok } from "../../src/lib/viz/convert";

const post = (path: string, body: BodyInit) => fetch(path, { method: "POST", body });
const upload = (name: string, blob: Blob) =>
  post(`/upload?name=${encodeURIComponent(name)}`, blob);
const log = (text: string) => void post("/log", text);

/* ── Fixture generation ──────────────────────────────────────────────────── */

function drawPattern(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: number,
): void {
  ctx.fillStyle = `hsl(${(frame * 4) % 360} 70% 35%)`;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.round(width / 12)}px sans-serif`;
  ctx.fillText(`#${frame}`, width * 0.08, height * 0.2);
}

interface FixtureOptions {
  videoCodec: string;
  audio: "aac" | "opus" | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
}

/** Encode a real MP4 fixture with WebCodecs + mp4-muxer. */
async function encodeMp4Fixture(options: FixtureOptions): Promise<Blob> {
  const { width, height, fps, duration, videoCodec, audio } = options;
  const totalFrames = Math.round(duration * fps);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    video: { codec: "avc", width, height },
    ...(audio
      ? { audio: { codec: audio, sampleRate: 48_000, numberOfChannels: 2 } }
      : {}),
  });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false })!;

  let videoError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      videoError = error as Error;
    },
  });
  videoEncoder.configure({
    codec: videoCodec,
    width,
    height,
    bitrate: 8_000_000,
    framerate: fps,
    ...(videoCodec.startsWith("avc") ? { avc: { format: "avc" as const } } : {}),
  });

  for (let i = 0; i < totalFrames; i++) {
    drawPattern(ctx, width, height, i);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (videoEncoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 0));
  }
  await videoEncoder.flush();
  videoEncoder.close();
  if (videoError) throw videoError;

  if (audio) {
    let audioError: Error | null = null;
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (error) => {
        audioError = error as Error;
      },
    });
    audioEncoder.configure({
      codec: audio === "aac" ? "mp4a.40.2" : "opus",
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 192_000,
    });
    const unit = 48_000;
    const tone = new Float32Array(unit * 2);
    for (let i = 0; i < unit; i++) {
      const value = Math.sin((2 * Math.PI * 440 * i) / 48_000) * 0.3;
      tone[i] = value;
      tone[unit + i] = value;
    }
    const totalSamples = Math.ceil(duration * 48_000);
    for (let offset = 0; offset < totalSamples; offset += unit) {
      const count = Math.min(unit, totalSamples - offset);
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: 48_000,
        numberOfFrames: count,
        numberOfChannels: 2,
        timestamp: Math.round((offset / 48_000) * 1_000_000),
        data: tone.subarray(0, count * 2),
      });
      audioEncoder.encode(data);
      data.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
    if (audioError) throw audioError;
  }

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  (target as unknown as { buffer: ArrayBuffer | null }).buffer = null;
  return blob;
}

/** Record a real VP9 + Opus WebM fixture with MediaRecorder (real-time). */
async function recordWebmFixture(duration: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const stream = canvas.captureStream(30);

  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  oscillator.frequency.value = 330;
  const destination = audioContext.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);

  const mimeType = "video/webm;codecs=vp9,opus";
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(mimeType)) {
    throw new Error(`MediaRecorder cannot produce ${mimeType}`);
  }
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const time = (performance.now() - start) / 1000;
      drawPattern(ctx, canvas.width, canvas.height, Math.round(time * 30));
      if (time < duration) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  oscillator.stop();
  await audioContext.close();
  return new Blob(chunks, { type: "video/webm" });
}

/* ── Validation ──────────────────────────────────────────────────────────── */

async function decodeCheck(
  blob: Blob,
): Promise<{ width: number; height: number; duration: number; seeked: boolean }> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.src = url;
  try {
    const meta = await new Promise<{ width: number; height: number; duration: number }>(
      (resolve, reject) => {
        video.onloadedmetadata = () =>
          resolve({
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
          });
        video.onerror = () => reject(new Error("output failed to decode"));
      },
    );
    const seeked = await new Promise<boolean>((resolve) => {
      video.onseeked = () => resolve(true);
      video.onerror = () => resolve(false);
      try {
        video.currentTime = Math.min(meta.duration / 2, Math.max(0, meta.duration - 0.05));
      } catch {
        resolve(false);
      }
      setTimeout(() => resolve(false), 8000);
    });
    return { ...meta, seeked };
  } finally {
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

function summarizeAnalysis(result: Awaited<ReturnType<typeof analyzeVideoFile>>) {
  return {
    container: result.info.container,
    fastStart: result.info.fastStart,
    videoCodec: result.info.video?.codec ?? null,
    width: result.width,
    height: result.height,
    fps: result.fps,
    duration: result.durationSeconds,
    hasAudio: result.hasAudio,
    audioSampleRate: result.audioSampleRate,
    audioChannels: result.audioChannels,
    compatible: result.report.compatible,
    actions: result.report.actions,
    summary: result.report.summary,
    reasons: result.report.reasons,
  };
}

function summarizeOutput(result: Awaited<ReturnType<typeof convertVideoToTikTok>>) {
  return {
    filename: result.filename,
    width: result.width,
    height: result.height,
    fps: result.fps,
    durationSeconds: result.durationSeconds,
    hasAudio: result.hasAudio,
    audioWarning: result.audioWarning,
    scaled: result.scaled,
    videoCodec: result.videoCodec,
    bytes: result.blob.size,
  };
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  const outcome: Record<string, unknown> = {};

  await log("encoding fixtures");
  const h264Opus = await encodeMp4Fixture({
    videoCodec: "avc1.640028",
    audio: "opus",
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 2,
  });
  await upload("source-h264-opus.mp4", h264Opus);

  const h264Aac = await encodeMp4Fixture({
    videoCodec: "avc1.640028",
    audio: "aac",
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 2,
  });
  await upload("source-h264-aac.mp4", h264Aac);

  const vp9Opus = await recordWebmFixture(2);
  await upload("source-vp9-opus.webm", vp9Opus);

  await log("analyzing fixtures");
  const fileA = new File([h264Opus], "my-old-video.mp4", { type: "video/mp4" });
  const fileB = new File([vp9Opus], "my-vp9-video.webm", { type: "video/webm" });
  const fileC = new File([h264Aac], "my-new-export.mp4", { type: "video/mp4" });

  outcome.analysisA = summarizeAnalysis(await analyzeVideoFile(fileA));
  outcome.analysisB = summarizeAnalysis(await analyzeVideoFile(fileB));
  outcome.analysisC = summarizeAnalysis(await analyzeVideoFile(fileC));

  await log("converting H.264 + Opus");
  const outA = await convertVideoToTikTok(fileA, { onProgress: () => {} });
  await upload(outA.filename, outA.blob);
  outcome.convertA = { ...summarizeOutput(outA), decode: await decodeCheck(outA.blob) };

  await log("converting VP9 + Opus");
  const outB = await convertVideoToTikTok(fileB, { onProgress: () => {} });
  await upload(outB.filename, outB.blob);
  outcome.convertB = { ...summarizeOutput(outB), decode: await decodeCheck(outB.blob) };

  await post("/done", JSON.stringify(outcome));
}

main().catch(async (error) => {
  await post("/error", String((error as Error)?.stack || error)).catch(() => {});
});
