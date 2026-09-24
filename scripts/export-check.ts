/**
 * Headless export checks for the WebCodecs + mp4-muxer pipeline.
 *
 * `renderVideo` is browser-only, so this harness stubs the WebCodecs globals
 * and the muxer, then drives the *real* pipeline. It verifies the parts that
 * are easy to regress and expensive to discover in a browser:
 *   - exact frame counts for the landscape / portrait / clamped durations
 *   - audio truncation and that audio starts at t=0
 *   - every VideoFrame is closed (no queue leak)
 *   - cancellation aborts cleanly
 *   - the muxer buffer is released after finalize
 *
 * Run with Bun:
 *   bun scripts/export-check.ts
 */
import { mock } from "bun:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { CONTENT_SAFE_AREAS, EXPORT_FORMATS } from "../src/lib/viz/format";
import { defaultSettings, type RenderContext } from "../src/lib/viz/types";

/* ── Mock mp4-muxer (must run before export.ts is imported) ──────────────── */

let muxerVideoChunks = 0;
let muxerAudioChunks = 0;
let lastTarget: { buffer: ArrayBuffer | null } | null = null;
let lastMuxerOptions: Record<string, unknown> | null = null;

class ArrayBufferTarget {
  buffer: ArrayBuffer | null = new ArrayBuffer(16);
}
class Muxer {
  constructor(opts: { target: { buffer: ArrayBuffer | null } }) {
    lastTarget = opts.target;
    lastMuxerOptions = opts as unknown as Record<string, unknown>;
  }
  addVideoChunk() {
    muxerVideoChunks++;
  }
  addAudioChunk() {
    muxerAudioChunks++;
  }
  finalize() {}
}
mock.module("mp4-muxer", () => ({ ArrayBufferTarget, Muxer }));

/* ── WebCodecs / canvas stubs ────────────────────────────────────────────── */

type Call = [string, ...unknown[]];

function makeCtx(log: Call[]): RenderContext["ctx"] {
  const gradient = () => ({ addColorStop() {} });
  const ctx = {
    canvas: null,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineJoin: "miter",
    lineCap: "butt",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as Record<string, unknown>;
  const record = (name: string, args: unknown[]) => log.push([name, ...args]);
  const methods = [
    "save",
    "restore",
    "beginPath",
    "closePath",
    "rect",
    "roundRect",
    "fill",
    "clip",
    "stroke",
    "fillRect",
    "strokeRect",
    "clearRect",
    "moveTo",
    "lineTo",
    "arc",
    "arcTo",
    "quadraticCurveTo",
    "bezierCurveTo",
    "translate",
    "rotate",
    "scale",
    "transform",
    "setTransform",
    "resetTransform",
    "drawImage",
    "fillText",
    "strokeText",
    "putImageData",
    "setLineDash",
  ];
  for (const m of methods) ctx[m] = (...args: unknown[]) => record(m, args);
  ctx["createRadialGradient"] = (...a: unknown[]) => {
    record("createRadialGradient", a);
    return gradient();
  };
  ctx["createLinearGradient"] = (...a: unknown[]) => {
    record("createLinearGradient", a);
    return gradient();
  };
  ctx["createPattern"] = (...a: unknown[]) => {
    record("createPattern", a);
    return { setTransform() {} };
  };
  ctx["createImageData"] = (w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  });
  ctx["getImageData"] = (_x: number, _y: number, w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  });
  ctx["measureText"] = (text: string) => ({ width: String(text).length * 8 });
  return ctx as unknown as RenderContext["ctx"];
}

class StubOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return makeCtx([]);
  }
}

let createdFrames: StubVideoFrame[] = [];
class StubVideoFrame {
  closed = false;
  constructor(
    public source: unknown,
    public init: { timestamp: number; duration: number },
  ) {
    createdFrames.push(this);
  }
  close() {
    this.closed = true;
  }
}

class StubAudioData {
  closed = false;
  constructor(public init: { timestamp: number; numberOfFrames: number }) {}
  close() {
    this.closed = true;
  }
}

let videoEncoded = 0;
let lastVideoConfig: Record<string, unknown> | null = null;
let audioEncoded = 0;
let lastAudioConfig: Record<string, unknown> | null = null;
let audioTimestamps: number[] = [];
let firstAudioSamples: number[] = [];
let onVideoEncode: ((index: number) => void) | null = null;
// pickAudioCodec probes with an encoder that it then closes; only encoding
// that happens after that probe is real export audio.
let audioPhase: "probe" | "real" = "probe";

class StubVideoEncoder {
  state = "unconfigured";
  encodeQueueSize = 0;
  constructor(public handlers: { output: (c: unknown, m: unknown) => void; error: (e: unknown) => void }) {}
  static async isConfigSupported(config: Record<string, unknown>) {
    return { supported: true, config };
  }
  configure(config: Record<string, unknown>) {
    this.state = "configured";
    lastVideoConfig = config;
  }
  encode(frame: StubVideoFrame, _opts?: unknown) {
    videoEncoded++;
    onVideoEncode?.(videoEncoded);
    this.handlers.output({ byteLength: 0, copyTo() {} }, undefined);
    void frame;
  }
  async flush() {}
  close() {
    this.state = "closed";
  }
  addEventListener() {}
  removeEventListener() {}
}

class StubAudioEncoder {
  state = "unconfigured";
  encodeQueueSize = 0;
  constructor(public handlers: { output: (c: unknown, m: unknown) => void; error: (e: unknown) => void }) {}
  configure(config: Record<string, unknown>) {
    this.state = "configured";
    lastAudioConfig = config;
  }
  encode(data: StubAudioData) {
    if (audioPhase === "real") {
      if (audioEncoded === 0) {
        const samples = (data.init as { data?: Float32Array }).data;
        firstAudioSamples = samples ? Array.from(samples.slice(0, 8)) : [];
      }
      audioEncoded++;
      audioTimestamps.push(data.init.timestamp);
    }
    this.handlers.output({ byteLength: 0, copyTo() {} }, undefined);
  }
  async flush() {}
  close() {
    this.state = "closed";
    // The codec probe closes its encoder before real encoding begins.
    audioPhase = "real";
  }
  addEventListener() {}
  removeEventListener() {}
}

/**
 * Minimal OfflineAudioContext stand-in used by the resampling test. It reports
 * a buffer at the context's rate, mimicking the browser's resampler.
 */
class StubOfflineAudioContext {
  destination = {};
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {}
  createBufferSource() {
    return {
      buffer: null as unknown,
      connect() {},
      start() {},
    };
  }
  async startRendering() {
    const data = Array.from({ length: this.numberOfChannels }, () =>
      new Float32Array(this.length).fill(0.1),
    );
    return {
      numberOfChannels: this.numberOfChannels,
      sampleRate: this.sampleRate,
      length: this.length,
      duration: this.length / this.sampleRate,
      getChannelData: (c: number) => data[c],
    };
  }
}

(globalThis as unknown as Record<string, unknown>).OffscreenCanvas = StubOffscreenCanvas;
(globalThis as unknown as Record<string, unknown>).VideoFrame = StubVideoFrame;
(globalThis as unknown as Record<string, unknown>).AudioData = StubAudioData;
(globalThis as unknown as Record<string, unknown>).VideoEncoder = StubVideoEncoder;
(globalThis as unknown as Record<string, unknown>).AudioEncoder = StubAudioEncoder;

/* ── Dynamic import after the muxer is mocked ────────────────────────────── */

const { renderVideo } = await import("../src/lib/viz/export");

/* ── Harness ─────────────────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok   ${name}`);
    })
    .catch((error) => {
      failed++;
      console.error(`  FAIL ${name}\n       ${(error as Error).message}`);
    });
}

function makeAudioBuffer(seconds: number, sampleRate = 44_100, channels = 2) {
  const length = Math.ceil(seconds * sampleRate);
  const data = Array.from({ length: channels }, () => new Float32Array(length).fill(0.25));
  return {
    numberOfChannels: channels,
    sampleRate,
    length,
    duration: seconds,
    getChannelData: (c: number) => data[c],
  } as unknown as AudioBuffer;
}

interface RunResult {
  frames: number;
  videoFramesClosed: number;
  videoFramesCreated: number;
  audioEncoded: number;
  firstAudioTimestamp: number | null;
  firstAudioSamples: number[];
  bufferReleased: boolean;
  blobSize: number;
  videoConfig: Record<string, unknown> | null;
  audioConfig: Record<string, unknown> | null;
  muxerOptions: Record<string, unknown> | null;
}

async function run(opts: {
  formatId: "landscape" | "portrait";
  duration: number;
  audioSeconds?: number;
  abortAfter?: number;
}): Promise<RunResult> {
  const format = EXPORT_FORMATS[opts.formatId];
  muxerVideoChunks = 0;
  muxerAudioChunks = 0;
  lastTarget = null;
  lastMuxerOptions = null;
  createdFrames = [];
  videoEncoded = 0;
  audioEncoded = 0;
  audioTimestamps = [];
  firstAudioSamples = [];
  audioPhase = "probe";
  lastVideoConfig = null;
  lastAudioConfig = null;
  onVideoEncode = null;

  const controller = new AbortController();
  if (opts.abortAfter) {
    onVideoEncode = (index) => {
      if (index >= opts.abortAfter!) controller.abort();
    };
  }

  const settings = defaultSettings();
  settings.cta.enabled = true;

  const blob = await renderVideo({
    width: format.width,
    height: format.height,
    fps: format.fps,
    duration: opts.duration,
    maxDuration: format.maxDuration,
    layout: format.layout,
    safe: format.safe,
    bitrate: format.bitrate,
    settings,
    image: null,
    imageWidth: 0,
    imageHeight: 0,
    logo: null,
    logoWidth: 0,
    logoHeight: 0,
    analysis: null,
    audioBuffer: opts.audioSeconds ? makeAudioBuffer(opts.audioSeconds) : null,
    signal: controller.signal,
  });

  return {
    frames: videoEncoded,
    videoFramesClosed: createdFrames.filter((f) => f.closed).length,
    videoFramesCreated: createdFrames.length,
    audioEncoded,
    firstAudioTimestamp: audioTimestamps[0] ?? null,
    firstAudioSamples,
    bufferReleased: lastTarget !== null && lastTarget.buffer === null,
    blobSize: blob.size,
    videoConfig: lastVideoConfig,
    audioConfig: lastAudioConfig,
    muxerOptions: lastMuxerOptions,
  };
}

console.log("\nportrait export");

await check("portrait 15s encodes 450 frames at 30fps", async () => {
  const r = await run({ formatId: "portrait", duration: 15 });
  strictEqual(r.frames, 450);
  strictEqual(r.videoConfig?.["width"], 1080);
  strictEqual(r.videoConfig?.["height"], 1920);
  strictEqual(r.videoConfig?.["framerate"], 30);
});

await check("portrait 30s encodes 900 frames", async () => {
  const r = await run({ formatId: "portrait", duration: 30 });
  strictEqual(r.frames, 900);
});

await check("portrait 60s encodes 1800 frames", async () => {
  const r = await run({ formatId: "portrait", duration: 60 });
  strictEqual(r.frames, 1800);
});

await check("portrait duration > 60 is hard-clamped to 60s", async () => {
  const r = await run({ formatId: "portrait", duration: 120 });
  strictEqual(r.frames, 1800);
});

await check("portrait bitrate is the format bitrate", async () => {
  const r = await run({ formatId: "portrait", duration: 5 });
  strictEqual(r.videoConfig?.["bitrate"], EXPORT_FORMATS.portrait.bitrate);
});

console.log("\nlandscape export");

await check("landscape 45s encodes 1350 frames at 1920x1080", async () => {
  const r = await run({ formatId: "landscape", duration: 45 });
  strictEqual(r.frames, 1350);
  strictEqual(r.videoConfig?.["width"], 1920);
  strictEqual(r.videoConfig?.["height"], 1080);
  strictEqual(r.videoConfig?.["bitrate"], EXPORT_FORMATS.landscape.bitrate);
});

await check("landscape keeps the full track duration", async () => {
  const r = await run({ formatId: "landscape", duration: 200 });
  strictEqual(r.frames, 200 * 30);
});

console.log("\ncodec / container standard");

await check("video is H.264 High L4.0 and muxed as AVC (no VP9/AV1)", async () => {
  const r = await run({ formatId: "portrait", duration: 5, audioSeconds: 5 });
  strictEqual(r.videoConfig?.["codec"], "avc1.640028");
  deepStrictEqual(r.videoConfig?.["avc"], { format: "avc" });
  const video = r.muxerOptions?.["video"] as { codec?: string } | undefined;
  strictEqual(video?.codec, "avc");
});

await check("audio is AAC-LC and muxed as AAC (no Opus)", async () => {
  const r = await run({ formatId: "portrait", duration: 5, audioSeconds: 5 });
  strictEqual(r.audioConfig?.["codec"], "mp4a.40.2");
  const audio = r.muxerOptions?.["audio"] as { codec?: string } | undefined;
  strictEqual(audio?.codec, "aac");
});

await check("container uses fast start metadata", async () => {
  const r = await run({ formatId: "portrait", duration: 5, audioSeconds: 5 });
  const fastStart = r.muxerOptions?.["fastStart"];
  ok(
    fastStart !== null && typeof fastStart === "object",
    "fastStart reserves metadata space",
  );
});

console.log("\naudio");

await check("audio is truncated to the video duration and starts at t=0", async () => {
  const r = await run({ formatId: "portrait", duration: 15, audioSeconds: 100 });
  ok(r.audioEncoded > 0, "audio encoded");
  strictEqual(r.firstAudioTimestamp, 0);
  ok(
    r.firstAudioSamples.some((v) => v !== 0),
    "audio samples are real, not silence",
  );
  // 15s at 44.1kHz in 4096-frame chunks = ceil(661500/4096) = 162 chunks.
  strictEqual(r.audioEncoded, Math.ceil((15 * 44_100) / 4096));
});

await check("audio is resampled to 48 kHz when possible", async () => {
  (globalThis as unknown as Record<string, unknown>).OfflineAudioContext =
    StubOfflineAudioContext;
  try {
    const r = await run({ formatId: "portrait", duration: 2, audioSeconds: 3 });
    strictEqual(r.audioConfig?.["sampleRate"], 48_000);
    // 2s at 48kHz in 4096-frame chunks = ceil(96000/4096) = 24 chunks.
    strictEqual(r.audioEncoded, Math.ceil((2 * 48_000) / 4096));
  } finally {
    delete (globalThis as unknown as Record<string, unknown>).OfflineAudioContext;
  }
});

await check("a short track does not desync the export", async () => {
  const r = await run({ formatId: "portrait", duration: 60, audioSeconds: 8 });
  strictEqual(r.frames, 1800, "video still runs the requested duration");
  strictEqual(r.audioEncoded, Math.ceil((8 * 44_100) / 4096), "audio stops at track end");
});

console.log("\nresources / cancellation");

await check("every VideoFrame is closed (no queue leak)", async () => {
  const r = await run({ formatId: "portrait", duration: 10 });
  strictEqual(r.videoFramesCreated, r.frames);
  strictEqual(r.videoFramesClosed, r.videoFramesCreated);
});

await check("the muxer buffer is released after finalize", async () => {
  const r = await run({ formatId: "portrait", duration: 3 });
  ok(r.bufferReleased, "target.buffer nulled");
  ok(r.blobSize >= 0);
});

await check("cancellation aborts and closes every frame", async () => {
  let aborted = false;
  try {
    await run({ formatId: "portrait", duration: 60, abortAfter: 10 });
  } catch (error) {
    aborted = (error as Error).name === "AbortError";
  }
  ok(aborted, "renderVideo threw AbortError");
  strictEqual(createdFrames.filter((f) => f.closed).length, createdFrames.length);
});

console.log("\nparity");

await check("preview and export share the same safe area source", () => {
  deepStrictEqual(EXPORT_FORMATS.portrait.safe, CONTENT_SAFE_AREAS.portrait);
  deepStrictEqual(EXPORT_FORMATS.landscape.safe, CONTENT_SAFE_AREAS.landscape);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
